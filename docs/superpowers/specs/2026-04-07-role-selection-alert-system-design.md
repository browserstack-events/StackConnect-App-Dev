# Role-Selection Alert System — Design Spec
**Date:** 2026-04-07  
**Status:** Approved

---

## Overview

Add a dismissible admin-only warning/error banner system to the role-selection page (`RoleSelectionComponent`). Banners surface configuration problems that could silently cause failures during an event (missing sheet columns, unset SPOC, no event date, etc.). Dismissed banners re-appear on every fresh navigation to the role-selection page — there is no persistence across visits.

---

## 1. Warnings Catalogue

| ID | Severity | Trigger Condition | Display Message |
|----|----------|-------------------|-----------------|
| `missing-sheet` | **Error (Red)** | `event.sheetUrl` is empty | "No Google Sheet is linked to this event. Attendee data cannot be loaded." |
| `missing-columns` | **Error (Red)** | GAS `check_columns` returns ≥1 missing column | "Attendee sheet is missing required columns: [X, Y, Z]. Add these to prevent data errors." |
| `missing-spoc-urgent` | **Error (Red)** | Default SPOC not set AND event date is set AND `now >= eventDate − 12 hrs` | "No default SPOC is configured and the event is imminent. Walk-in attendees won't be auto-assigned." |
| `missing-spoc` | **Warning (Amber)** | Default SPOC not set AND (event date empty OR > 12 hrs away) | "No default SPOC configured. Walk-in attendees won't be assigned to a SPOC automatically." |
| `missing-date` | **Warning (Amber)** | `eventDate` is empty string | "Event date is not set. Check-in emails and walk-in forms may show incorrect dates." |
| `event-archived` | **Warning (Amber)** | `event.state` is `'Archived'` or `'Deleted'` | "This event is marked as Archived/Deleted. You may be viewing stale or inactive data." |

**Rendering order:** errors first (red), then warnings (amber), each sorted by the order in the table above. The `missing-spoc-urgent` and `missing-spoc` are mutually exclusive (only one fires at a time).

**Visibility:** Banners are only rendered when `isAdmin()` is `true` (navigated from the admin landing page via `sessionStorage['from_landing'] === 'true'`).

---

## 2. GAS Backend — `check_columns` Action

### Location
`Code.gs` — new read action registered in `handleRequest()`.

### Request
```
GET ?action=check_columns&sheetUrl=<encoded-url>
```
No authentication required beyond existing GAS deployment access (same as `read`).

### Logic
1. Open the sheet at `sheetUrl` using `SpreadsheetApp.openByUrl()`.
2. Read the first row (header row) of the active/first sheet.
3. Normalise each header: `header.toString().toLowerCase().trim()`.
4. For each entry in `REQUIRED_COLUMNS` (see below), check whether any of its aliases matches a normalised header. If no alias matches → it is missing.
5. Return the **first alias** of each missing column as its display name.

### REQUIRED_COLUMNS
Subset of `COLUMN_ALIASES` where absence causes actual failures or silent data loss:

| Canonical | First Alias (display name) | Why required |
|-----------|---------------------------|--------------|
| `email` | `email` | Primary key for all updates; backend errors out without it |
| `firstName` | `first name` | Walk-in add writes this column |
| `attendance` | `attendance` | Check-in toggle writes this column |
| `timestamp` | `check-in time` | Check-in time is written here |
| `spocName` | `spoc of the day` | SPOC assignment on walk-in add |
| `spocEmail` | `spoc email` | Check-in notification email uses this |
| `lanyardColor` | `colour of the lanyard` | Lanyard assignment on walk-in add |
| `emailSent` | `email sent` | De-duplication guard — prevents duplicate check-in emails |

### Response
```json
{ "status": "success", "missing": ["first name", "email sent"] }
```
On error (sheet not accessible, invalid URL):
```json
{ "status": "error", "error": "Could not open sheet: ..." }
```
On no missing columns:
```json
{ "status": "success", "missing": [] }
```

---

## 3. Frontend — `DataService` Changes

### New method
```typescript
async checkColumns(sheetUrl: string): Promise<string[]>
```
- Calls `GET ?action=check_columns&sheetUrl=<sheetUrl>`
- Returns the `missing` array on success, or `[]` on any error (fail silently — column check is informational, not blocking)
- No token required (same access level as `read`)

---

## 4. Frontend — `RoleSelectionComponent` Changes

### New signals / state
```typescript
private missingColumns = signal<string[]>([]);
private columnCheckDone = signal(false);
// Plain Set — not a signal. Initialised fresh each time the component is created.
private dismissedWarnings = new Set<string>();
```

