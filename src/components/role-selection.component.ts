import { Component, inject, input, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { AuthService } from '../services/auth.service';
import { SYNC_CONFIG } from '../constants';

@Component({
  selector: 'app-role-selection',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  styles: [`
    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes modalSlideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
    .overlay-enter { animation: overlayFadeIn 0.2s ease-out forwards; }
    .modal-enter   { animation: modalSlideUp  0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
  `],
  template: `
    <div class="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">

      <div class="w-full max-w-6xl z-10">

        <div class="text-center mb-16 relative">
          <h1 class="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-3">{{ eventName() }}</h1>

          <div class="flex items-center justify-center gap-2 mb-4">
             <input type="date"
                    [ngModel]="eventDate()"
                    (ngModelChange)="updateDate($event)"
                    class="bg-transparent border-b border-gray-300 focus:border-teal-500 outline-none text-slate-500 font-medium text-sm text-center w-auto cursor-pointer hover:border-gray-400 transition-colors"
                    title="Set Event Date">
          </div>

          <p class="text-lg text-slate-500 font-medium">Select your role to access the dashboard</p>

          <a routerLink="/admin-console" class="inline-flex items-center gap-2 mt-6 text-teal-600 font-semibold hover:text-teal-700 transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Events
          </a>
        </div>

        <!-- Role Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 px-4 mb-12">

          <!-- Registration Desk Card -->
          <button (click)="openLogin('desk')"
             class="group bg-white rounded-2xl p-8 border border-gray-200 hover:border-teal-500 hover:shadow-lg transition-all duration-300 flex flex-col items-center text-center h-full cursor-pointer relative overflow-hidden">
             <div class="w-24 h-24 rounded-full bg-teal-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 group-hover:bg-teal-100">
               <svg class="w-10 h-10 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                 <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                 <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
               </svg>
             </div>
             <h3 class="text-2xl font-bold text-slate-900 mb-3">Registration Desk</h3>
             <p class="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
               Fast check-in mode. Access to all attendees and status management.
             </p>
          </button>

          <!-- Sales SPOC Card -->
          <button (click)="openLogin('spoc')"
             class="group bg-white rounded-2xl p-8 border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all duration-300 flex flex-col items-center text-center h-full cursor-pointer relative overflow-hidden">
             <div class="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 group-hover:bg-blue-100">
               <svg class="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                 <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
               </svg>
             </div>
             <h3 class="text-2xl font-bold text-slate-900 mb-3">Sales SPOC</h3>
             <p class="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
               View your assigned attendees, track arrivals, and manage notes.
             </p>
          </button>

          <!-- Walk-in Card (public — no auth) -->
          <a [routerLink]="['/register', id()]"
             class="group bg-white rounded-2xl p-8 border border-gray-200 hover:border-purple-500 hover:shadow-lg transition-all duration-300 flex flex-col items-center text-center h-full cursor-pointer relative overflow-hidden">
             <div class="w-24 h-24 rounded-full bg-purple-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 group-hover:bg-purple-100">
               <svg class="w-10 h-10 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                 <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
               </svg>
             </div>
             <h3 class="text-2xl font-bold text-slate-900 mb-3">Walk-in</h3>
             <p class="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
               Register new attendees instantly on-site for immediate access.
             </p>
          </a>

        </div>

        <!-- Default SPOC Settings (Admin Only) -->
        @if (isAdmin()) {
          <div class="max-w-2xl mx-auto">
            <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
              <div class="flex items-center justify-between mb-6">
                <div>
                  <h3 class="text-xl font-bold text-slate-900">Default SPOC Settings</h3>
                  <p class="text-sm text-slate-500">New walk-ins will be automatically assigned to this SPOC</p>
                </div>
                @if (!isEditingSpoc()) {
                  <button (click)="isEditingSpoc.set(true)"
                          class="bg-teal-50 text-teal-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-teal-100 transition-colors">
                    Edit
                  </button>
                }
              </div>

              @if (!isEditingSpoc()) {
                <div class="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-6">
                  <div class="min-w-0">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Name</span>
                    <p class="text-slate-900 font-bold truncate" [title]="defaultSpocName() || ''">{{ defaultSpocName() || 'Not set' }}</p>
                  </div>
                  <div class="min-w-0">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email</span>
                    <p class="text-slate-900 font-bold truncate" [title]="defaultSpocEmail() || ''">{{ defaultSpocEmail() || 'Not set' }}</p>
                  </div>
                  <div class="min-w-0">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Slack ID</span>
                    <p class="text-slate-900 font-bold truncate" [title]="defaultSpocSlack() || ''">{{ defaultSpocSlack() || 'Not set' }}</p>
                  </div>
                </div>
              } @else {
                <div class="space-y-6">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="space-y-1.5">
                      <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Name</label>
                      <input type="text"
                            [ngModel]="defaultSpocName()"
                            (ngModelChange)="defaultSpocName.set($event)"
                            placeholder="SPOC Name"
                            class="w-full px-4 py-3 bg-slate-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white focus:border-transparent outline-none transition-all shadow-sm" />
                    </div>
                    <div class="space-y-1.5">
                      <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                      <input type="email"
                            [ngModel]="defaultSpocEmail()"
                            (ngModelChange)="defaultSpocEmail.set($event)"
                            placeholder="SPOC Email"
                            class="w-full px-4 py-3 bg-slate-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white focus:border-transparent outline-none transition-all shadow-sm" />
                    </div>
                    <div class="space-y-1.5">
                      <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Slack ID</label>
                      <input type="text"
                            [ngModel]="defaultSpocSlack()"
                            (ngModelChange)="defaultSpocSlack.set($event)"
                            placeholder="SPOC Slack"
                            class="w-full px-4 py-3 bg-slate-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white focus:border-transparent outline-none transition-all shadow-sm" />
                    </div>
                  </div>
                  <div class="flex flex-col sm:flex-row gap-3">
                    <button (click)="saveDefaultSpoc()"
                            class="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-all active:scale-95">
                      Save Settings
                    </button>
                    <button (click)="cancelEditSpoc()"
                            class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold transition-all active:scale-95">
                      Cancel
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        }

      </div>
    </div>

    <!-- ── Login Modal Overlay ─────────────────────────────────────────────── -->
    @if (activeForm()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter">

        <!-- Translucent blurred backdrop -->
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" (click)="onCloseLogin()"></div>

        <!-- Modal card -->
        <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden modal-enter"
             (click)="$event.stopPropagation()">

          <!-- Gradient header strip -->
          <div class="h-1 w-full"
               [style.background]="activeForm() === 'desk'
                 ? 'linear-gradient(90deg, #0d9488, #14b8a6, #0ea5e9)'
                 : 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)'">
          </div>

          <!-- Close button -->
          <button (click)="onCloseLogin()"
                  class="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div class="p-8 pt-7">

            <!-- Icon + Title -->
            <div class="flex items-center gap-4 mb-6">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                   [class.bg-teal-50]="activeForm() === 'desk'"
                   [class.bg-blue-50]="activeForm() === 'spoc'">
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                     [class.text-teal-600]="activeForm() === 'desk'"
                     [class.text-blue-600]="activeForm() === 'spoc'">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-bold text-slate-900">
                  {{ activeForm() === 'desk' ? 'Registration Desk' : 'Sales SPOC' }}
                </h2>
                <p class="text-sm text-slate-500 mt-0.5">
                  {{ activeForm() === 'desk'
                      ? 'Enter the desk passphrase to continue'
                      : 'Enter your name and passphrase to continue' }}
                </p>
              </div>
            </div>

            <!-- Form fields -->
            <div class="space-y-3">

              <!-- SPOC name (SPOC variant only) -->
              @if (activeForm() === 'spoc') {
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input type="text"
                         [ngModel]="spocNameInput()"
                         (ngModelChange)="spocNameInput.set($event)"
                         placeholder="Your Name"
                         autocomplete="name"
                         class="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              }

              <!-- Passphrase -->
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <input type="password"
                       [ngModel]="passphraseInput()"
                       (ngModelChange)="passphraseInput.set($event)"
                       placeholder="Passphrase"
                       autocomplete="current-password"
                       (keyup.enter)="onSubmitLogin()"
                       class="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all focus:border-transparent"
                       [class.focus:ring-teal-500]="activeForm() === 'desk'"
                       [class.focus:ring-blue-500]="activeForm() === 'spoc'" />
              </div>

              <!-- Error banner -->
              @if (loginError()) {
                <div class="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                  <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ loginError() }}
                </div>
              }

              <!-- Submit button -->
              <button (click)="onSubmitLogin()"
                      [disabled]="isLoggingIn()"
                      class="w-full mt-1 py-3 rounded-xl text-white text-sm font-bold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                      [class.bg-teal-600]="activeForm() === 'desk'"
                      [class.hover:bg-teal-700]="activeForm() === 'desk' && !isLoggingIn()"
                      [class.active:scale-95]="!isLoggingIn()"
                      [class.bg-blue-600]="activeForm() === 'spoc'"
                      [class.hover:bg-blue-700]="activeForm() === 'spoc' && !isLoggingIn()">
                @if (isLoggingIn()) {
                  <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verifying…
                } @else {
                  Access Dashboard
                }
              </button>

            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class RoleSelectionComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private spocRefreshInterval: ReturnType<typeof setInterval> | null = null;

  id = input.required<string>();

  eventName = computed(() => this.dataService.getEventById(this.id())?.name || 'Event Dashboard');
  eventDate = computed(() => this.dataService.getEventById(this.id())?.eventDate || '');

  isAdmin = signal(false);

  defaultSpocName  = signal('');
  defaultSpocEmail = signal('');
  defaultSpocSlack = signal('');
  isEditingSpoc    = signal(false);

  // Login modal state
  activeForm    = signal<'desk' | 'spoc' | null>(null);
  passphraseInput = signal('');
  spocNameInput   = signal('');
  loginError      = signal('');
  isLoggingIn     = signal(false);

  async ngOnInit() {
    const eventId = this.id();

    this.isAdmin.set(sessionStorage.getItem('from_landing') === 'true');

    let event = this.dataService.getEventById(eventId);
    if (!event) {
      event = await this.dataService.getEventFromMasterLog(eventId);
    }

    if (event) {
      this.defaultSpocName.set(event.defaultSpocName || '');
      this.defaultSpocEmail.set(event.defaultSpocEmail || '');
      this.defaultSpocSlack.set(event.defaultSpocSlack || '');
    }

    this.dataService.getEventFromMasterLog(eventId).then(refreshed => {
      if (refreshed && !this.isEditingSpoc()) {
        this.defaultSpocName.set(refreshed.defaultSpocName || '');
        this.defaultSpocEmail.set(refreshed.defaultSpocEmail || '');
        this.defaultSpocSlack.set(refreshed.defaultSpocSlack || '');
      }
    });

    this.spocRefreshInterval = setInterval(async () => {
      if (this.isEditingSpoc()) return;
      const refreshed = await this.dataService.getEventFromMasterLog(eventId);
      if (refreshed) {
        this.defaultSpocName.set(refreshed.defaultSpocName || '');
        this.defaultSpocEmail.set(refreshed.defaultSpocEmail || '');
        this.defaultSpocSlack.set(refreshed.defaultSpocSlack || '');
      }
    }, SYNC_CONFIG.EVENT_REFRESH_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.spocRefreshInterval !== null) {
      clearInterval(this.spocRefreshInterval);
    }
  }

  openLogin(role: 'desk' | 'spoc') {
    this.activeForm.set(role);
    this.passphraseInput.set('');
    this.spocNameInput.set('');
    this.loginError.set('');
  }

  onCloseLogin() {
    this.activeForm.set(null);
    this.loginError.set('');
    this.isLoggingIn.set(false);
  }

  async onSubmitLogin() {
    const role = this.activeForm();
    if (!role || this.isLoggingIn()) return;

    const passphrase = this.passphraseInput().trim();
    const spocName   = this.spocNameInput().trim();

    if (!passphrase) {
      this.loginError.set('Please enter a passphrase.');
      return;
    }
    if (role === 'spoc' && !spocName) {
      this.loginError.set('Please enter your name.');
      return;
    }

    this.loginError.set('');
    this.isLoggingIn.set(true);

    const result = await this.authService.login(role, passphrase, spocName);
    this.isLoggingIn.set(false);

    if (result.success) {
      const path = role === 'desk' ? 'desk' : 'spoc';
      this.router.navigate(['/event', this.id(), path]);
    } else {
      this.loginError.set(result.error || 'Authentication failed.');
    }
  }

  updateDate(date: string) {
    this.dataService.updateEvent(this.id(), { eventDate: date });
  }

  async saveDefaultSpoc() {
    await this.dataService.updateEvent(this.id(), {
      defaultSpocName:  this.defaultSpocName(),
      defaultSpocEmail: this.defaultSpocEmail(),
      defaultSpocSlack: this.defaultSpocSlack()
    });
    this.isEditingSpoc.set(false);
  }

  cancelEditSpoc() {
    const event = this.dataService.getEventById(this.id());
    if (event) {
      this.defaultSpocName.set(event.defaultSpocName || '');
      this.defaultSpocEmail.set(event.defaultSpocEmail || '');
      this.defaultSpocSlack.set(event.defaultSpocSlack || '');
    }
    this.isEditingSpoc.set(false);
  }
}
