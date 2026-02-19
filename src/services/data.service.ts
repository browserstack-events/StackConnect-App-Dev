import { Injectable, signal } from '@angular/core';
export type AttendeeType = 'Attendee' | 'Speaker' | 'Round Table';

export interface Attendee {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  contact: string;
  company: string;
  segment: string;
  lanyardColor: string;
  attendance: boolean;
  spocName: string;
  spocEmail: string;
  spocSlack?: string;
  checkInTime: Date | null;
  printStatus: string;
  leadIntel?: string;
  notes?: string;
  title?: string;
  linkedin?: string;
  attendeeType: AttendeeType;
}

export interface SavedEvent {
  id: string;
  name: string;
  sheetUrl: string;
  createdAt: number;
  eventDate?: string;
  state: 'Active' | 'Archived' | 'Deleted';
  defaultSpocName?: string;
  defaultSpocEmail?: string;
  defaultSpocSlack?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private rawAttendees = signal<Attendee[]>([]);
  public sheetName = signal('');
  public availableSheets = signal<string[]>([]);
  public savedEvents = signal<SavedEvent[]>([]);

  private readonly HARDCODED_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxCsdkPGi3-rxDTWAJIHfK6O70GaPSmJmlqLYTlX8jxFE7MqOS7koul0uSKTynDXKOa/exec';
  private currentSheetUrl = signal('');

  constructor() {
    this.loadEventsFromStorage();
  }

  // --- SAFE JSON PARSER ---
  private async safeJson(response: Response): Promise<any> {
    try {
      if (!response) return {};

      const text = await response.text();

      // Ensure text is actually a string
      if (text === undefined || text === null || typeof text !== 'string') {
        return {};
      }

      const trimmed = text.trim();

      // Guard against common non-JSON responses
      // "undefined" string check is important for Google Apps Script empty returns
      if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
        return {};
      }

      // Pre-check for JSON structure to avoid SyntaxError on HTML or plain text
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return {};
      }

