# Role-Selection Alert System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only dismissible warning/error banner system to the role-selection page that surfaces event configuration problems (missing columns, unset SPOC, missing date, etc.) before they cause silent failures during an event.

**Architecture:** A new GAS `check_columns` read action computes missing required sheet columns server-side and returns only the display names of missing ones. The frontend `DataService` calls this endpoint, exposes the result, and `RoleSelectionComponent` derives all warnings via a `computed()` signal, rendering dismissible banners above the event header. Dismissed banners are tracked in a plain `Set` (reset on every component instantiation).

**Tech Stack:** Angular v21 (zoneless, standalone, signals), Tailwind CSS v4, Google Apps Script

---

## File Map

| File | Change |
|------|--------|
| `Code.gs` | Add `REQUIRED_COLUMNS` constant, `checkColumns()` function, register `'check_columns'` action in `handleReadActions` |
| `src/services/data.service.ts` | Add `checkColumns(sheetUrl: string): Promise<string[]>` method |
| `src/components/role-selection.component.ts` | Add `missingColumns`, `columnCheckDone`, `dismissTick` signals; `dismissedWarnings` Set; `warnings` computed; `dismiss()` method; banner template + slide-down animation |

---

## Task 1: Add `check_columns` GAS action

**Files:**
- Modify: `Code.gs` (lines 109, 141, and after line 1183 — after COLUMN_ALIASES block)

### Step 1.1: Add `'check_columns'` to the `readActions` array

In `Code.gs` line 109, the `readActions` array currently reads:
```javascript
const readActions = ['read', 'get_event', 'get_all_events', 'metadata', 'login', 'auth_exchange', 'auth_refresh', 'get_userinfo', 'log_login_failure', 'log_login_success'];
```

Change it to:
```javascript
const readActions = ['read', 'get_event', 'get_all_events', 'metadata', 'check_columns', 'login', 'auth_exchange', 'auth_refresh', 'get_userinfo', 'log_login_failure', 'log_login_success'];
```

### Step 1.2: Register the action in `handleReadActions`

In `handleReadActions`, after line 141 (`if (action === 'get_all_events') return getAllEventsFromMaster();`), add:

```javascript
  if (action === 'check_columns') return checkColumns(data.sheetUrl);
```

This goes before the `!data.sheetUrl && !data.sheetName` guard so it returns early and handles its own missing-URL case.

### Step 1.3: Add `REQUIRED_COLUMNS` constant and `checkColumns` function

Add this block immediately after the closing `})();` of the `_aliasReverseLookup` IIFE (after line ~1194 in Code.gs):

```javascript
// ─── REQUIRED COLUMNS CHECK ──────────────────────────────────────────────────

/**
 * Maps canonical column names to their first (display) alias.
 * These are the columns whose absence causes actual failures or silent data loss.
 * Subset of COLUMN_ALIASES — optional columns (notes, leadIntel, etc.) are excluded.
 */
const REQUIRED_COLUMNS = {
  email:        'email',
  firstName:    'first name',
  attendance:   'attendance',
  timestamp:    'check-in time',
  spocName:     'spoc of the day',
  spocEmail:    'spoc email',
  lanyardColor: 'colour of the lanyard',
  emailSent:    'email sent'
};

/**
 * Opens the attendee sheet at sheetUrl, reads its header row, and returns
 * which REQUIRED_COLUMNS are absent. Uses COLUMN_ALIASES for matching so any
 * accepted alias counts as "present". Returns first-alias display name for each
 * missing column so the frontend can show human-readable names.
 */
function checkColumns(sheetUrl) {
  if (!sheetUrl) {
    return jsonResponse({ status: 'error', error: 'sheetUrl is required' });
  }
  try {
    const ss = SpreadsheetApp.openByUrl(sheetUrl);
    const sheet = ss.getSheets()[0];
    const rawHeaders = sheet.getDataRange().getValues()[0];
    const headers = rawHeaders
      .map(function(h) { return h.toString().toLowerCase().trim(); })
      .filter(function(h) { return h !== ''; });

    var missing = [];
    Object.keys(REQUIRED_COLUMNS).forEach(function(canonical) {
      var aliases = COLUMN_ALIASES[canonical] || [];
      var found = aliases.some(function(alias) { return headers.indexOf(alias) !== -1; });
      if (!found) {
        missing.push(REQUIRED_COLUMNS[canonical]);
      }
    });

    return jsonResponse({ status: 'success', missing: missing });
  } catch (e) {
    return jsonResponse({ status: 'error', error: 'Could not open sheet: ' + e.toString() });
  }
}
```

### Step 1.4: Manually verify in GAS editor (no test runner)

Open the GAS editor, paste a quick test run in the editor console:
```javascript
// Paste in GAS console, replace URL with a real sheet that has all columns:
checkColumns('https://docs.google.com/spreadsheets/d/<your-sheet-id>/edit');
// Expected: { status: 'success', missing: [] }

// With a sheet missing 'email sent':
// Expected: { status: 'success', missing: ['email sent'] }

// With no sheetUrl:
checkColumns(undefined);
// Expected: { status: 'error', error: 'sheetUrl is required' }
```

