import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SpocAuthService } from '../services/spoc-auth.service';

/**
 * Handles the BrowserStack OAuth2 callback at `/#/auth/callback`.
 *
 * Flow:
 *  1. auth-callback.html (static bridge) catches the redirect from BrowserStack
 *     and forwards `?code=&state=` into the Angular hash router.
 *  2. This component reads those query params, calls SpocAuthService.handleCallback(),
 *     then navigates to the originally requested destination (saved in sessionStorage).
 *  3. On failure it shows an inline error with a "try again" link.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [RouterLink],
  styles: [`
    @keyframes overlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes modalSlideUp  { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .overlay-enter { animation: overlayFadeIn 0.2s ease-out forwards; }
    .modal-enter   { animation: modalSlideUp  0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
  `],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter">

      <!-- Same backdrop as the login overlay -->
      <div class="absolute inset-0 bg-slate-900/70 backdrop-blur-md"></div>

      <!-- Same card style -->
      <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden modal-enter">

        <div class="h-1 w-full" style="background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)"></div>

        <div class="p-8">

          @if (status() === 'loading') {
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-6 h-6 text-blue-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-bold text-slate-900">Signing you in&hellip;</h2>
                <p class="text-sm text-slate-500 mt-0.5">Completing BrowserStack authentication.</p>
              </div>
            </div>
          }

          @if (status() === 'error') {
            <div class="flex items-center gap-4 mb-6">
              <div class="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z"/>
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-bold text-slate-900">Authentication failed</h2>
                <p class="text-sm text-slate-500 mt-0.5">{{ errorMessage() }}</p>
              </div>
            </div>
            <div class="space-y-2">
              <button (click)="retryLogin()"
                 class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold tracking-wide transition-all flex items-center justify-center shadow-sm active:scale-95">
                Try again
              </button>
              <a [routerLink]="['/admin-console']"
                 class="w-full py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium transition-all flex items-center justify-center active:scale-95">
                Back to Admin Console
              </a>
            </div>
          }

        </div>
      </div>
    </div>
  `
})
export class AuthCallbackComponent implements OnInit {
  status        = signal<'loading' | 'error'>('loading');
  errorMessage  = signal('An unexpected error occurred. Please try again.');
  private returnUrl = '/';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private spocAuth: SpocAuthService
  ) {}

  ngOnInit(): void {
    // Capture returnUrl now — handleCallback clears it on success but leaves it on failure.
    this.returnUrl = sessionStorage.getItem('sc_spoc_oauth_return_url') || '/';

    this.route.queryParams.subscribe(async params => {
      const code  = params['code']  as string | undefined;
      const state = params['state'] as string | undefined;

      if (!code) {
        this.showError('No authorization code was returned by BrowserStack.');
        return;
      }

      try {
        const returnUrl = await this.spocAuth.handleCallback(code, state ?? '');
        await this.router.navigateByUrl(returnUrl);
      } catch (err: any) {
        this.showError(err?.message ?? 'Token exchange failed. Please try again.');
      }
    });
  }

  retryLogin(): void {
    this.spocAuth.startLogin(this.returnUrl);
  }

  private showError(message: string): void {
    this.errorMessage.set(message);
    this.status.set('error');
  }
}
