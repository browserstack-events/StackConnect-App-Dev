# BrowserStack OAuth2 Login — Implementation Plan

## Context

The admin console (`/#/admin-console`) and SPOC view (`/#/event/:id/spoc`) currently have no real auth (admin console relies on URL obscurity; SPOC uses passphrase via `AuthService`). This plan adds BrowserStack OAuth2 (Authorization Code Flow, confidential client) to protect both routes and the GAS actions they call — without touching desk passphrase auth or public routes.

---

## Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `public/auth-callback.html` | Static redirect bridge: reads `?code=&state=` from query params, forwards into `/#/auth/callback?code=...&state=...` |
| 2 | `src/services/admin-auth.service.ts` | `AdminAuthService` — OAuth2 session management (sessionStorage), login redirect, token exchange, refresh, logout |
| 3 | `src/components/auth-callback.component.ts` | Tiny Angular component mounted at `auth/callback` route — reads code/state, calls `AdminAuthService.handleCallback()`, redirects to saved destination |
| 4 | `src/guards/oauth-guard.ts` | `oauthGuard` — functional CanActivate guard; if no valid OAuth session, saves destination to sessionStorage and redirects to BrowserStack login |

## Files to Modify

| # | File | Change |
|---|------|--------|
| 5 | `angular.json` | Add `"assets": [{ "glob": "**/*", "input": "public", "output": "." }]` to copy `auth-callback.html` to dist root |
| 6 | `src/environments/environment.ts` | Add `oauthClientId` (dev value) and `oauthRedirectUri` (`http://localhost:3000/auth-callback.html`) |
| 7 | `src/environments/environment.prod.ts` | Add `oauthClientId: 'OAUTH_CLIENT_ID_PLACEHOLDER'` and `oauthRedirectUri: 'OAUTH_REDIRECT_URI_PLACEHOLDER'` |
| 8 | `src/app.routes.ts` | Add `auth/callback` route + apply `oauthGuard` to `admin-console` and `event/:id/spoc` |
| 9 | `src/services/data.service.ts` | Inject `AdminAuthService`; attach `Authorization: Bearer <token>` header on protected actions (`update`, `update_event`, `log_event`, `get_all_events`) |
| 10 | `src/components/landing-page.component.ts` | Show logged-in user name + logout button in header; inject `AdminAuthService` |
| 11 | `src/components/spoc-dashboard.component.ts` | When `mode === 'spoc'`: skip the passphrase login overlay (OAuth guard already handles auth), show OAuth user info + logout button |
| 12 | `Code.gs` | Add `auth_exchange`, `auth_refresh` actions + `validateToken()` helper; protect `get_all_events`, `update`, `log_event`, `update_event` |
| 13 | `.github/workflows/deploy.yml` | Add sed replacements for `OAUTH_CLIENT_ID_PLACEHOLDER` and `OAUTH_REDIRECT_URI_PLACEHOLDER` |
| 14 | `CLAUDE.md` | Document new OAuth2 flow, new environment variables, new GAS actions |

---

## Step-by-step Implementation

### Step 1: Static callback bridge — `public/auth-callback.html`

Create `public/` directory and `auth-callback.html`. This file:
- Reads `window.location.search` for `code` and `state` query params
- Redirects to `/#/auth/callback?code=...&state=...` (hash routing)
- Shows a brief "Signing you in..." message while redirecting
- Has no dependencies — pure HTML + vanilla JS

### Step 2: Angular build config — `angular.json`

Add an `assets` array to the build options so `public/auth-callback.html` is copied to the dist root:

```json
"assets": [{ "glob": "**/*", "input": "public", "output": "." }]
```

Location: `projects.app.architect.build.options.assets`

### Step 3: Environment files

**`src/environments/environment.ts`** (dev):
```ts
export const environment = {
  gasUrl: '...',
  oauthClientId: '',           // fill in for local dev testing
  oauthRedirectUri: 'http://localhost:3000/auth-callback.html'
};
```

