import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GlobalErrorHandler } from './services/global-error-handler';
import { DataService } from './services/data.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  template: `
    <router-outlet />

    <!-- Global error toast — shown when an unhandled Angular error occurs -->
    @if (errorHandler.lastError()) {
      <div
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3
               bg-red-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg
               max-w-sm w-full mx-4"
        role="alert"
      >
        <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="flex-1 truncate">{{ errorHandler.lastError() }}</span>
        <button (click)="errorHandler.dismiss()" class="text-white/80 hover:text-white flex-shrink-0">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    }

    <!-- Sync warning banner — shown when pending writes haven't reached the backend -->
    @if (dataService.syncError()) {
      <div
        class="fixed bottom-4 right-4 z-[9998] flex items-center gap-2
               bg-amber-500 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-md
               max-w-xs"
        role="status"
      >
        <svg class="w-4 h-4 flex-shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>Sync pending — will retry on next refresh</span>
      </div>
    }
  `
})
export class AppComponent {
  errorHandler = inject(GlobalErrorHandler);
  dataService  = inject(DataService);
}
