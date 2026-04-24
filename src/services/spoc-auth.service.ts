import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../environments/environment';

// ─── Session shape ────────────────────────────────────────────────────────────

interface SpocOAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // Unix ms
  /**
   * User profile fetched from BrowserStack's /oauth2/v3/userinfo endpoint.
   * 'sub' is the stable unique identifier issued by the auth server (OIDC spec).
   */
  user: { sub: string; name: string; email: string; emailVerified: boolean; userId?: number | null };
}

// ─── sessionStorage keys ──────────────────────────────────────────────────────

const SESSION_KEY   = 'sc_spoc_oauth_session';
const STATE_KEY     = 'sc_spoc_oauth_state';
const RETURN_URL_KEY = 'sc_spoc_oauth_return_url';

// BrowserStack OAuth2 Authorization endpoint (frontend redirect only)
const AUTHORIZE_URL = 'https://auth.browserstack.com/oauth2/v2/authorize';

/**
 * Computes the OAuth redirect URI from the current page's base href.
 * This handles localhost, Codespace (ephemeral URLs), and GitHub Pages
 * without needing a hardcoded value in environment.ts.
 *
 * Dev (localhost:3000):           http://localhost:3000/auth-callback.html
 * Codespace (auto URL):           https://<uuid>.app.github.dev/auth-callback.html
 * Production (GitHub Pages):      https://browserstack-events.github.io/StackConnect-App/auth-callback.html
 */
function computeRedirectUri(): string {
  const base = document.querySelector('base');
  if (base?.href) {
    return base.href.replace(/\/$/, '') + '/auth-callback.html';
  }
  return window.location.origin + '/auth-callback.html';
}