**`src/environments/environment.prod.ts`**:
```ts
export const environment = {
  gasUrl: 'GAS_URL_PLACEHOLDER',
  oauthClientId: 'OAUTH_CLIENT_ID_PLACEHOLDER',
  oauthRedirectUri: 'OAUTH_REDIRECT_URI_PLACEHOLDER'
};
```

### Step 4: `AdminAuthService` — `src/services/admin-auth.service.ts`

Injectable, `providedIn: 'root'`. Uses Angular Signals (consistent with codebase). All session data in `sessionStorage`.

**Session shape** (stored as JSON under key `sc_oauth_session`):
```ts
interface OAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;       // Unix ms
  user: { name: string; email: string };
}
```

**Key methods:**
- `isAuthenticated(): boolean` — checks sessionStorage for non-expired session
- `getAccessToken(): string | null` — returns token if valid, else null
- `getUserInfo(): { name: string; email: string } | null`
- `startLogin(returnUrl: string)` — saves `returnUrl` to `sessionStorage('sc_oauth_return_url')`, generates `state` nonce (saved to sessionStorage), builds BrowserStack authorize URL with `response_type=code`, `client_id`, `redirect_uri`, `state`, `scope=openid email profile` — then does `window.location.href = authorizeUrl`
- `handleCallback(code: string, state: string): Promise<string>` — validates state matches saved nonce, calls GAS `auth_exchange` action (GET to avoid CORS preflight, same pattern as login), stores session, returns saved `returnUrl`
- `refreshAccessToken(): Promise<boolean>` — calls GAS `auth_refresh`, updates session
- `logout()` — clears sessionStorage keys, redirects to `/#/`

**BrowserStack OAuth2 endpoints** (confirmed):
- Authorize: `https://auth.browserstack.com/oauth2/v2/authorize`
- Token: `https://auth.browserstack.com/oauth2/v2/token` (called server-side by GAS)
- Userinfo: `https://auth.browserstack.com/oauth2/v3/userinfo` (called server-side by GAS)
- JWKS: `https://auth.browserstack.com/oauth2/v2/discovery/keys` (for JWT validation)

**Signals exposed:**
- `user = signal<{ name: string; email: string } | null>(null)` — loaded from sessionStorage on init
- `isLoggedIn = computed(() => this.user() !== null && !this.isExpired())`

### Step 5: OAuth Guard — `src/guards/oauth-guard.ts`

Functional `CanActivateFn`. Injects `AdminAuthService`:
- If `adminAuth.isAuthenticated()` → return `true`
- Else → call `adminAuth.startLogin(currentUrl)` → return `false`

The guard only applies to `admin-console` and `event/:id/spoc`. Does NOT touch desk route.

### Step 6: Auth Callback Component — `src/components/auth-callback.component.ts`

Standalone component at route `auth/callback`. On init:
- Reads `code` and `state` from `ActivatedRoute.queryParams`
- Calls `adminAuth.handleCallback(code, state)`
- On success: `router.navigateByUrl(returnUrl)`
- On error: shows error message with "Try again" link

### Step 7: Route updates — `src/app.routes.ts`

```ts
// ADD:
import { AuthCallbackComponent } from './components/auth-callback.component';
import { oauthGuard } from './guards/oauth-guard';

// NEW ROUTE (before the catch-all):
{ path: 'auth/callback', component: AuthCallbackComponent }

// MODIFY existing routes:
{ path: 'admin-console', component: LandingPageComponent, canActivate: [oauthGuard] }
{ path: 'event/:id/spoc', component: SpocDashboardComponent, data: { mode: 'spoc' }, canActivate: [oauthGuard] }

// UNCHANGED:
{ path: 'event/:id/desk', ... }   // keep as-is (passphrase auth)
{ path: 'event/:id', ... }         // keep public
{ path: 'register/:id', ... }      // keep public
```

### Step 8: DataService — attach Bearer token

