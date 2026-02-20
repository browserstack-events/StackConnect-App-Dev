import { ErrorHandler, Injectable, signal } from '@angular/core';

/**
 * Global error handler that catches unhandled Angular errors and surfaces
 * them to the UI via the lastError signal.
 *
 * Register in the app bootstrap providers:
 *   { provide: ErrorHandler, useClass: GlobalErrorHandler }
 *
 * Consume in app.component.ts (or any root component) to show a toast:
 *   errorHandler = inject(GlobalErrorHandler);
 *   // template: @if (errorHandler.lastError()) { ... }
 */
@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {
  readonly lastError = signal<string | null>(null);

  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  handleError(error: any): void {
    // Always log to console for debugging
    console.error('[GlobalErrorHandler]', error);

    const message = error?.message
      ?? (typeof error === 'string' ? error : 'An unexpected error occurred');

    this.lastError.set(message);

    // Auto-clear the visible error after 8 seconds
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => this.lastError.set(null), 8_000);
  }

  dismiss() {
    this.lastError.set(null);
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
  }
}