### Step 1.5: Commit

```bash
git add Code.gs
git commit -m "feat(gas): add check_columns action to report missing required sheet columns"
```

---

## Task 2: Add `checkColumns` to `DataService`

**Files:**
- Modify: `src/services/data.service.ts` (add method after `fetchSheetMetadata`)

### Step 2.1: Add the method

In `src/services/data.service.ts`, after the `fetchSheetMetadata` method (around line 726), add:

```typescript
  async checkColumns(sheetUrl: string): Promise<string[]> {
    if (!this.SCRIPT_URL || !sheetUrl) return [];
    try {
      const params = new URLSearchParams({ action: 'check_columns', sheetUrl });
      const response = await fetch(`${this.SCRIPT_URL}?${params.toString()}`);
      const json = await this.safeJson(response);
      return (json.status === 'success' && Array.isArray(json.missing)) ? json.missing : [];
    } catch {
      return [];
    }
  }
```

No token attached — same access level as `metadata`. Fails silently (returns `[]`) so a GAS error never blocks the role-selection page from loading.

### Step 2.2: Verify the method is callable

Run the dev server:
```bash
npm run dev
```
Open DevTools console and verify no TypeScript errors appear. No runtime test needed here — the GAS endpoint isn't available in local dev.

### Step 2.3: Commit

```bash
git add src/services/data.service.ts
git commit -m "feat(data-service): add checkColumns method for role-selection health check"
```

---

## Task 3: Add warnings logic and banner UI to `RoleSelectionComponent`

**Files:**
- Modify: `src/components/role-selection.component.ts`

This task replaces the entire component with the updated version. Read the current file before editing to confirm line numbers haven't drifted.

### Step 3.1: Add new signals and `warnings` computed

In the component class body, add after the existing `isEditingSpoc = signal(false);` line:

```typescript
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
```

### Step 3.2: Trigger `checkColumns` in `ngOnInit`

At the end of the `ngOnInit` method, after the `this.dataService.getEventFromMasterLog` call that refreshes SPOC data, add:

```typescript
    // Kick off column check for admin health banners
    if (this.isAdmin()) {
      const sheetUrl = event?.sheetUrl || this.dataService.getEventById(eventId)?.sheetUrl || '';
      if (sheetUrl) {
        this.dataService.checkColumns(sheetUrl).then(missing => {
          this.missingColumns.set(missing);
          this.columnCheckDone.set(true);
        });
      } else {
        // No sheet URL — column check is moot, mark done so missing-sheet banner shows
        this.columnCheckDone.set(true);
      }
    }
```

### Step 3.3: Add slideDown animation to component styles

In the `@Component` decorator, add a `styles` array:

```typescript
  styles: [`
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
```

### Step 3.4: Add banner template block

In the component template, place this block **before** the `<div class="text-center mb-16 relative">` (the event title section), still inside the `<div class="w-full max-w-6xl z-10">`:

```html
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
```

### Step 3.5: Manual verification checklist

Start the dev server (`npm run dev`) and open the role-selection page after navigating from the admin landing:

- [ ] Navigate **directly** to `/#/event/<id>` (not from landing page) → no banners visible
- [ ] Navigate from admin console → event role-selection page with an event that has empty `eventDate` → amber "Event date is not set" banner appears with slide-down animation
- [ ] Set a default SPOC on the event → amber SPOC banner disappears
- [ ] Clear the SPOC, set event date to today → SPOC banner turns red ("imminent")
- [ ] Dismiss a banner → it disappears immediately
- [ ] Navigate away (Back to Events) and return to the same role-selection page → dismissed banner reappears
- [ ] Event with no `sheetUrl` → red "No Google Sheet linked" banner appears
- [ ] On a live GAS deployment: event sheet missing `email sent` column → red "missing columns" banner lists `email sent` in `<code>` styling
- [ ] No missing columns → no "missing columns" banner

### Step 3.6: Commit

```bash
git add src/components/role-selection.component.ts
git commit -m "feat(role-selection): add admin-only dismissible health warning banners"
```

---

## Self-Review Notes

- **Spec coverage:** All 5 warning types covered (missing-sheet, missing-columns, missing-spoc/missing-spoc-urgent, missing-date, event-archived). GAS action + DataService method + component changes all present. ✓
- **No placeholders:** All steps contain actual code. ✓
- **Type consistency:** `severity: 'error' | 'warning'` used consistently in computed and template. `missingColumns`, `columnCheckDone`, `dismissTick` signal names match across steps 3.1, 3.2, and 3.4. ✓
- **Dismiss re-evaluation:** `dismissTick` signal is read inside `warnings` computed to re-run on every `dismiss()` call. ✓
- **Column check timing:** `columnCheckDone` prevents a flash where `missing-columns` would briefly appear then disappear if the check resolves with an empty array. The banner only renders after the check completes. ✓
- **Missing-spoc-urgent / missing-spoc mutual exclusivity:** Handled — only one ID is pushed at a time based on urgency. If severity flips from `missing-spoc` (dismissed) to `missing-spoc-urgent` (new ID), the urgent red banner correctly re-appears. ✓