Modify `src/services/data.service.ts`:
- Inject `AdminAuthService`
- For protected actions (`get_all_events`, `update`, `log_event`, `update_event`): append `&access_token=<token>` as a URL param on GET requests, or include `access_token` in the POST body
  - **Approach**: Use URL param for GETs (e.g., `get_all_events`), POST body field for POSTs (e.g., `update`, `log_event`, `update_event`) — this avoids CORS preflight (no custom headers)
  - GAS cannot read `Authorization` headers on GET — all requests go through `doGet`/`doPost` which only see URL params and POST body
- The `add` action (walk-in) remains unauthenticated
- The `read`, `metadata`, `get_event` actions remain unauthenticated (used by desk view too)
- Before each protected call, check if token is expired and call `refreshAccessToken()` if needed

### Step 9: SPOC Dashboard changes — `src/components/spoc-dashboard.component.ts`

When `mode === 'spoc'`:
- **Remove the passphrase login overlay** for SPOC mode only (the `oauthGuard` on the route handles auth before the component loads)
- The `showLoginOverlay` signal should check: if mode is `'spoc'` → always false (OAuth guard already enforced); if mode is `'admin'` (desk) → keep existing passphrase overlay logic
- Add OAuth user info display (name, email) and logout button to the SPOC header area
- Inject `AdminAuthService` alongside existing `AuthService`

When `mode === 'admin'` (desk):
- **No changes** — keep the existing passphrase overlay and `AuthService` flow exactly as-is

### Step 10: Landing Page changes — `src/components/landing-page.component.ts`

- Inject `AdminAuthService`
- Display logged-in user info (name/email) and logout button in the page header
- No other functional changes needed (OAuth guard handles auth gating)

### Step 11: GAS Backend — `Code.gs`

**New constants** (top of file):
```javascript
var OAUTH_AUTHORIZE_URL = 'https://auth.browserstack.com/oauth2/v2/authorize';
var OAUTH_TOKEN_URL     = 'https://auth.browserstack.com/oauth2/v2/token';
var OAUTH_USERINFO_URL  = 'https://auth.browserstack.com/oauth2/v3/userinfo';
var OAUTH_JWKS_URL      = 'https://auth.browserstack.com/oauth2/v2/discovery/keys';
```

**New action handlers** (add to the read-actions block in `handleRequest`, before existing routing):

#### `auth_exchange` action:
```
Input: code, redirect_uri (from URL params — GET request)
1. Read OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET from Script Properties
2. POST to OAUTH_TOKEN_URL with grant_type=authorization_code, code, redirect_uri, client_id, client_secret
3. Parse response → { access_token, refresh_token, expires_in }
4. GET OAUTH_USERINFO_URL with Authorization: Bearer access_token
5. Return { status: 'success', access_token, refresh_token, user: { name, email }, expires_at }
```

#### `auth_refresh` action:
```
Input: refresh_token (from URL params — GET request)
1. Read OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET from Script Properties
2. POST to OAUTH_TOKEN_URL with grant_type=refresh_token, refresh_token, client_id, client_secret
3. Return { status: 'success', access_token, expires_at }
```

#### `validateToken(data)` helper — JWKS-based JWT validation:
```
Input: data object (contains access_token from URL param or POST body)
1. If no access_token → return { valid: false, error: 'Missing access token' }
2. Check CacheService: key = 'oauth_valid_' + Utilities.computeDigest(SHA_256, access_token) (first 16 hex chars)
3. If cached → return { valid: true, user: JSON.parse(cached) }
4. Decode the JWT (access_token is a JWT signed with RS256):
   a. Split on '.' → [header, payload, signature]
   b. Base64url-decode header → get `kid` (key ID)
   c. Fetch JWKS from OAUTH_JWKS_URL (cache the JWKS response for 24h in CacheService — keys rotate rarely)
   d. Find the key matching `kid` in the JWKS `keys` array
   e. Verify the RS256 signature using the public key (GAS doesn't have native JWT verify, so use the JWKS modulus/exponent to reconstruct the key and verify — or as a pragmatic fallback, call OAUTH_USERINFO_URL with the token to validate)
   f. Base64url-decode payload → extract `sub`, `email`, `name`, `exp`
   g. Check `exp` > now
5. Cache result for 5 min, return { valid: true, user: { name, email } }
6. On any failure → return { valid: false, error: 'Invalid token' }
```

