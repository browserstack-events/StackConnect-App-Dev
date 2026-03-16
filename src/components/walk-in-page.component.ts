import { Component, inject, input, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, validateWalkInData } from '../services/data.service';
import { Router } from '@angular/router';
import { SYNC_CONFIG } from '../constants';

@Component({
  selector: 'app-walk-in-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div class="text-center mb-6">
          <div class="text-4xl mb-3">🚶</div>
          <h1 class="text-3xl font-bold text-gray-800 mb-2">Walk-in Registration</h1>
          <p class="text-gray-600">{{ eventName() }}</p>
        </div>

        @if (errorMessage()) {
          <div class="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm" role="alert">
            <div class="flex items-center gap-2 text-red-700">
              <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="font-bold">Registration Error</p>
            </div>
            <p class="text-sm text-red-600 mt-1 ml-7">{{ errorMessage() }}</p>
          </div>
        }

        @if (!submitted()) {
          <form (ngSubmit)="onSubmit()" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                [(ngModel)]="fullName"
                name="fullName"
                required
                (input)="errorMessage.set('')"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                [(ngModel)]="email"
                name="email"
                required
                (input)="errorMessage.set('')"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="john@company.com"
              />
              <p class="text-xs text-gray-500 mt-1">Please use your corporate email address.</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Company *</label>
              <input
                type="text"
                [(ngModel)]="company"
                name="company"
                required
                (input)="errorMessage.set('')"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Acme Inc"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
              <input
                type="tel"
                [(ngModel)]="contact"
                name="contact"
                (input)="errorMessage.set('')"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="+1 234 567 8900"
              />
              <p class="text-xs text-gray-500 mt-1">Please include country code (e.g. +1, +91)</p>
            </div>

            <button
              type="submit"
              [disabled]="submitting() || !fullName().trim() || !email().trim() || !company().trim()"
              class="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition text-lg"
            >
              {{ submitting() ? 'Submitting...' : 'Register' }}
            </button>
          </form>
        } @else {
          <!-- Success + Badge Card -->
          <div class="text-center py-4">
            <div class="text-5xl mb-3">✅</div>
            <h2 class="text-xl font-bold text-green-600 mb-1">Registration Successful!</h2>
            <p class="text-sm text-gray-500 mb-5">
              Show the card below at the <span class="font-semibold text-gray-700">Admin Desk</span> to collect your ID badge.
            </p>

            <!-- Badge Card -->
            <div class="border-2 border-dashed border-purple-300 rounded-xl bg-purple-50 px-6 py-7 mb-5 text-left">
              <p class="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 text-center">
                🪪 Your Entry Pass
              </p>
              <p class="text-2xl font-extrabold text-gray-900 leading-snug break-words text-center">
                {{ registeredAttendee()?.fullName }}
              </p>
              <p class="text-base font-semibold text-purple-700 mt-1 break-words text-center">
                {{ registeredAttendee()?.company }}
              </p>
              @if (registeredAttendee()?.lanyardColor) {
                <div class="mt-5 flex flex-wrap justify-center gap-2">
                  <span class="inline-flex items-center gap-2 bg-gray-100 text-gray-800 text-xs font-bold px-4 py-1.5 rounded-full border border-gray-300">
                    <span class="w-2.5 h-2.5 rounded-full ring-1 ring-black/10"
                          [style.backgroundColor]="lanyardDotColor(registeredAttendee()!.lanyardColor)"></span>
                    {{ registeredAttendee()!.lanyardColor }} Lanyard
                  </span>
                  @if (registeredAttendee()?.nameCardColor) {
                    <span class="inline-flex items-center gap-2 bg-gray-100 text-gray-800 text-xs font-bold px-4 py-1.5 rounded-full border border-gray-300">
                      <span class="w-2.5 h-2.5 ring-1 ring-black/10"
                            [style.backgroundColor]="lanyardDotColor(registeredAttendee()!.nameCardColor)"></span>
                      {{ registeredAttendee()!.nameCardColor }} Name Card
                    </span>
                  }
                </div>
              }
            </div>

            <button
              (click)="reset()"
              class="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition"
            >
              Register Another Attendee
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: []
})
export class WalkInPageComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private router      = inject(Router);
  private eventRefreshInterval: ReturnType<typeof setInterval> | null = null;

  id = input.required<string>();

  fullName     = signal('');
  email        = signal('');
  company      = signal('');
  contact      = signal('');
  submitted    = signal(false);
  submitting   = signal(false);
  errorMessage = signal('');
  eventName    = signal('Event');

  registeredAttendee = signal<{ fullName: string; company: string; lanyardColor: string; nameCardColor: string } | null>(null);

  private currentEvent: any = null;

  async ngOnInit() {
    const eventId = this.id();
    let event = this.dataService.getEventById(eventId);

    if (!event) {
      event = await this.dataService.getEventFromMasterLog(eventId) ?? undefined;
    }

    if (!event) {
      this.eventName.set('Event Not Found');
      this.errorMessage.set('Event not found. Please contact the event organizer.');
      return;
    }

    this.currentEvent = event;
    this.eventName.set(event.name);
    this.dataService.sheetName.set(event.name);

    // Background refresh: update currentEvent with latest SPOC fields without blocking render
    this.dataService.getEventFromMasterLog(eventId).then(refreshed => {
      if (refreshed) this.currentEvent = refreshed;
    });

    // Keep currentEvent fresh on shared/kiosk devices left open for extended periods
    this.eventRefreshInterval = setInterval(async () => {
      const refreshed = await this.dataService.getEventFromMasterLog(eventId);
      if (refreshed) this.currentEvent = refreshed;
    }, SYNC_CONFIG.EVENT_REFRESH_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.eventRefreshInterval !== null) {
      clearInterval(this.eventRefreshInterval);
    }
  }

  async onSubmit() {
    this.errorMessage.set('');

    const capturedName    = this.fullName().trim();
    const capturedEmail   = this.email().trim();
    const capturedCompany = this.company().trim();
    const capturedContact = this.contact().trim();

    // Shared validation — same rules as the admin modal
    const validationError = validateWalkInData({
      fullName: capturedName,
      email:    capturedEmail,
      company:  capturedCompany,
      contact:  capturedContact || undefined
    });

    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    if (!this.currentEvent) {
      this.errorMessage.set('Event not loaded. Please refresh the page.');
      return;
    }

    this.submitting.set(true);

    const result = await this.dataService.addWalkInAttendee(
      {
        fullName: capturedName,
        email:    capturedEmail,
        company:  capturedCompany,
        contact:  capturedContact
      },
      this.currentEvent.sheetUrl,
      {
        name:  this.currentEvent.defaultSpocName,
        email: this.currentEvent.defaultSpocEmail,
        slack: this.currentEvent.defaultSpocSlack
      },
      true // autoCheckIn: mark attendance + fire email notification immediately
    );

    this.submitting.set(false);

    if (result) {
      this.registeredAttendee.set({
        fullName:     capturedName,
        company:      capturedCompany,
        lanyardColor:  result.lanyardColor,
        nameCardColor: result.nameCardColor,
      });
      this.submitted.set(true);
    } else {
      this.errorMessage.set('Failed to register. Please check your connection, or reach out to someone on the StackConnect desk.');
    }
  }

  lanyardDotColor(color: string): string {
    const map: Record<string, string> = {
      'yellow':        '#EAB308',
      'green':         '#22C55E',
      'red':           '#DC2626',
      'crimson red':   '#DC2626',
      'charcoal grey': '#4B5563',
      'charcoal gray': '#4B5563',
      'blue':          '#3B82F6',
      'white':         '#E5E7EB',
      'black':         '#111827',
    };
    return map[color.toLowerCase()] ?? '#A855F7';
  }

  reset() {
    this.fullName.set('');
    this.email.set('');
    this.company.set('');
    this.contact.set('');
    this.errorMessage.set('');
    this.submitted.set(false);
    this.registeredAttendee.set(null);
  }
}