### `ngOnInit` addition
After resolving event data, if `isAdmin()` and `event.sheetUrl` is non-empty:
```typescript
this.dataService.checkColumns(event.sheetUrl).then(missing => {
  this.missingColumns.set(missing);
  this.columnCheckDone.set(true);
});
```

### `warnings` computed signal
```typescript
warnings = computed(() => {
  if (!this.isAdmin()) return [];
  const event = this.dataService.getEventById(this.id());
  if (!event) return [];

  const list: Array<{ id: string; severity: 'error' | 'warning'; message: string }> = [];

  // missing-sheet
  if (!event.sheetUrl) {
    list.push({ id: 'missing-sheet', severity: 'error',
      message: 'No Google Sheet is linked to this event. Attendee data cannot be loaded.' });
  }

  // missing-columns (only after check completes to avoid flash)
  if (this.columnCheckDone() && this.missingColumns().length > 0) {
    const cols = this.missingColumns().join(', ');
    list.push({ id: 'missing-columns', severity: 'error',
      message: `Attendee sheet is missing required columns: ${cols}. Add these to prevent data errors.` });
  }

  // missing-spoc (urgent vs normal)
  const spocMissing = !this.defaultSpocName() || !this.defaultSpocEmail();
  if (spocMissing) {
    const isUrgent = (() => {
      if (!event.eventDate) return false;
      const eventMs = new Date(event.eventDate + 'T00:00:00').getTime();
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

  // missing-date
  if (!event.eventDate) {
    list.push({ id: 'missing-date', severity: 'warning',
      message: 'Event date is not set. Check-in emails and walk-in forms may show incorrect dates.' });
  }

  // event-archived
  if (event.state === 'Archived' || event.state === 'Deleted') {
    list.push({ id: 'event-archived', severity: 'warning',
      message: `This event is marked as ${event.state}. You may be viewing stale or inactive data.` });
  }

  // Filter out dismissed
  return list.filter(w => !this.dismissedWarnings.has(w.id));
});
```

### `dismiss(id: string)` method
Adds to `dismissedWarnings`. To trigger re-evaluation of the `computed`, a `dismissTick` signal increments:
```typescript
private dismissTick = signal(0);
dismiss(id: string) {
  this.dismissedWarnings.add(id);
  this.dismissTick.update(n => n + 1);
}
// warnings computed also reads dismissTick() to re-run on dismiss
```

---

## 5. Frontend — Banner UI Design

### Aesthetic direction
The existing app is **refined minimal** — slate/teal palette, clean white cards, subtle shadows, rounded corners. Banners follow this system but carry urgency through color and a bold left-border accent, not visual noise.

### Banner anatomy (per banner)
```
┌─ [3px left border] ──────────────────────────────────────────────────────────┐
│  [icon]  Message text that explains the issue clearly            [× dismiss] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Visual spec
- **Error (red):** `bg-red-50`, `border-l-4 border-red-500`, icon in `text-red-500`, text in `text-red-800`
- **Warning (amber):** `bg-amber-50`, `border-l-4 border-amber-400`, icon in `text-amber-500`, text in `text-amber-800`
- **Dismiss button:** `text-current opacity-50 hover:opacity-100`, `×` character, no background
- **Entry animation:** slide down + fade in with `animation-delay` staggered by index (20ms per banner). CSS keyframe: `@keyframes slideDown { from { opacity:0; transform: translateY(-8px) } to { opacity:1; transform: translateY(0) } }`
- **Layout:** Banners stack vertically, placed **above** the event title, spanning full width of the content container (`w-full max-w-6xl`)
- **Missing-columns banner:** column names rendered as inline `<code>` tags with subtle `bg-red-100 rounded px-1` styling

### Icons (inline SVG, no icon library needed)
- Error: exclamation circle
- Warning: exclamation triangle

---

## 6. Files Changed

| File | Change |
|------|--------|
| `Code.gs` | Add `check_columns` action handler + `REQUIRED_COLUMNS` constant |
| `src/services/data.service.ts` | Add `checkColumns(sheetUrl)` method |
| `src/components/role-selection.component.ts` | Add signals, `warnings` computed, `dismiss()`, banner template |

No new files required.

---

## 7. Out of Scope

- Persistent dismissal across sessions (not requested — resets on every visit by design)
- Banners on non-admin role pages (SPOC dashboard, walk-in form)
- Auto-fix actions from banners (e.g. "Add missing columns" button)