**Note on GAS JWT verification**: GAS lacks native RSA signature verification. The pragmatic approach is:
- **Primary**: Call the userinfo endpoint with `Authorization: Bearer <token>` — if BrowserStack returns 200 with user info, the token is valid. Cache the result for 5 minutes.
- **Optimization**: Decode the JWT payload (base64) to read `exp` for expiry checks without a network call on cached tokens.
- The JWKS approach would require a third-party library or manual RSA math in GAS, which is fragile. The userinfo call is the recommended approach for GAS.

#### Protect existing actions:
In the write-actions block, **before** the existing `validatePayload()` call:
- For `update`, `log_event`, `update_event`: call `validateToken(data)` — if invalid, return error JSON immediately (before acquiring lock)
- For `get_all_events` (read action): call `validateToken(data)` — if invalid, return error

**Leave unprotected:**
- `add` (walk-in registration) — public
- `read`, `metadata`, `get_event` — public (used by desk and role selection)
- `login` — public (desk passphrase auth)

### Step 12: CI/CD — `.github/workflows/deploy.yml`

Add two more `sed` commands after the existing GAS URL injection:

```yaml
- name: Inject OAuth secrets
  env:
    OAUTH_CLIENT_ID: ${{ secrets.OAUTH_CLIENT_ID }}
    OAUTH_REDIRECT_URI: ${{ secrets.OAUTH_REDIRECT_URI }}
  run: |
    sed -i "s|OAUTH_CLIENT_ID_PLACEHOLDER|${OAUTH_CLIENT_ID}|g" src/environments/environment.prod.ts
    sed -i "s|OAUTH_REDIRECT_URI_PLACEHOLDER|${OAUTH_REDIRECT_URI}|g" src/environments/environment.prod.ts

- name: Verify OAuth injection
  run: |
    if grep -q "OAUTH_CLIENT_ID_PLACEHOLDER" src/environments/environment.prod.ts; then
      echo "ERROR: OAUTH_CLIENT_ID secret not injected."
      exit 1
    fi
    if grep -q "OAUTH_REDIRECT_URI_PLACEHOLDER" src/environments/environment.prod.ts; then
      echo "ERROR: OAUTH_REDIRECT_URI secret not injected."
      exit 1
    fi
    echo "OAuth secrets injected successfully."
```

**Required new GitHub secrets:** `OAUTH_CLIENT_ID`, `OAUTH_REDIRECT_URI`
**Required new GAS Script Properties:** `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`

### Step 13: Update CLAUDE.md

Document the new OAuth2 flow, new services, new routes, new GAS actions, and new environment variables.

---

## Verification

1. **Dev server** (`npm run dev`):
   - Visit `/#/admin-console` → redirected to BrowserStack login (or shows error if no client ID configured)
   - Visit `/#/event/:id/spoc` → same OAuth redirect
   - Visit `/#/event/:id/desk` → existing passphrase overlay, unchanged
   - Visit `/#/register/:id` → walk-in form loads, no auth
   - Visit `/#/event/:id` → role selection loads, no auth

2. **Callback flow**: After BrowserStack login, `auth-callback.html` catches the code and redirects to `/#/auth/callback?code=...&state=...`, which exchanges the code via GAS `auth_exchange` and redirects to the original destination

3. **Session**: OAuth session in `sessionStorage` — closing tab clears it; opening a new tab requires re-login

4. **Token on API calls**: Protected GAS actions receive `access_token` param; GAS validates via userinfo endpoint (cached 5 min)

5. **Build**: `npm run build` succeeds; `auth-callback.html` present in `dist/` root

6. **Desk auth untouched**: `AuthService` file has zero modifications; desk route has no `oauthGuard`