// Refresh within 60 s of expiry to avoid mid-session expiry
const REFRESH_BUFFER_MS = 60_000;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SpocAuthService {
  private session = signal<SpocOAuthSession | null>(this.loadSession());

  /** Reactive user info — null when not authenticated */
  readonly user = computed(() => this.session()?.user ?? null);

  /** True when a non-expired OAuth session exists */
  readonly isLoggedIn = computed(() => {
    const s = this.session();
    return s !== null && Date.now() < s.expiresAt;
  });

  // ─── Public auth API ───────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    const s = this.session();
    return s !== null && Date.now() < s.expiresAt;
  }

  /**
   * Returns the current access token if the session is valid, else null.
   * Does NOT automatically refresh — call ensureValidToken() if you want that.
   */
  getAccessToken(): string | null {
    const s = this.session();
    if (!s || Date.now() >= s.expiresAt) return null;
    return s.accessToken;
  }

  /**
   * Returns a valid access token, refreshing automatically if the token
   * is within REFRESH_BUFFER_MS of expiry. Returns null if refresh fails
   * or no session exists.
   */
  async ensureValidToken(): Promise<string | null> {
    const s = this.session();
    if (!s) return null;

    // Still well within validity — return as-is
    if (Date.now() < s.expiresAt - REFRESH_BUFFER_MS) return s.accessToken;

    // Near expiry or expired — try to refresh
    const refreshed = await this.refreshAccessToken();
    return refreshed ? this.session()?.accessToken ?? null : null;
  }

  /**
   * Initiates the BrowserStack OAuth2 Authorization Code flow.
   * Saves returnUrl and a CSRF state nonce to sessionStorage, then
   * redirects the browser to the BrowserStack authorize endpoint.
   */
  startLogin(returnUrl: string): void {
    const state       = this.generateNonce();
    const redirectUri = computeRedirectUri();

    try {
      sessionStorage.setItem(STATE_KEY,      state);
      sessionStorage.setItem(RETURN_URL_KEY, returnUrl);
      sessionStorage.setItem('sc_spoc_oauth_redirect_uri', redirectUri);
    } catch { /* sessionStorage unavailable — proceed anyway */ }

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id',     environment.oauthClientId);
    url.searchParams.set('redirect_uri',  redirectUri);
    url.searchParams.set('scope',         'read');
    url.searchParams.set('state',         state);

    window.location.href = url.toString();
  }

  /**
   * Handles the OAuth callback:
   *  1. Validates CSRF state nonce (and immediately clears it to prevent replay).
   *  2. Exchanges the authorization code for tokens via GAS `auth_exchange`.
   *  3. Explicitly fetches the user's profile from BrowserStack's userinfo endpoint
   *     via GAS `get_userinfo` (sent as POST in body to avoid RFC 6750 query-string violation).
   *  4. Stores the session and returns the saved returnUrl.
   *
   * Note: expires_at is computed client-side from expires_in (server clock skew avoided).
   */
  async handleCallback(code: string, state: string): Promise<string> {
    const savedState  = this.readSessionKey(STATE_KEY);
    const returnUrl   = this.readSessionKey(RETURN_URL_KEY) || '/';
    // Use the exact redirect_uri that was sent in startLogin() — must match BrowserStack's record
    const redirectUri = this.readSessionKey('sc_spoc_oauth_redirect_uri') || computeRedirectUri();

    // CSRF state validation — CRITICAL: clear the nonce immediately after validation
    // to prevent attackers from replaying the callback with the original state value.
    if (!savedState || savedState !== state) {
      throw new Error('OAuth state mismatch. The request may have been tampered with.');
    }
    this.removeSessionKey(STATE_KEY);  // Prevent replay — state is consumed, not reusable

    // Exchange authorization code for tokens (server-side — client secret stays in GAS)
    const exchangeUrl = new URL(environment.gasUrl);
    exchangeUrl.searchParams.set('action',       'auth_exchange');
    exchangeUrl.searchParams.set('code',         code);
    exchangeUrl.searchParams.set('redirect_uri', redirectUri);

    const exchangeResponse = await fetch(exchangeUrl.toString());
    if (!exchangeResponse.ok) throw new Error('Token exchange failed (HTTP ' + exchangeResponse.status + ')');

    // Guard against HTML responses (e.g. stale GAS URL redirecting to Google login)
    const contentType = exchangeResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new Error('Unexpected response from auth server. Check that the GAS deployment URL is correct and deployed as "Anyone can access".');
    }

    const exchangeData = await exchangeResponse.json();
    if (exchangeData.status !== 'success') throw new Error(exchangeData.error || 'Token exchange failed');

    const { access_token, refresh_token, expires_in } = exchangeData;
    const expiresAt = Date.now() + (expires_in || 7200) * 1000;

    // Validate org membership from the JWT payload — instant, no extra network call.
    // BrowserStack embeds group_id in the token's custom user claim; allowed group IDs are listed in allowedGroupIds.
    let jwtPayload: any = {};
    try {
      const b64     = access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      jwtPayload    = JSON.parse(atob(b64));
      console.log('[DEBUG] JWT payload:', JSON.stringify(jwtPayload, null, 2));
      const groupId  = jwtPayload?.user?.group_id;
      const email    = jwtPayload?.user?.email || jwtPayload?.email || '';
      const userId   = jwtPayload?.user?.user_id || '';
      const fullName = jwtPayload?.user?.name
                    || jwtPayload?.name
                    || [jwtPayload?.user?.given_name, jwtPayload?.user?.family_name].filter(Boolean).join(' ')
                    || [jwtPayload?.given_name, jwtPayload?.family_name].filter(Boolean).join(' ')
                    || '';
      console.log('[DEBUG] Extracted | email:', email, '| user_id:', userId, '| group_id:', groupId, '| name:', fullName);

      // Check org gate: allowed group IDs OR email in whitelist
      const allowedGroupIds = [2, 8137053];
      const isGroupMember = allowedGroupIds.includes(groupId);
      const isWhitelisted = environment.spocEmailWhitelist.some(e => e.toLowerCase() === email.toLowerCase());

      if (!isGroupMember && !isWhitelisted) {
        // Log org gate failure to backend
        const reason = isWhitelisted ? 'whitelisted' : 'not authorized';
        this.logLoginFailure(email, groupId, 'Access restricted to authorized users only.');
        throw new Error('Access restricted to authorized users only.');
      }
      // Org gate passed — log successful login (fire-and-forget)
      const authMethod = isGroupMember ? 'BrowserStack group' : 'email whitelist';
      console.log('[DEBUG] Login success | Email:', email, 'User ID:', userId, 'Name:', fullName, 'Auth Method:', authMethod);
      this.logLoginSuccess(email, userId, fullName);
    } catch (e: any) {
      // Extract email and group_id for logging, even on decode errors
      const email   = jwtPayload?.user?.email || jwtPayload?.email || '';
      const groupId = jwtPayload?.user?.group_id || null;

      if (!e.message?.includes('BrowserStack')) {
        // Only log decode/verification errors, not the expected "Access restricted" message
        this.logLoginFailure(email, groupId, e.message || 'Unable to verify organisation membership.');
      }

      throw new Error(e.message?.includes('BrowserStack') ? e.message : 'Unable to verify organisation membership.');
    }

    // Save session immediately — org gate passed, safe to navigate.
    const session: SpocOAuthSession = {
      accessToken:  access_token,
      refreshToken: refresh_token || '',
      expiresAt,
      user: { sub: '', name: '', email: '', emailVerified: false },
    };
    this.saveSession(session);

    this.removeSessionKey(RETURN_URL_KEY);
    this.removeSessionKey('sc_spoc_oauth_redirect_uri');

    // Fetch name/email in the background — does not block navigation.
    const userinfoUrl = new URL(environment.gasUrl);
    userinfoUrl.searchParams.set('action',       'get_userinfo');
    userinfoUrl.searchParams.set('access_token', access_token);
    fetch(userinfoUrl.toString())
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.status === 'success' && d.user) this.saveSession({ ...session, user: d.user }); })
      .catch(() => {});

    return returnUrl;
  }

  /**
   * Refreshes the access token using the stored refresh token.
   * Updates the session on success. Returns false if refresh fails.
   * Computes expiresAt client-side from expires_in to avoid clock skew.
   */
  async refreshAccessToken(): Promise<boolean> {
    const s = this.session();
    if (!s?.refreshToken) return false;

    try {
      const url = new URL(environment.gasUrl);
      url.searchParams.set('action',        'auth_refresh');
      url.searchParams.set('refresh_token', s.refreshToken);

      const response = await fetch(url.toString());
      if (!response.ok) return false;

      const data = await response.json();
      if (data.status !== 'success') return false;

      const expiresAt = Date.now() + (data.expires_in || 7200) * 1000;
      const updated: SpocOAuthSession = {
        ...s,
        accessToken: data.access_token,
        expiresAt,  // Computed client-side from expires_in
      };
      this.saveSession(updated);
      return true;
    } catch {
      return false;
    }
  }

  /** Clears the OAuth session and all related sessionStorage keys. */
  logout(): void {
    this.session.set(null);
    this.removeSessionKey(SESSION_KEY);
    this.removeSessionKey(STATE_KEY);
    this.removeSessionKey(RETURN_URL_KEY);
  }

  /**
   * Logs an OAuth login failure to the backend, capturing the email and group_id
   * for audit trail. This is called when org gate validation fails.
   * Failures are logged asynchronously and do not block the error throw.
   *
   * @param email - User email from JWT payload (or empty string if unavailable)
   * @param groupId - Actual group_id from JWT (should be 2 for BrowserStack, else access denied)
   * @param reason - Failure reason (e.g., "Access restricted to BrowserStack employees.")
   */
  private logLoginFailure(email: string, groupId: any, reason: string): void {
    // Fire-and-forget — don't block the error flow
    fetch(environment.gasUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'log_login_failure',
        email: email || '(unknown)',
        group_id: groupId !== null ? groupId : '(unknown)',
        reason: reason,
      }),
    }).catch(() => {
      // Silently ignore — logging failures should never break the app
      console.warn('[SpocAuthService] Failed to log login failure to backend');
    });
  }

  /**
   * Logs a successful OAuth login to the backend, capturing the email and user ID for audit trail.
   * This is called after org gate validation passes.
   * Logging is asynchronous and does not block the auth flow.
   *
   * @param email - User email from JWT payload (or empty string if unavailable)
   * @param userId - BrowserStack user ID from JWT payload (or empty string if unavailable)
   * @param name - User full name from JWT payload (or empty string if unavailable)
   */
  private logLoginSuccess(email: string, userId: string, name: string): void {
    // Fire-and-forget — don't block the successful auth flow
    console.log('[logLoginSuccess] Sending to', environment.gasUrl, 'with email:', email, 'user_id:', userId, 'name:', name);
    fetch(environment.gasUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'log_login_success',
        email: email || '(unknown)',
        user_id: userId || '(unknown)',
        name: name || '(unknown)',
        role: 'spoc',
      }),
    }).then(r => {
      console.log('[logLoginSuccess] Response status:', r.status);
      return r;
    }).catch((err) => {
      // Silently ignore — logging failures should never break the app
      console.warn('[SpocAuthService] Failed to log login success to backend', err);
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private loadSession(): SpocOAuthSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s: SpocOAuthSession = JSON.parse(raw);
      if (!s.accessToken || !s.expiresAt) return null;
      // Expired sessions are cleared immediately
      if (Date.now() >= s.expiresAt) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch { return null; }
  }

  private saveSession(session: SpocOAuthSession): void {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
    this.session.set(session);
  }

  private readSessionKey(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }

  private removeSessionKey(key: string): void {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  }

  private generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }
}
