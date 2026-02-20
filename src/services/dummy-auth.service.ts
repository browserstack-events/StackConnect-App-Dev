import { Injectable, signal } from '@angular/core';
import { STORAGE_KEYS } from '../constants';

// TODO: Replace this entire service with real authentication once auth is implemented.
// See PLAN.md §2.1 for the recommended authentication direction.
// The "dummy user" below is a placeholder and intentionally contains no real credentials.

export interface DummyUser {
  name: string;
  email: string;
}

@Injectable({
  providedIn: 'root'
})
export class DummyAuthService {
  /** Placeholder user — replaced when real auth is implemented. */
  private readonly DUMMY_USER: DummyUser = {
    name:  'SPOC User',
    email: 'spoc@company.com'
  };

  private loggedIn     = signal<boolean>(false);
  private currentUser  = signal<DummyUser | null>(null);

  constructor() {
    this.loadAuthState();
  }

  isLoggedIn() { return this.loggedIn.asReadonly(); }
  getUser()    { return this.currentUser.asReadonly(); }

  signIn() {
    this.loggedIn.set(true);
    this.currentUser.set(this.DUMMY_USER);
    this.saveAuthState();
  }

  signOut() {
    this.loggedIn.set(false);
    this.currentUser.set(null);
    this.clearAuthState();
  }

  private loadAuthState() {
    try {
      if (typeof localStorage === 'undefined') return;
      if (localStorage.getItem(STORAGE_KEYS.AUTH_STATE) === 'logged_in') {
        this.loggedIn.set(true);
        this.currentUser.set(this.DUMMY_USER);
      }
    } catch (e) {
      console.warn('Could not load auth state from localStorage');
    }
  }

  private saveAuthState() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEYS.AUTH_STATE, 'logged_in');
    } catch (e) {
      console.warn('Could not save auth state to localStorage');
    }
  }

  private clearAuthState() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(STORAGE_KEYS.AUTH_STATE);
    } catch (e) {
      console.warn('Could not clear auth state from localStorage');
    }
  }
}
