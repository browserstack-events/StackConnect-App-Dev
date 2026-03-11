import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../environments/environment';

export interface AuthSession {
  role: 'desk' | 'spoc';
  spocName?: string;
  loginTime: number;
}

const AUTH_SESSION_KEY = 'sc_auth_session';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

@Injectable({ providedIn: 'root' })
export class AuthService {
  private session = signal<AuthSession | null>(this.loadSession());

  readonly role = computed(() => this.session()?.role ?? null);
  readonly spocName = computed(() => this.session()?.spocName ?? null);
  readonly displayName = computed(() => {
    const s = this.session();
    if (!s) return null;
    return s.role === 'desk' ? 'Registration Desk' : (s.spocName || 'SPOC');
  });

  hasValidSession(requiredRole: 'desk' | 'spoc'): boolean {
    const s = this.session();
    if (!s) return false;
    if (Date.now() - s.loginTime > SESSION_TTL_MS) {
      this.logout();
      return false;
    }
    return s.role === requiredRole;
  }

  async login(
    role: 'desk' | 'spoc',
    passphrase: string,
    spocName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Send as GET with URL params — avoids CORS preflight (OPTIONS) that GAS cannot handle.
      // The GAS backend merges e.parameter (URL params) with postData, so no backend change needed.
      const url = new URL(environment.gasUrl);
      url.searchParams.set('action', 'login');
      url.searchParams.set('role', role);
      url.searchParams.set('passphrase', passphrase);
      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === 'success') {
        const session: AuthSession = {
          role,
          spocName: role === 'spoc' ? (spocName || '') : undefined,
          loginTime: Date.now(),
        };
        this.session.set(session);
        this.saveSession(session);
        return { success: true };
      }
      return { success: false, error: data.error || 'Invalid passphrase' };
    } catch {
      return { success: false, error: 'Connection error. Please try again.' };
    }
  }

  logout() {
    this.session.set(null);
    try { localStorage.removeItem(AUTH_SESSION_KEY); } catch { /* ignore */ }
  }

  private loadSession(): AuthSession | null {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const session: AuthSession = JSON.parse(raw);
      if (Date.now() - session.loginTime > SESSION_TTL_MS) {
        localStorage.removeItem(AUTH_SESSION_KEY);
        return null;
      }
      return session;
    } catch { return null; }
  }

  private saveSession(session: AuthSession) {
    try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  }
}
