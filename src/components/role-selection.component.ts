import { Component, inject, input, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { SYNC_CONFIG } from '../constants';

@Component({
  selector: 'app-role-selection',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  styles: [`
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
  template: `
    <div class="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">

      <div class="w-full max-w-6xl z-10">

        <!-- Admin health banners -->
        @if (isAdmin() && warnings().length > 0) {
          <div class="mb-8 space-y-2">
            @for (warning of warnings(); track warning.id; let i = $index) {
              <div
                class="flex items-start gap-3 px-4 py-3 rounded-xl border-l-4 text-sm font-medium"
                [class]="warning.severity === 'error'
                  ? 'bg-red-50 border-red-500 text-red-800'
                  : 'bg-amber-50 border-amber-400 text-amber-800'"
                [style.animation]="'slideDown 0.25s ease both'"
                [style.animation-delay]="(i * 40) + 'ms'"
              >
                @if (warning.severity === 'error') {
                  <svg class="w-5 h-5 mt-0.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                } @else {
                  <svg class="w-5 h-5 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                }
                <span class="flex-1 leading-relaxed" [innerHTML]="warning.message"></span>
                <button
                  (click)="dismiss(warning.id)"
                  class="ml-2 shrink-0 text-lg leading-none transition-opacity opacity-50 hover:opacity-100"
                  title="Dismiss"
                >×</button>
              </div>
            }
          </div>
        }

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

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 px-4 mb-12">

          <a [routerLink]="['/event', id(), 'desk']"
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
          </a>

          <a [routerLink]="['/event', id(), 'spoc']"
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
          </a>

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
                    <p class="text-slate-900 font-bold truncate" [title]="defaultSlackMemberId() || ''">{{ defaultSlackMemberId() || 'Not set' }}</p>
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
                            [ngModel]="defaultSlackMemberId()"
                            (ngModelChange)="defaultSlackMemberId.set($event)"
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
  `
})
export class RoleSelectionComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private router = inject(Router);
  private spocRefreshInterval: ReturnType<typeof setInterval> | null = null;

  id = input.required<string>();

  eventName = computed(() => this.dataService.getEventById(this.id())?.name || 'Event Dashboard');
  eventDate = computed(() => this.dataService.getEventById(this.id())?.eventDate || '');

  isAdmin = signal(false);

  defaultSpocName  = signal('');
  defaultSpocEmail = signal('');
  defaultSlackMemberId = signal('');
  isEditingSpoc    = signal(false);

  // ── Alert system ──────────────────────────────────────────────────────────
  private missingColumns  = signal<string[]>([]);
  private columnCheckDone = signal(false);
  private dismissTick     = signal(0);
  private dismissedWarnings = new Set<string>();

  warnings = computed(() => {
    this.dismissTick(); // establish reactive dependency for dismiss()

    if (!this.isAdmin()) return [];

    const event = this.dataService.getEventById(this.id());
    if (!event) return [];

    type Severity = 'error' | 'warning';
    const list: Array<{ id: string; severity: Severity; message: string }> = [];

    // 1. Missing sheet URL
    if (!event.sheetUrl) {
      list.push({ id: 'missing-sheet', severity: 'error',
        message: 'No Google Sheet is linked to this event. Attendee data cannot be loaded.' });
    }

    // 2. Missing required columns (only after async check completes to avoid flash)
    if (this.columnCheckDone() && this.missingColumns().length > 0) {
      const cols = this.missingColumns()
        .map(c => `<code class="bg-red-100 rounded px-1 font-mono text-xs">${c}</code>`)
        .join(', ');
      list.push({ id: 'missing-columns', severity: 'error',
        message: `Attendee sheet is missing required columns: ${cols}. Add these to prevent data errors.` });
    }

    // 3. Missing default SPOC — urgent (red) within 12 hrs of event, amber otherwise
    const spocMissing = !this.defaultSpocName() || !this.defaultSpocEmail();
    if (spocMissing) {
      const isUrgent = (() => {
        if (!event.eventDate) return false;
        const eventMs    = new Date(event.eventDate + 'T00:00:00').getTime();
        const hoursUntil = (eventMs - Date.now()) / 3_600_000;
        return hoursUntil <= 12;
      })();
      list.push(isUrgent
        ? { id: 'missing-spoc-urgent', severity: 'error',
            message: 'No default SPOC is configured and the event is imminent. Walk-in attendees won\'t be auto-assigned.' }
        : { id: 'missing-spoc', severity: 'warning',
            message: 'No default SPOC configured. Walk-in attendees won\'t be assigned to a SPOC automatically.' }
      );
    }

    // 4. Missing event date
    if (!event.eventDate) {
      list.push({ id: 'missing-date', severity: 'warning',
        message: 'Event date is not set. Check-in emails and walk-in forms may show incorrect dates.' });
    }

    // 5. Archived / Deleted event
    if (event.state === 'Archived' || event.state === 'Deleted') {
      list.push({ id: 'event-archived', severity: 'warning',
        message: `This event is marked as ${event.state}. You may be viewing stale or inactive data.` });
    }

    return list.filter(w => !this.dismissedWarnings.has(w.id));
  });

  dismiss(id: string) {
    this.dismissedWarnings.add(id);
    this.dismissTick.update(n => n + 1);
  }

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
      this.defaultSlackMemberId.set(event.defaultSlackMemberId || '');
    }

    this.dataService.getEventFromMasterLog(eventId).then(refreshed => {
      if (refreshed && !this.isEditingSpoc()) {
        this.defaultSpocName.set(refreshed.defaultSpocName || '');
        this.defaultSpocEmail.set(refreshed.defaultSpocEmail || '');
        this.defaultSlackMemberId.set(refreshed.defaultSlackMemberId || '');
      }
    });

    this.spocRefreshInterval = setInterval(async () => {
      if (this.isEditingSpoc()) return;
      const refreshed = await this.dataService.getEventFromMasterLog(eventId);
      if (refreshed) {
        this.defaultSpocName.set(refreshed.defaultSpocName || '');
        this.defaultSpocEmail.set(refreshed.defaultSpocEmail || '');
        this.defaultSlackMemberId.set(refreshed.defaultSlackMemberId || '');
      }
    }, SYNC_CONFIG.EVENT_REFRESH_INTERVAL_MS);

    // Kick off column check for admin health banners
    if (this.isAdmin()) {
      const sheetUrl = event?.sheetUrl || this.dataService.getEventById(eventId)?.sheetUrl || '';
      if (sheetUrl) {
        this.dataService.checkColumns(sheetUrl).then(missing => {
          this.missingColumns.set(missing);
          this.columnCheckDone.set(true);
        });
      } else {
        // No sheet URL — column check is moot, mark done so missing-sheet banner shows immediately
        this.columnCheckDone.set(true);
      }
    }
  }

  ngOnDestroy() {
    if (this.spocRefreshInterval !== null) {
      clearInterval(this.spocRefreshInterval);
    }
  }

  updateDate(date: string) {
    this.dataService.updateEvent(this.id(), { eventDate: date });
  }

  async saveDefaultSpoc() {
    await this.dataService.updateEvent(this.id(), {
      defaultSpocName:  this.defaultSpocName(),
      defaultSpocEmail: this.defaultSpocEmail(),
      defaultSlackMemberId: this.defaultSlackMemberId()
    });
    this.isEditingSpoc.set(false);
  }

  cancelEditSpoc() {
    const event = this.dataService.getEventById(this.id());
    if (event) {
      this.defaultSpocName.set(event.defaultSpocName || '');
      this.defaultSpocEmail.set(event.defaultSpocEmail || '');
      this.defaultSlackMemberId.set(event.defaultSlackMemberId || '');
    }
    this.isEditingSpoc.set(false);
  }
}
