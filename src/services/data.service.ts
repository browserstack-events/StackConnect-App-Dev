import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { STORAGE_KEYS, SYNC_CONFIG, VALIDATION, DEFAULT_LANYARD_COLOR } from '../constants';

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
  nameCardColor: string;
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

// ---------------------------------------------------------------------------
// Shared walk-in validation (used by both the public form and admin modal)
// ---------------------------------------------------------------------------

export function validateWalkInData(data: {
  fullName: string;
  email: string;
  company: string;
  contact?: string;
}): string | null {
  if (!data.fullName?.trim()) return 'Full name is required';
  if (!data.email?.trim())    return 'Email is required';
  if (!data.company?.trim())  return 'Company is required';

  if (!VALIDATION.EMAIL_REGEX.test(data.email)) {
    return 'Please enter a valid email address';
  }

  const emailLower = data.email.toLowerCase();
  const isPersonal = VALIDATION.PERSONAL_EMAIL_DOMAINS.some(d => emailLower.includes(d));
  if (isPersonal) {
    return 'Please use your corporate email address. Personal accounts are not accepted.';
  }

  if (data.contact?.trim()) {
    if (!VALIDATION.PHONE_REGEX.test(data.contact.trim())) {
      return 'Please enter a valid international phone number starting with a country code (e.g. +1 ...).';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// DataService
// ---------------------------------------------------------------------------

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private rawAttendees   = signal<Attendee[]>([]);
  public sheetName       = signal('');
  public availableSheets = signal<string[]>([]);
  public savedEvents     = signal<SavedEvent[]>([]);

  /** GAS endpoint — injected from environment file (swapped at build time in CI). */
  private readonly SCRIPT_URL = environment.gasUrl;

  private currentSheetUrl = signal('');

  /** Pending sync payloads that failed and will be retried on next loadFromBackend */
  private pendingSyncs: Array<{ payload: any; retries: number }> = [];

  /**
   * Exposed to components so they can show a non-blocking warning banner
   * when one or more writes haven't synced successfully.
   */
  public syncError = signal<string | null>(null);

  /**
   * Set when a read (loadFromBackend) fails or times out.
   * Cleared automatically on the next successful read.
   */
  public connectionError = signal<string | null>(null);

  constructor() {
    this.loadEventsFromStorage();
    this.loadPendingSyncsFromStorage();
  }

  // --- SAFE JSON PARSER ---

  private async safeJson(response: Response): Promise<any> {
    try {
      if (!response) return {};
      const text = await response.text();
      if (!text || typeof text !== 'string') return {};
      const trimmed = text.trim();
      if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return {};
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return {};
      return JSON.parse(trimmed);
    } catch (e) {
      console.warn('Failed to parse JSON response.', e);
      return {};
    }
  }

  // --- EVENT MANAGEMENT ---

  private loadEventsFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!data) return;
      const clean = data.trim();
      if (!clean || (!clean.startsWith('[') && !clean.startsWith('{'))) return;
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) this.savedEvents.set(parsed);
    } catch (e) {
      console.error('Error loading events from storage, clearing corrupt data:', e);
      try { localStorage.removeItem(STORAGE_KEYS.EVENTS); } catch {}
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
      defaultSpocName:  '',
      defaultSpocEmail: '',
      defaultSpocSlack: ''
    };
    this.savedEvents.update(prev => [newEvent, ...prev]);
    this.persistEvents();
    return newEvent;
  }

  async updateEvent(id: string, updates: Partial<SavedEvent>) {
    this.savedEvents.update(events =>
      events.map(e => e.id === id ? { ...e, ...updates } : e)
    );
    this.persistEvents();
    await this.syncEventUpdateToBackend(id, updates);
  }

  private async syncEventUpdateToBackend(eventId: string, updates: Partial<SavedEvent>) {
    if (!this.SCRIPT_URL) {
      console.warn('Backend URL not configured — event update is local only');
      return;
    }
    try {
      const response = await fetch(this.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'update_event', eventId, ...updates })
      });
      const result = await this.safeJson(response);
      if (result.status !== 'success') {
        console.error('Failed to sync event update:', result.error);
      }
    } catch (error) {
      console.error('Failed to sync event update to backend:', error);
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
    try {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(this.savedEvents()));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  // --- MASTER LOG SYNC ---

  async fetchAllEventsFromMasterLog(): Promise<void> {
    if (!this.SCRIPT_URL) return;
    try {
      const response = await fetch(`${this.SCRIPT_URL}?action=get_all_events`);
      const data = await this.safeJson(response);
      if (data.status === 'success' && Array.isArray(data.events)) {
        const events: SavedEvent[] = data.events.map((e: any) => ({
          id:               e.eventId,
          name:             e.eventName,
          sheetUrl:         e.sheetUrl,
          createdAt:        e.createdAt ? new Date(e.createdAt).getTime() : Date.now(),
          state:            e.state            || 'Active',
          eventDate:        e.eventDate        || '',
          defaultSpocName:  e.defaultSpocName  || '',
          defaultSpocEmail: e.defaultSpocEmail || '',
          defaultSpocSlack: e.defaultSpocSlack || ''
        }));
        this.savedEvents.set(events);
        this.persistEvents();
      }
    } catch (e) {
      console.error('Failed to sync master events:', e);
    }
  }

  async getEventFromMasterLog(eventId: string): Promise<SavedEvent | null> {
    if (!this.SCRIPT_URL) return null;
    try {
      const response = await fetch(`${this.SCRIPT_URL}?action=get_event&eventId=${eventId}`);
      const data = await this.safeJson(response);
      if (data.status === 'success' && data.event) {
        const event: SavedEvent = {
          id:               data.event.id,
          name:             data.event.name,
          sheetUrl:         data.event.sheetUrl,
          createdAt:        typeof data.event.createdAt === 'string'
                              ? new Date(data.event.createdAt).getTime()
                              : data.event.createdAt,
          state:            data.event.state            || 'Active',
          eventDate:        data.event.eventDate        || '',
          defaultSpocName:  data.event.defaultSpocName  || '',
          defaultSpocEmail: data.event.defaultSpocEmail || '',
          defaultSpocSlack: data.event.defaultSpocSlack || ''
        };
        const existing = this.savedEvents().find(e => e.id === event.id);
        if (!existing) {
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

  async loadEventData(sheetUrl: string, sheetName: string): Promise<boolean> {
    return this.loadFromBackend(sheetUrl, sheetName);
  }

  // --- MASTER LOGGING ---

  async logEventToBackend(eventData: any) {
    if (!this.SCRIPT_URL) return;
    try {
      const response = await fetch(this.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action:     'log_event',
          eventId:    eventData.eventId,
          eventName:  eventData.eventName,
          sheetUrl:   eventData.sheetUrl,
          deskLink:   eventData.deskLink,
          spocLink:   eventData.spocLink,
          walkinLink: eventData.walkinLink,
          createdAt:  eventData.createdAt
        })
      });
      const result = await this.safeJson(response);
      if (result.status !== 'success') {
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
    this.syncChangeToBackend({ email: attendee.email, lanyardColor: newColor });
  }

  toggleAttendance(id: string) {
    const attendee = this.rawAttendees().find(a => a.id === id);
    if (!attendee) return;
    const newStatus = !attendee.attendance;
    const newTime   = newStatus ? new Date() : null;
    this.rawAttendees.update(attendees =>
      attendees.map(a => a.id === id ? { ...a, attendance: newStatus, checkInTime: newTime } : a)
    );
    this.syncChangeToBackend({ email: attendee.email, attendance: newStatus });
  }

  updateNote(id: string, note: string) {
    const attendee = this.rawAttendees().find(a => a.id === id);
    if (!attendee) return;
    this.rawAttendees.update(attendees =>
      attendees.map(a => a.id === id ? { ...a, notes: note } : a)
    );
    this.syncChangeToBackend({ email: attendee.email, notes: note });
  }

  /**
   * Adds a walk-in attendee to the event sheet.
   *
   * @param data               - Attendee form fields (already validated by the caller).
   * @param sheetUrlOverride   - Override the active sheet URL.
   * @param defaultSpocValues  - SPOC assignment defaults from the event config.
   * @param autoCheckIn        - true  → public form walk-in (auto check-in + email)
   *                             false → admin desk manual add (toggle controls check-in)
   */
  async addWalkInAttendee(
    data: { fullName: string; email: string; company: string; contact?: string },
    sheetUrlOverride?: string,
    defaultSpocValues?: { name?: string; email?: string; slack?: string },
    autoCheckIn: boolean = false
  ): Promise<{ lanyardColor: string; nameCardColor: string } | false> {
    const sheet     = sheetUrlOverride || this.currentSheetUrl();
    const sheetName = this.sheetName();

    if (!this.SCRIPT_URL || !sheet) {
      console.error('Missing configuration: Script URL or Sheet URL');
      return false as false;
    }

    const newId       = crypto.randomUUID();
    const nameParts   = data.fullName.trim().split(/\s+/);
    const firstName   = nameParts[0] || '';
    const lastName    = nameParts.slice(1).join(' ') || '';
    const checkInTime = autoCheckIn ? new Date() : null;

    const newAttendee: Attendee = {
      id:           newId,
      fullName:     data.fullName,
      email:        data.email,
      company:      data.company,
      contact:      data.contact || '',
      firstName,
      lastName,
      attendance:   autoCheckIn,
      checkInTime,
      segment:      'Walk-in',
      spocName:     defaultSpocValues?.name  || 'Walk-in',
      spocEmail:    defaultSpocValues?.email || '',
      spocSlack:    defaultSpocValues?.slack || '',
      lanyardColor:  DEFAULT_LANYARD_COLOR,
      nameCardColor: '',
      printStatus:   '',
      leadIntel:     '',
      notes:         '',
      attendeeType:  'Attendee'
    };

    if (this.currentSheetUrl() === sheet) {
      this.rawAttendees.update(prev => [newAttendee, ...prev]);
    }

    try {
      const params = new URLSearchParams({ action: 'add', sheetUrl: sheet });
      if (sheetName) params.append('sheetName', sheetName);

      const payload = {
        ...data,
        firstName,
        lastName,
        lanyardColor: DEFAULT_LANYARD_COLOR,
        attendance:   autoCheckIn,
        checkInTime:  autoCheckIn ? checkInTime!.toISOString() : null,
        autoCheckIn,
        defaultSpocName:  defaultSpocValues?.name  || '',
        defaultSpocEmail: defaultSpocValues?.email || '',
        defaultSpocSlack: defaultSpocValues?.slack || '',
        attendeeType: 'Attendee'
      };

      const attemptAdd = async () => {
        const response = await fetch(`${this.SCRIPT_URL}?${params.toString()}`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        return this.safeJson(response);
      };

      let res = await attemptAdd();

      // Single retry after a short delay if the backend lock was busy.
      if (res.status === 'error' && res.error?.includes('busy')) {
        await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.WALK_IN_RETRY_DELAY_MS));
        res = await attemptAdd();
      }

      if (this.currentSheetUrl() === sheet && res.status === 'success' && res.updatedFields) {
        this.rawAttendees.update(attendees =>
          attendees.map(a => a.id === newId ? { ...a, ...res.updatedFields } : a)
        );
      }

      if (res.status === 'success') {
        return {
          lanyardColor:  res.updatedFields?.lanyardColor  || DEFAULT_LANYARD_COLOR,
          nameCardColor: res.updatedFields?.nameCardColor || '',
        };
      }
      return false;
    } catch (err) {
      console.error('Failed to add walk-in:', err);
      return false;
    }
  }

  // --- NETWORKING: fire-with-fallback sync ---

  /**
   * Sends a change to the backend with a configurable timeout.
   * On failure the payload is queued and retried on the next loadFromBackend call.
   * Sets syncError signal when there are unsynced pending changes.
   */
  private async syncChangeToBackend(payload: any, retries: number = 0) {
    const sheet     = this.currentSheetUrl();
    const sheetName = this.sheetName();

    if (!this.SCRIPT_URL || !sheet) {
      console.warn('Backend not configured. Change is local only.');
      return;
    }

    const params = new URLSearchParams({ action: 'update', sheetUrl: sheet });
    if (sheetName) params.append('sheetName', sheetName);
    const url = `${this.SCRIPT_URL}?${params.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), SYNC_CONFIG.BACKEND_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const result = await this.safeJson(response);
      if (result.status !== 'success') {
        console.warn('Sync returned non-success, queuing for retry:', result.error);
        this.queuePendingSync(payload, retries);
      } else {
        if (this.pendingSyncs.length === 0) this.syncError.set(null);
      }
    } catch (err: any) {
      const reason = err?.name === 'AbortError' ? 'timed out' : 'network error';
      console.warn(`Sync ${reason}, queued for retry:`, payload);
      this.queuePendingSync(payload, retries);
    }
  }

  private loadPendingSyncsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PENDING_SYNCS);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.pendingSyncs = parsed;
        this.syncError.set('Some changes haven\'t synced yet. They will retry on the next refresh.');
      }
    } catch (e) {
      console.warn('Failed to restore pending syncs from storage:', e);
      try { localStorage.removeItem(STORAGE_KEYS.PENDING_SYNCS); } catch {}
    }
  }

  private savePendingSyncs() {
    try {
      if (this.pendingSyncs.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.PENDING_SYNCS);
      } else {
        localStorage.setItem(STORAGE_KEYS.PENDING_SYNCS, JSON.stringify(this.pendingSyncs));
      }
    } catch (e) {
      console.warn('Failed to persist pending syncs to storage:', e);
    }
  }

  private queuePendingSync(payload: any, retries: number = 0) {
    if (this.pendingSyncs.length < SYNC_CONFIG.MAX_PENDING_RETRIES * 10) {
      this.pendingSyncs.push({ payload, retries });
      this.savePendingSyncs();
    }
    this.syncError.set('Some changes haven\'t synced yet. They will retry on the next refresh.');
  }

  /**
   * After a backend refresh overwrites rawAttendees, re-apply any changes that
   * are still sitting in the pending queue so the UI never reverts to a stale
   * backend state while a retry is in-flight.
   */
  private reapplyPendingChanges() {
    if (this.pendingSyncs.length === 0) return;
    this.rawAttendees.update(attendees =>
      attendees.map(a => {
        const allPending = this.pendingSyncs.filter(s => s.payload.email === a.email);
        if (allPending.length === 0) return a;
        // Merge all pending entries in queue order so the latest value for each
        // field wins. This prevents an earlier unrelated change (e.g. lanyard
        // colour) from blocking a later attendance toggle from being reapplied.
        const merged = allPending.reduce((acc, s) => ({ ...acc, ...s.payload }), {} as any);
        return {
          ...a,
          ...(merged.attendance  !== undefined ? { attendance:   merged.attendance,
                                                   checkInTime: merged.attendance ? (a.checkInTime ?? new Date()) : null } : {}),
          ...(merged.lanyardColor !== undefined ? { lanyardColor: merged.lanyardColor } : {}),
          ...(merged.notes        !== undefined ? { notes:        merged.notes        } : {}),
        };
      })
    );
  }

  private async flushPendingSyncs() {
    if (this.pendingSyncs.length === 0) return;

    const queue = [...this.pendingSyncs];
    this.pendingSyncs = [];
    this.savePendingSyncs();

    for (const item of queue) {
      if (item.retries >= SYNC_CONFIG.MAX_PENDING_RETRIES) {
        console.error('Dropping sync after max retries:', item.payload);
        continue;
      }
      await this.syncChangeToBackend(item.payload, item.retries + 1);
    }

    if (this.pendingSyncs.length === 0) {
      this.syncError.set(null);
      this.savePendingSyncs();
    }
  }

  async loadFromBackend(sheetUrl: string, sheetName?: string): Promise<boolean> {
    this.currentSheetUrl.set(sheetUrl);
    if (sheetName) this.sheetName.set(sheetName);

    if (!this.SCRIPT_URL || !sheetUrl) {
      this.connectionError.set('Configuration error: backend URL is not set. Check your .env file.');
      return false;
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15_000);

    try {
      const params = new URLSearchParams({ action: 'read', sheetUrl });
      if (sheetName) params.append('sheetName', sheetName);

      const response = await fetch(`${this.SCRIPT_URL}?${params.toString()}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const json = await this.safeJson(response);

      if (json.sheetName) this.sheetName.set(json.sheetName);

      if (json.attendees) {
        this.connectionError.set(null);
        this.parseJsonData(json.attendees);
        // Re-apply any in-flight or queued optimistic changes on top of the
        // fresh backend snapshot so the UI never reverts while a sync is pending.
        this.reapplyPendingChanges();
        await this.flushPendingSyncs();
        return true;
      } else if (json.error) {
        this.connectionError.set('Backend error: ' + json.error);
        return false;
      }

      return false;
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Fetch error:', err);
      if (err?.name === 'AbortError') {
        this.connectionError.set('Connection timed out. Try a better network or contact the StackConnect team for help.');
      } else {
        this.connectionError.set('Could not reach the backend. Check your internet connection or contact the StackConnect team for help.');
      }
      return false;
    }
  }

  async fetchSheetMetadata(sheetUrl: string): Promise<string[]> {
    if (!this.SCRIPT_URL) return [];
    try {
      const response = await fetch(`${this.SCRIPT_URL}?action=metadata&sheetUrl=${encodeURIComponent(sheetUrl)}`);
      const json = await this.safeJson(response);
      return (json.status === 'success' && Array.isArray(json.sheets)) ? json.sheets : [];
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
    const parsedData: Attendee[] = rows
    .filter(row => Object.keys(row).some(k => k.toLowerCase() === 'email' && String(row[k] || '').trim() !== ''))
    .map(row => {
      // Case-insensitive field lookup across all candidate key names.
      // The backend now sends camelCase keys only; the fallback to raw header
      // names covers any older cached/legacy data that may still have both styles.
      // Normalize a key for comparison: lowercase, strip spaces and hyphens.
      // This bridges the gap between backend camelCase keys (e.g. 'colourOfTheLanyard',
      // 'check-InTime') and the human-readable candidate strings used below
      // (e.g. 'Colour of the Lanyard', 'Check-in Time').
      const norm = (k: string) => k.toLowerCase().replace(/[\s-]/g, '');
      const get = (...candidates: string[]) => {
        for (const key of candidates) {
          if (row[key] !== undefined && row[key] !== null) return row[key];
          const nKey = norm(key);
          const found = Object.keys(row).find(k => norm(k) === nKey);
          if (found && row[found] !== undefined && row[found] !== null) return row[found];
        }
        return undefined;
      };

      // --- Check-in time parsing ---
      const checkInTimeRaw = get('checkInTime', 'Check-in Time', 'check_in_time', 'time');
      let checkInDate: Date | null = null;

      if (checkInTimeRaw && this.cleanString(checkInTimeRaw)) {
        const dStr     = String(checkInTimeRaw).trim();
        const ddmmyyyy = dStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(.*)$/);

        if (ddmmyyyy) {
          const day     = parseInt(ddmmyyyy[1], 10);
          const month   = parseInt(ddmmyyyy[2], 10);
          const year    = parseInt(ddmmyyyy[3], 10);
          const timeStr = ddmmyyyy[4] || '';

          if (day > 12) {
            // Unambiguous DD/MM/YYYY — reorder to ISO
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

      // --- Name parsing ---
      let fName = this.cleanString(get('firstName', 'First Name', 'firstname'));
      let lName = this.cleanString(get('lastName',  'Last Name',  'lastname'));
      let full  = this.cleanString(get('fullName',  'Full Name',  'fullname', 'Name'));

      if (!full && (fName || lName)) full = `${fName} ${lName}`.trim();
      if (full && !fName) {
        const parts = full.split(' ');
        fName = parts[0];
        lName = parts.slice(1).join(' ');
      }
      if (!full) full = 'Unknown Attendee';

      // --- SPOC ---
      let spocVal = this.cleanString(get('spocName', 'SPOC of the day', 'spocOfTheDay'));
      if (!spocVal) spocVal = 'Unassigned';

      // --- Attendance ---
      const attendanceVal  = get('attendance', 'Attendance', 'Status', 'Registration Status');
      const attendanceBool = attendanceVal === true
        || attendanceVal === 'TRUE'
        || String(attendanceVal).toLowerCase() === 'true'
        || String(attendanceVal).toLowerCase() === 'checked in';

      // --- Attendee type ---
      let attendeeTypeRaw = this.cleanString(get('attendeeType', 'Attendee Type', 'Type', 'Category'));
      let attendeeType: AttendeeType = 'Attendee';
      if (attendeeTypeRaw) {
        if (attendeeTypeRaw.toLowerCase().includes('speaker'))    attendeeType = 'Speaker';
        else if (attendeeTypeRaw.toLowerCase().includes('round')) attendeeType = 'Round Table';
      }

      return {
        id:           crypto.randomUUID(),
        fullName:     full,
        firstName:    fName,
        lastName:     lName,
        email:        this.cleanString(get('email', 'Email', 'E-mail')),
        contact:      this.cleanString(get('contact', 'Contact', 'Phone', 'Mobile')),
        company:      this.cleanString(get('company', 'Company', 'Organization')),
        segment:      this.cleanString(get('segment', 'Segment', 'Industry')),
        lanyardColor:   this.cleanString(get('lanyardColor', 'Colour of the Lanyard', 'Color of the Lanyard', 'Lanyard', 'Lanyard Color')),
      nameCardColor:  this.cleanString(get('nameCardColor', 'Colour of Name Card', 'Name Card Color', 'namecard color', 'Name Card')),
        attendance:   attendanceBool,
        spocName:     spocVal,
        spocEmail:    this.cleanString(get('spocEmail', 'SPoC email', 'spoc_email')),
        spocSlack:    this.cleanString(get('spocSlack', 'SPoC slack', 'spoc_slack')),
        printStatus:  this.cleanString(get('printStatus', 'Print Status')),
        checkInTime:  checkInDate,
        leadIntel:    this.cleanString(get('leadIntel', 'Account Intel', 'Lead Intel', 'talking points', 'Intel')),
        notes:        this.cleanString(get('notes', 'Note', 'Notes', 'Comment', 'Comments', 'Feedback')),
        title:        this.cleanString(get('title', 'Title', 'Designation', 'Lead Designation', 'Job Title', 'Role', 'position')),
        linkedin:     this.cleanString(get('linkedin', 'LinkedIn', 'Linkedin Profile', 'LinkedIn URL', 'Profile Link', 'linked_in', 'linkedin_url')),
        attendeeType
      };
    });

    this.rawAttendees.set(parsedData);
  }
}
