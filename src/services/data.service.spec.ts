import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { DataService } from './data.service';
import { SYNC_CONFIG, DEFAULT_LANYARD_COLOR } from '../constants';

// ---------------------------------------------------------------------------
// Fetch mock — all tests use this instead of real network calls
// ---------------------------------------------------------------------------

const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
globalThis.fetch = mockFetch;

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function attendeeResponse(attendees: unknown[] = [], sheetName = 'Test Event') {
  return jsonResponse({ attendees, sheetName });
}

// ---------------------------------------------------------------------------
// Minimal attendee fixture
// ---------------------------------------------------------------------------

const alice = {
  id: 'a1',
  email: 'alice@acme.com',
  fullName: 'Alice',
  firstName: 'Alice',
  lastName: '',
  contact: '',
  company: 'Acme',
  segment: '',
  lanyardColor: 'Yellow',
  nameCardColor: '',
  attendance: false,
  checkInTime: null,
  spocName: '',
  spocEmail: '',
  spocSlack: '',
  printStatus: '',
  leadIntel: '',
  notes: '',
  attendeeType: 'Attendee' as const,
};

const bob = {
  ...alice,
  id: 'b1',
  email: 'bob@other.com',
  fullName: 'Bob',
  firstName: 'Bob',
};

// ---------------------------------------------------------------------------
// Helpers to poke at private internals
// ---------------------------------------------------------------------------

function priv(service: DataService) {
  return service as any;
}

