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

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 px-4 mb-12">
          
          <a [routerLink]="['/event', id(), 'desk']"
             (click)="setAccess()"
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
             (click)="setAccess()"
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

        <!-- ✅ NEW: Default SPOC Settings (Admin Only) -->
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
  `
})
export class RoleSelectionComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private router = inject(Router);
  private spocRefreshInterval: ReturnType<typeof setInterval> | null = null;

  id = input.required<string>();

  // Computed values for template
  eventName = computed(() => this.dataService.getEventById(this.id())?.name || 'Event Dashboard');
  eventDate = computed(() => this.dataService.getEventById(this.id())?.eventDate || '');

  // Admin state
  isAdmin = signal(false);

  // Default SPOC signals
  defaultSpocName = signal('');
  defaultSpocEmail = signal('');
  defaultSpocSlack = signal('');
  isEditingSpoc = signal(false);

  async ngOnInit() {
    const eventId = this.id();

    // Check if user came from landing page (Admin Console)
    this.isAdmin.set(sessionStorage.getItem('from_landing') === 'true');

    // Set access key for this event (user came from landing page or has legitimate access)
    sessionStorage.setItem(`access_${eventId}`, 'authorized');

    // Try to get from localStorage first
    let event = this.dataService.getEventById(eventId);

    // If not found, fetch from master log
    if (!event) {
      console.log('Event not in localStorage, fetching from master log...');
      event = await this.dataService.getEventFromMasterLog(eventId);
    }

    if (!event) {
      console.error('Event not found');
    } else {
      console.log('✓ Event loaded:', event.name);
      this.defaultSpocName.set(event.defaultSpocName || '');
      this.defaultSpocEmail.set(event.defaultSpocEmail || '');
      this.defaultSpocSlack.set(event.defaultSpocSlack || '');
    }

    // Background refresh: update SPOC fields from backend without blocking render.
    // Skipped if admin is mid-edit to avoid clobbering unsaved changes.
    this.dataService.getEventFromMasterLog(eventId).then(refreshed => {
      if (refreshed && !this.isEditingSpoc()) {
        this.defaultSpocName.set(refreshed.defaultSpocName || '');
        this.defaultSpocEmail.set(refreshed.defaultSpocEmail || '');
        this.defaultSpocSlack.set(refreshed.defaultSpocSlack || '');
      }
    });

    // Re-fetch every 15 min to keep SPOC data fresh; skip if admin is mid-edit
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

  setAccess() {
    // Maintain access authorization when navigating to role-specific pages
    sessionStorage.setItem(`access_${this.id()}`, 'authorized');
  }

  // Updates the event date in real-time
  updateDate(date: string) {
    this.dataService.updateEvent(this.id(), { eventDate: date });
  }

  async saveDefaultSpoc() {
    const eventId = this.id();
    await this.dataService.updateEvent(eventId, {
      defaultSpocName: this.defaultSpocName(),
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