      return JSON.parse(trimmed);
    } catch (e) {
      console.warn('Failed to parse JSON response.', e);
      return {};
    }
  }

  // --- EVENT MANAGEMENT ---

  private loadEventsFromStorage() {
    try {
      // Safety check for SSR or environments without localStorage
      if (typeof localStorage === 'undefined') return;

      const data = localStorage.getItem('stack_connect_events');

      // Explicitly check for null/undefined value
      if (data === null || data === undefined) return;

      const cleanData = data.trim();

      // Strict check: valid JSON for our purposes must be an array or object.
      // This prevents 'undefined', 'null', or plain strings from being parsed.
      if (!cleanData || (!cleanData.startsWith('[') && !cleanData.startsWith('{'))) {
        return;
      }

      const parsed = JSON.parse(cleanData);
      if (Array.isArray(parsed)) {
        this.savedEvents.set(parsed);
      }
    } catch (e) {
      console.error('Error loading events from storage, clearing corrupt data:', e);
      try { localStorage.removeItem('stack_connect_events'); } catch { }
    }
  }

  addEvent(name: string, sheetUrl: string) {
    const newEvent: SavedEvent = {
      id: crypto.randomUUID(),
      name,
      sheetUrl,
      createdAt: Date.now(),
      state: 'Active',
      eventDate: '',
      defaultSpocName: '',
      defaultSpocEmail: '',
      defaultSpocSlack: ''
    };
    this.savedEvents.update(prev => [newEvent, ...prev]);
    this.persistEvents();
    return newEvent;
  }


  // NEW: General update method for events (used for archiving and setting dates)
  // updateEvent(id: string, updates: Partial<SavedEvent>) {
  //   this.savedEvents.update(events => 
  //     events.map(e => e.id === id ? { ...e, ...updates } : e)
  //   );
  //   this.persistEvents();
  // }
  // NEW: General update method for events (used for archiving and setting dates)
  async updateEvent(id: string, updates: Partial<SavedEvent>) {
    // Update local state immediately
    this.savedEvents.update(events =>
      events.map(e => e.id === id ? { ...e, ...updates } : e)
    );
    this.persistEvents();

    // Sync to backend Master Event Log
    await this.syncEventUpdateToBackend(id, updates);
  }

  // NEW: Sync event updates to backend
  private async syncEventUpdateToBackend(eventId: string, updates: Partial<SavedEvent>) {
    if (!this.HARDCODED_SCRIPT_URL) {
      console.warn('Backend URL not configured, update is local only');
      return;
    }

    try {
      const payload = {
        action: 'update_event',
        eventId: eventId,
        ...updates
      };

      const response = await fetch(this.HARDCODED_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const result = await this.safeJson(response);

      if (result.status === 'success') {
        console.log('✅ Event update synced to backend:', eventId);
      } else {
        console.error('❌ Failed to sync event update:', result.error);
      }
    } catch (error) {
      console.error('❌ Failed to sync event update to backend:', error);
    }
  }


  removeEvent(id: string) {
    this.savedEvents.update(prev => prev.filter(e => e.id !== id));
    this.persistEvents();
  }

  getEventById(id: string): SavedEvent | undefined {
    return this.savedEvents().find(e => e.id === id);
  }

  private persistEvents() {
    const events = this.savedEvents();
    if (events) {
      try {
        localStorage.setItem('stack_connect_events', JSON.stringify(events));
      } catch (e) {
        console.error('Failed to save to localStorage', e);
      }
    }
  }

  // --- MASTER LOG SYNC ---

  async fetchAllEventsFromMasterLog(): Promise<void> {
    if (!this.HARDCODED_SCRIPT_URL) return;

    try {
      const response = await fetch(`${this.HARDCODED_SCRIPT_URL}?action=get_all_events`);
      const data = await this.safeJson(response);

      if (data.status === 'success' && Array.isArray(data.events)) {
        const localMap = new Map(this.savedEvents().map(e => [e.id, e]));

        const events: SavedEvent[] = data.events.map((e: any) => {
          const local = localMap.get(e.eventId);
          return {
            id: e.eventId,
            name: e.eventName,
            sheetUrl: e.sheetUrl,
            createdAt: e.createdAt ? new Date(e.createdAt).getTime() : Date.now(),
            // ✅ Use backend state field
            state: e.state || 'Active',
            eventDate: e.eventDate || '',
            // ✅ NEW: Default SPOC fields
            defaultSpocName: e.defaultSpocName || '',
            defaultSpocEmail: e.defaultSpocEmail || '',
            defaultSpocSlack: e.defaultSpocSlack || ''
          };
        });

        this.savedEvents.set(events);
        this.persistEvents();
      }
    } catch (e) {
      console.error('Failed to sync master events:', e);
    }
  }


  async getEventFromMasterLog(eventId: string): Promise<SavedEvent | null> {
    if (!this.HARDCODED_SCRIPT_URL) return null;

    try {
      const response = await fetch(`${this.HARDCODED_SCRIPT_URL}?action=get_event&eventId=${eventId}`);
      const data = await this.safeJson(response);

      if (data.status === 'success' && data.event) {
        const local = this.savedEvents().find(e => e.id === data.event.id);

        const event: SavedEvent = {
          id: data.event.id,
          name: data.event.name,
          sheetUrl: data.event.sheetUrl,
          createdAt: typeof data.event.createdAt === 'string'
            ? new Date(data.event.createdAt).getTime()
            : data.event.createdAt,
          // ✅ Use backend state
          state: data.event.state || 'Active',
          eventDate: data.event.eventDate || '',
          // ✅ NEW: Default SPOC fields
          defaultSpocName: data.event.defaultSpocName || '',
          defaultSpocEmail: data.event.defaultSpocEmail || '',
          defaultSpocSlack: data.event.defaultSpocSlack || ''
        };

        if (!local) {
          this.savedEvents.update(prev => [event, ...prev]);
        } else {
          this.savedEvents.update(prev => prev.map(e => e.id === event.id ? event : e));
        }
        this.persistEvents();

        return event;
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch event from master log:', error);
      return null;
    }
  }


  // --- NEW: Helper to load event data ---
  async loadEventData(sheetUrl: string, sheetName: string): Promise<boolean> {
    return await this.loadFromBackend(sheetUrl, sheetName);
  }

  // --- MASTER LOGGING ---

  async logEventToBackend(eventData: any) {
    if (!this.HARDCODED_SCRIPT_URL) return;
    try {
      const response = await fetch(this.HARDCODED_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'log_event',
          eventId: eventData.eventId,
          eventName: eventData.eventName,
          sheetUrl: eventData.sheetUrl,
          deskLink: eventData.deskLink,
          spocLink: eventData.spocLink,
          walkinLink: eventData.walkinLink,
          createdAt: eventData.createdAt
        })
      });
      const result = await this.safeJson(response);
      if (result.status === 'success') {
        console.log('✓ Event logged to master sheet');
      } else {
        console.error('Master log error:', result.error);
      }
    } catch (e) {
      console.error('Failed to log event to master sheet', e);
    }
  }

  getAttendees() {
    return this.rawAttendees.asReadonly();
  }

  // --- WRITE OPERATIONS ---

  updateLanyardColor(id: string, newColor: string) {
    const attendee = this.rawAttendees().find(a => a.id === id);
    if (!attendee) return;

    this.rawAttendees.update(attendees =>
      attendees.map(a => a.id === id ? { ...a, lanyardColor: newColor } : a)
    );

    this.syncChangeToBackend({
      email: attendee.email,
      lanyardColor: newColor
    });
  }

  toggleAttendance(id: string) {
    const attendee = this.rawAttendees().find(a => a.id === id);
    if (!attendee) return;
    const newStatus = !attendee.attendance;
    const newTime = newStatus ? new Date() : null;

    this.rawAttendees.update(attendees =>
      attendees.map(a => a.id === id ? {
        ...a,
        attendance: newStatus,
        checkInTime: newTime
      } : a)
    );

    this.syncChangeToBackend({
      email: attendee.email,
      attendance: newStatus
    });
  }

  updateNote(id: string, note: string) {
    const attendee = this.rawAttendees().find(a => a.id === id);
    if (!attendee) return;

    this.rawAttendees.update(attendees =>
      attendees.map(a => a.id === id ? { ...a, notes: note } : a)
    );

    this.syncChangeToBackend({
      email: attendee.email,
      notes: note
    });
  }

  /**
   * Adds a walk-in attendee to the event sheet.
   *
   * @param data          - Attendee form fields.
   * @param sheetUrlOverride  - Override the active sheet URL (used when called outside a loaded event).
   * @param defaultSpocValues - SPOC assignment defaults from the event config.
   * @param autoCheckIn   - When `true`, marks the attendee as checked-in immediately and instructs
   *                        the backend to fire the confirmation email. Defaults to `false` so that
   *                        admin-desk manual adds retain the existing toggle-driven flow.
   */
  async addWalkInAttendee(
    data: { fullName: string; email: string; company: string; contact?: string },
    sheetUrlOverride?: string,
    defaultSpocValues?: { name?: string; email?: string; slack?: string },
    autoCheckIn: boolean = false
  ): Promise<boolean> {
    const sheet = sheetUrlOverride || this.currentSheetUrl();
    const sheetName = this.sheetName();

    if (!this.HARDCODED_SCRIPT_URL || !sheet) {
      console.error('Missing configuration: Script URL or Sheet URL');
      return false;
    }

    const newId = crypto.randomUUID();
    const nameParts = data.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // When autoCheckIn is true we stamp the check-in time optimistically in the
    // local state so the dashboard reflects the check-in without needing a sync.
    const checkInTime = autoCheckIn ? new Date() : null;

    const newAttendee: Attendee = {
      id: newId,
      fullName: data.fullName,
      email: data.email,
      company: data.company,
      contact: data.contact || '',
      firstName: firstName,
      lastName: lastName,
      attendance: autoCheckIn,
      checkInTime: checkInTime,
      segment: 'Walk-in',
      spocName: defaultSpocValues?.name || 'Walk-in',
      spocEmail: defaultSpocValues?.email || '',
      spocSlack: defaultSpocValues?.slack || '',
      lanyardColor: 'Yellow',
      printStatus: '',
      leadIntel: '',
      notes: '',
      attendeeType: 'Attendee'
    };

    if (this.currentSheetUrl() === sheet) {
      this.rawAttendees.update(prev => [newAttendee, ...prev]);
    }

    try {
      const params = new URLSearchParams({
        action: 'add',
        sheetUrl: sheet
      });

      if (sheetName) params.append('sheetName', sheetName);

      const payload = {
        ...data,
        firstName,
        lastName,
        lanyardColor: 'Yellow',
        // Reflect the auto check-in state so the sheet row is written correctly.
        attendance: autoCheckIn,
        // ISO string keeps the GAS script timezone-agnostic; null when not checked in.
        checkInTime: autoCheckIn ? checkInTime!.toISOString() : null,
        // Signal to the GAS backend: send the confirmation email for this walk-in.
        autoCheckIn: autoCheckIn,
        // Pass default SPOC values to backend
        defaultSpocName: defaultSpocValues?.name || '',
        defaultSpocEmail: defaultSpocValues?.email || '',
        defaultSpocSlack: defaultSpocValues?.slack || '',
        attendeeType: 'Attendee'
      };

      const response = await fetch(`${this.HARDCODED_SCRIPT_URL}?${params.toString()}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const res = await this.safeJson(response);

      if (this.currentSheetUrl() === sheet) {
        if (res.status === 'success' && res.updatedFields) {
          this.rawAttendees.update(attendees =>
            attendees.map(a => a.id === newId ? { ...a, ...res.updatedFields } : a)
          );
        }
      }

      return res.status === 'success';
    } catch (err) {
      console.error('Failed to add walk-in:', err);
      return false;
    }
  }


  // --- NETWORKING ---

  private async syncChangeToBackend(payload: any) {
    const sheet = this.currentSheetUrl();
    const sheetName = this.sheetName();

    if (!this.HARDCODED_SCRIPT_URL || !sheet) {
      console.warn('Backend not configured properly. Change is local only.');
      return;
    }

    try {
      const params = new URLSearchParams({
        action: 'update',
        sheetUrl: sheet
      });
      if (sheetName) params.append('sheetName', sheetName);

      await fetch(`${this.HARDCODED_SCRIPT_URL}?${params.toString()}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      // Fire and forget
      console.log('Synced to sheet successfully');
    } catch (err) {
      console.error('Failed to sync change to sheet:', err);
    }
  }

  async loadFromBackend(sheetUrl: string, sheetName?: string): Promise<boolean> {
    this.currentSheetUrl.set(sheetUrl);
    if (sheetName) this.sheetName.set(sheetName);

    if (!this.HARDCODED_SCRIPT_URL || !sheetUrl) {
      alert('Configuration Error: Script URL is missing in code.');
      return false;
    }

    try {
      const params = new URLSearchParams({
        action: 'read',
        sheetUrl: sheetUrl
      });
      if (sheetName) params.append('sheetName', sheetName);

      const response = await fetch(`${this.HARDCODED_SCRIPT_URL}?${params.toString()}`);
      const json = await this.safeJson(response);

      if (json.sheetName) {
        this.sheetName.set(json.sheetName);
      }

      if (json.attendees) {
        this.parseJsonData(json.attendees);
        return true;
      } else if (json.error) {
        alert('Google Script Error: ' + json.error);
        return false;
      }

      return false;
    } catch (err) {
      console.error('Fetch error:', err);
      alert('Please check the internet connection and try again. Failed to connect to backend.');
      return false;
    }
  }

  async fetchSheetMetadata(sheetUrl: string): Promise<string[]> {
    if (!this.HARDCODED_SCRIPT_URL) return [];
    try {
      const response = await fetch(`${this.HARDCODED_SCRIPT_URL}?action=metadata&sheetUrl=${encodeURIComponent(sheetUrl)}`);
      const json = await this.safeJson(response);
      if (json.status === 'success' && Array.isArray(json.sheets)) {
        return json.sheets;
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch metadata', e);
      return [];
    }
  }

  // --- DATA PARSING ---

  private cleanString(val: any): string {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    if (s === '#N/A' || s === '#REF!' || s.toLowerCase() === 'nan') return '';
    return s;
  }

  private parseJsonData(rows: any[]) {
    const parsedData: Attendee[] = rows.map(row => {
      const get = (...candidates: string[]) => {
        for (const key of candidates) {
          if (row[key] !== undefined && row[key] !== null) return row[key];
          const lowerKey = key.toLowerCase().trim();
          const found = Object.keys(row).find(k => k.toLowerCase().trim() === lowerKey);
          if (found && row[found] !== undefined && row[found] !== null) return row[found];
        }
        return undefined;
      };

      const checkInTimeRaw = get('checkInTime', 'Check-in Time', 'check_in_time', 'time');
      let checkInDate: Date | null = null;

      if (checkInTimeRaw && this.cleanString(checkInTimeRaw)) {
        const dStr = String(checkInTimeRaw).trim();
        const ddmmyyyy = dStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(.*)$/);

        if (ddmmyyyy) {
          const day = parseInt(ddmmyyyy[1], 10);
          const month = parseInt(ddmmyyyy[2], 10);
          const year = parseInt(ddmmyyyy[3], 10);
          const timeStr = ddmmyyyy[4] || '';

          if (day > 12) {
            const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}${timeStr.replace(/,/g, '')}`;
            const d = new Date(isoDate);
            if (!isNaN(d.getTime())) checkInDate = d;
          } else {
            const d = new Date(dStr);
            if (!isNaN(d.getTime())) checkInDate = d;
          }
        } else {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) checkInDate = d;
        }
      }

      let fName = this.cleanString(get('firstName', 'First Name', 'firstname'));
      let lName = this.cleanString(get('lastName', 'Last Name', 'lastname'));
      let full = this.cleanString(get('fullName', 'Full Name', 'fullname', 'Name'));

      if (!full && (fName || lName)) full = `${fName} ${lName}`.trim();
      if (full && !fName) {
        const parts = full.split(' ');
        fName = parts[0];
        lName = parts.slice(1).join(' ');
      }
      if (!full) full = 'Unknown Attendee';

      let spocVal = this.cleanString(get('spocName', 'SPOC of the day', 'spocOfTheDay'));
      if (!spocVal) spocVal = 'Unassigned';

      const attendanceVal = get('attendance', 'Attendance', 'Status', 'Registration Status');
      const attendanceBool = attendanceVal === true ||
        attendanceVal === 'TRUE' ||
        String(attendanceVal).toLowerCase() === 'true' ||
        String(attendanceVal).toLowerCase() === 'checked in';

      // NEW: Parse Title and LinkedIn
      const titleVal = this.cleanString(get('title', 'Title', 'Designation', 'Job Title', 'Role', 'position'));
      const linkedinVal = this.cleanString(get('linkedin', 'LinkedIn', 'Linkedin Profile', 'LinkedIn URL', 'Profile Link', 'linked_in', 'linkedin_url'));

      // NEW: Parse Attendee Type
      let attendeeTypeRaw = this.cleanString(get('attendeeType', 'Attendee Type', 'Type', 'Category'));
      let attendeeType: AttendeeType = 'Attendee';

      if (attendeeTypeRaw) {
        if (attendeeTypeRaw.toLowerCase().includes('speaker')) {
          attendeeType = 'Speaker';
        } else if (attendeeTypeRaw.toLowerCase().includes('round')) {
          attendeeType = 'Round Table';
        }
      }

      return {
        id: crypto.randomUUID(),
        fullName: full,
        firstName: fName,
        lastName: lName,
        email: this.cleanString(get('email', 'Email', 'E-mail')),
        contact: this.cleanString(get('contact', 'Contact', 'Phone', 'Mobile')),
        company: this.cleanString(get('company', 'Company', 'Organization')),
        segment: this.cleanString(get('segment', 'Segment', 'Industry')),
        lanyardColor: this.cleanString(get('lanyardColor', 'Colour of the Lanyard', 'Color of the Lanyard', 'Lanyard', 'Lanyard Color')),
        attendance: attendanceBool,
        spocName: spocVal,
        spocEmail: this.cleanString(get('spocEmail', 'SPoC email', 'spoc_email')),
        spocSlack: this.cleanString(get('spocSlack', 'SPoC slack', 'spoc_slack')),
        printStatus: this.cleanString(get('printStatus', 'Print Status')),
        checkInTime: checkInDate,
        leadIntel: this.cleanString(get('leadIntel', 'Account Intel', 'Lead Intel', 'talking points', 'Intel')),
        notes: this.cleanString(get('notes', 'Note', 'Notes', 'Comment', 'Comments', 'Feedback')),
        title: titleVal,
        linkedin: linkedinVal,
        attendeeType: attendeeType
      };
    });

    this.rawAttendees.set(parsedData);
  }
}