function setSheet(service: DataService, url = 'https://sheet.example') {
  priv(service).currentSheetUrl.set(url);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DataService', () => {
  let service: DataService;

  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
    service = new DataService();
    // Give every test a script URL so sync calls aren't short-circuited
    priv(service).SCRIPT_URL = 'https://gas.example/exec';
    setSheet(service);
  });

  // ── 1. queuePendingSync ───────────────────────────────────────────────────

  describe('queuePendingSync', () => {
    it('stores payload with retries=0 by default', () => {
      priv(service).queuePendingSync({ email: 'alice@acme.com', attendance: true });
      expect(priv(service).pendingSyncs[0]).toMatchObject({
        payload: { email: 'alice@acme.com', attendance: true },
        retries: 0,
      });
    });

    it('stores the provided retry count rather than resetting to 0', () => {
      priv(service).queuePendingSync({ email: 'alice@acme.com', attendance: true }, 2);
      expect(priv(service).pendingSyncs[0].retries).toBe(2);
    });

    it('persists the queue to localStorage', () => {
      priv(service).queuePendingSync({ email: 'alice@acme.com', attendance: true });
      const stored = JSON.parse(localStorage.getItem('stack_connect_pending_syncs')!);
      expect(stored).toHaveLength(1);
      expect(stored[0].payload.email).toBe('alice@acme.com');
    });

    it('sets syncError signal', () => {
      priv(service).queuePendingSync({ email: 'alice@acme.com' });
      expect(service.syncError()).not.toBeNull();
    });

    it('does not exceed MAX_PENDING_RETRIES × 10 entries', () => {
      const cap = SYNC_CONFIG.MAX_PENDING_RETRIES * 10;
      for (let i = 0; i <= cap + 5; i++) {
        priv(service).queuePendingSync({ email: `u${i}@test.com` });
      }
      expect(priv(service).pendingSyncs.length).toBeLessThanOrEqual(cap);
    });
  });

  // ── 2. reapplyPendingChanges ──────────────────────────────────────────────
  //    This covers the bug where .find() only applied the first queued change
  //    per attendee, causing attendance toggles to silently revert when any
  //    other change (e.g. lanyard colour) was queued ahead of it.

  describe('reapplyPendingChanges', () => {
    beforeEach(() => {
      priv(service).rawAttendees.set([alice, bob]);
    });

    it('applies a single pending attendance change', () => {
      priv(service).pendingSyncs = [
        { payload: { email: alice.email, attendance: true }, retries: 0 },
      ];
      priv(service).reapplyPendingChanges();
      expect(service.getAttendees()()[0].attendance).toBe(true);
    });

    it('merges ALL pending entries for the same attendee — not just the first', () => {
      // A lanyard change is queued first; the attendance toggle comes after.
      // Before the fix, .find() would stop at the lanyard entry and the
      // attendance change would be silently dropped.
      priv(service).pendingSyncs = [
        { payload: { email: alice.email, lanyardColor: 'Green' }, retries: 0 },
        { payload: { email: alice.email, attendance: true },       retries: 0 },
      ];
      priv(service).reapplyPendingChanges();
      const a = service.getAttendees()()[0];
      expect(a.lanyardColor).toBe('Green');   // first change applied
      expect(a.attendance).toBe(true);        // second change also applied
    });

    it('later entry wins when two entries set the same field', () => {
      priv(service).pendingSyncs = [
        { payload: { email: alice.email, lanyardColor: 'Green' }, retries: 0 },
        { payload: { email: alice.email, lanyardColor: 'Red' },   retries: 0 },
      ];
      priv(service).reapplyPendingChanges();
      expect(service.getAttendees()()[0].lanyardColor).toBe('Red');
    });

    it('applies notes from a pending change', () => {
      priv(service).pendingSyncs = [
        { payload: { email: alice.email, notes: 'VIP' }, retries: 0 },
      ];
      priv(service).reapplyPendingChanges();
      expect(service.getAttendees()()[0].notes).toBe('VIP');
    });

    it('does not touch attendees that have no pending changes', () => {
      priv(service).pendingSyncs = [
        { payload: { email: bob.email, attendance: true }, retries: 0 },
      ];
      priv(service).reapplyPendingChanges();
      // alice is unaffected
      expect(service.getAttendees()()[0].attendance).toBe(false);
      // bob is updated
      expect(service.getAttendees()()[1].attendance).toBe(true);
    });
  });

  // ── 3. flushPendingSyncs — retry counter ──────────────────────────────────
  //    Before the fix, retry count was always reset to 0 on re-queue, so
  //    MAX_PENDING_RETRIES was never reached and items were never dropped.

  describe('flushPendingSyncs — retry counter', () => {
    it('re-queues a failed item with an incremented retry count', async () => {
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve(JSON.stringify({ status: 'error', error: 'fail' })),
      } as Response);

      priv(service).pendingSyncs = [
        { payload: { email: alice.email, attendance: true }, retries: 1 },
      ];
      await priv(service).flushPendingSyncs();

      // Must have been re-queued with retries: 2, not reset to 0
      expect(priv(service).pendingSyncs[0].retries).toBe(2);
    });

    it('drops an item that has reached MAX_PENDING_RETRIES', async () => {
      // fetch is not called when retries >= limit, so no mock needed
      priv(service).pendingSyncs = [
        { payload: { email: alice.email, attendance: true }, retries: SYNC_CONFIG.MAX_PENDING_RETRIES },
      ];
      await priv(service).flushPendingSyncs();
      expect(priv(service).pendingSyncs).toHaveLength(0);
    });

    it('clears syncError when all items flush successfully', async () => {
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve(JSON.stringify({ status: 'success' })),
      } as Response);

      priv(service).pendingSyncs = [
        { payload: { email: alice.email, attendance: true }, retries: 0 },
      ];
      service.syncError.set('pending...');

      await priv(service).flushPendingSyncs();
      expect(service.syncError()).toBeNull();
    });

    it('keeps syncError set when some items still fail after flush', async () => {
      mockFetch.mockResolvedValue({
        text: () => Promise.resolve(JSON.stringify({ status: 'error', error: 'still failing' })),
      } as Response);

      priv(service).pendingSyncs = [
        { payload: { email: alice.email, attendance: true }, retries: 0 },
      ];
      await priv(service).flushPendingSyncs();
      expect(service.syncError()).not.toBeNull();
    });
  });

  // ── 4. loadFromBackend — connectionError signal ───────────────────────────

  describe('loadFromBackend — connectionError signal', () => {
    it('sets connectionError when SCRIPT_URL is empty', async () => {
      priv(service).SCRIPT_URL = '';
      await service.loadFromBackend('https://sheet.example');
      expect(service.connectionError()).toMatch(/configuration error/i);
    });

    it('sets a timeout-specific message on AbortError', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      mockFetch.mockRejectedValue(abortErr);
      await service.loadFromBackend('https://sheet.example');
      expect(service.connectionError()).toMatch(/timed out/i);
    });

    it('sets a network-failure message on generic errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));
      await service.loadFromBackend('https://sheet.example');
      expect(service.connectionError()).toMatch(/internet connection/i);
    });

    it('clears connectionError on a successful response', async () => {
      service.connectionError.set('stale error');
      mockFetch.mockImplementation(() => attendeeResponse([]));
      await service.loadFromBackend('https://sheet.example');
      expect(service.connectionError()).toBeNull();
    });

    it('sets connectionError when the backend returns an error field', async () => {
      mockFetch.mockImplementation(() => jsonResponse({ error: 'Sheet not found' }));
      await service.loadFromBackend('https://sheet.example');
      expect(service.connectionError()).toContain('Sheet not found');
    });

    it('returns true and populates attendees on success', async () => {
      const row = {
        email: 'alice@acme.com',
        firstName: 'Alice',
        lastName: '',
        attendance: false,
      };
      mockFetch.mockImplementation(() => attendeeResponse([row]));
      const result = await service.loadFromBackend('https://sheet.example');
      expect(result).toBe(true);
      expect(service.getAttendees()().length).toBe(1);
    });
  });

  // ── 5. localStorage persistence ───────────────────────────────────────────

  describe('localStorage persistence', () => {
    it('restores pending syncs on init and sets syncError', () => {
      const saved = [{ payload: { email: alice.email, attendance: true }, retries: 1 }];
      localStorage.setItem('stack_connect_pending_syncs', JSON.stringify(saved));

      const fresh = new DataService();
      expect(priv(fresh).pendingSyncs).toHaveLength(1);
      expect(priv(fresh).pendingSyncs[0].retries).toBe(1);
      expect(fresh.syncError()).not.toBeNull();
    });

    it('removes the localStorage key when the queue is emptied', () => {
      priv(service).queuePendingSync({ email: alice.email });
      expect(localStorage.getItem('stack_connect_pending_syncs')).not.toBeNull();

      priv(service).pendingSyncs = [];
      priv(service).savePendingSyncs();
      expect(localStorage.getItem('stack_connect_pending_syncs')).toBeNull();
    });

    it('survives corrupt localStorage data without throwing', () => {
      localStorage.setItem('stack_connect_pending_syncs', '%%%invalid json%%%');
      expect(() => new DataService()).not.toThrow();
    });
  });
});
