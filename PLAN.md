# Implementation Plan: Code Quality & Structure Audit Fixes

## Status Legend
- ✅ Done
- ❌ Not done
- ⚠️ Attempted / reverted
- 🔵 Deferred / N/A by design

---

## PHASE 1 — BUG FIXES (Backend)

### ✅ 1.1 Remove duplicate function declarations

**Problem:** `getAllEventsFromMaster`, `updateEventInMaster`, and `getEventFromMaster` each appear twice in `Code.js`. The second definition silently overwrites the first.

**Fix:** The Optimised Code base already has single copies of each. When we uncomment it, duplicates are gone. We will verify each function exists exactly once.

**Status:** Applied in `Code.gs` v10. Each function exists exactly once; `// 1.1: Single authoritative copy (duplicate removed)` comments mark the canonical copies.

---

### ✅ 1.2 Fix lock double-release

**Problem:** `updateAttendee()` receives the `lock` object and calls `lock.releaseLock()` early (before sending email). Then `handleWriteActions`' `finally` block calls `lock.releaseLock()` again.

**Fix:** Wrap the `finally` release in a boolean guard:

```javascript
let lockReleased = false;

// Inside updateAttendee, when releasing early:
if (lock && !lockReleased) {
  lock.releaseLock();
  lockReleased = true;
}

// In the finally block of handleWriteActions:
finally {
  if (!lockReleased) {
    try { lock.releaseLock(); } catch(e) {}
  }
}
```

Since `updateAttendee` needs to signal back that it released the lock, we'll refactor `handleWriteActions` so that `updateAttendee` returns a result object `{ response, lockReleased }`. The `finally` block checks this flag.

**Status:** Applied in `Code.gs` v10. `updateAttendee` returns `{ response, lockReleased }` and releases the lock early before sending email. The `finally` block in `handleWriteActions` checks the `lockReleased` flag before calling `lock.releaseLock()` again.

---

### ✅ 1.3 Document off-by-one reasoning

**Problem:** The index math in `addWalkIn` → `sendCheckInNotification(sheet, targetRow - 1, ...)` is correct but undocumented.

**Fix:** Add a block comment explaining the indexing.

**Status:** Comment present in current `Code.gs`.

---

## PHASE 2 — SECURITY (Backend)

### ✅ 2.1 Authentication direction (text only, no code)

**Status:** Direction documented in this plan. No code change required.

Recommended approach for when you're ready:

1. **API Key in URL parameter** — simplest. Generate a random token per event, store it in PropertiesService. Frontend includes `?apiKey=xxx` in every request. Backend validates before processing. Pros: zero infrastructure. Cons: URL-visible, no per-user identity.

2. **Google OAuth + Identity-Aware Proxy** — if moving to Cloud Functions. Google Workspace users authenticate via OAuth; the Cloud Function validates the ID token. Gives you per-user identity and role-based access. Heavier setup.

3. **Shared secret + HMAC** — middle ground. Frontend signs requests with a secret (stored in environment config). Backend validates the HMAC. No per-user identity but prevents unauthenticated access.

For an internal app, **option 1 (API key per event)** is the pragmatic first step. You could add it to the master log row and validate on every request.

---

### ✅ 2.2 Input validation

**Problem:** POST payloads flow directly into sheet operations with no validation.

**Fix:** Add a `validatePayload(action, data)` function at the top of `handleWriteActions`:

```javascript
function validatePayload(action, data) {
  const errors = [];

  const stringFields = ['email','firstName','lastName','fullName','company','contact','title','linkedin','notes','leadIntel'];
  stringFields.forEach(f => {
    if (data[f] && String(data[f]).length > 500) {
      errors.push(f + ' exceeds 500 character limit');
    }
  });

  if (action === 'add') {
    if (!data.email || !data.fullName) errors.push('email and fullName are required');
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Invalid email format');
    if (data.contact && !/^\+?[0-9\s\-().]{7,20}$/.test(data.contact)) errors.push('Invalid phone format');
    if (data.autoCheckIn !== undefined && typeof data.autoCheckIn !== 'boolean') errors.push('autoCheckIn must be boolean');
  }

  if (action === 'update') {
    if (!data.email) errors.push('email is required for update');
    if (data.attendance !== undefined && typeof data.attendance !== 'boolean') errors.push('attendance must be boolean');
    if (data.lanyardColor && String(data.lanyardColor).length > 50) errors.push('lanyardColor too long');
  }

  if (action === 'update_event') {
    if (!data.eventId) errors.push('eventId is required');
    if (data.state && ['Active','Archived','Deleted'].indexOf(data.state) === -1) errors.push('Invalid state value');
  }

  if (action === 'log_event') {
    if (!data.eventId || !data.eventName || !data.sheetUrl) errors.push('eventId, eventName, sheetUrl required');
  }

  return errors;
}
```

Called in `handleWriteActions` before acquiring the lock:
```javascript
const validationErrors = validatePayload(action, data);
if (validationErrors.length > 0) {
  return jsonResponse({ status: 'error', error: 'Validation failed: ' + validationErrors.join('; ') });
}
```

**Status:** Applied in `Code.gs` v10. `validatePayload()` is called at the top of `handleWriteActions` before the lock is acquired.

---

### ✅ 2.3 HTML escaping in emails

**Problem:** User-supplied strings (`fullName`, `company`, `contact`) are injected into HTML email bodies without escaping.

**Fix:** Add an `escapeHtml` helper and wrap every user-supplied value in `sendCheckInNotification`:

```javascript
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

**Status:** Applied in `Code.gs` v10. `escapeHtml()` helper added; all user-supplied values in `sendCheckInNotification` are wrapped with it.

---

### ❌ 2.4 Rate limiting

**Problem:** No protection against request floods.

**Fix:** Fixed Window Counter using CacheService:

```javascript
function checkRateLimit(action) {
  var cache = CacheService.getScriptCache();
  var windowSeconds = 60;
  var bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  var key = 'rl:' + action + ':' + bucket;
  var count = parseInt(cache.get(key) || '0', 10);
  var limits = { add: 20, update: 60, log_event: 10, update_event: 10 };
  var maxRequests = limits[action] || 30;
  if (count >= maxRequests) return false;
  cache.put(key, String(count + 1), windowSeconds + 10);
  return true;
}
```

Called at the top of `handleWriteActions`, BEFORE acquiring the lock.

**Status:** Not implemented. No `checkRateLimit` function exists in `Code.gs` v10.

---

## PHASE 3 — CODE QUALITY (Backend)

### ✅ 3.1 Concurrency: Read/write split + autoCheckIn

**Status:** v9 already has `handleReadActions` / `handleWriteActions` split with CacheService (15s TTL) on reads. The `autoCheckIn` flag is fully implemented in the current `addWalkIn` — sets `attendance=true`, records check-in time, and fires `sendCheckInNotification` (email + Slack) when `autoCheckIn=true`.

---

### ✅ 3.2 Fix attendee object doubling (camelCase only)

**Problem:** `readData` emits both `camelCase(header)` AND raw header string as keys — doubles every payload.

**Fix:** Emit camelCase keys only:

```javascript
headers.forEach((h, i) => {
  obj[camelize(h.toString())] = row[i]; // remove the duplicate obj[h] = row[i] line
});
```

**Status:** Applied in `Code.gs` v10. `readData()` emits camelCase keys only.

---

### ✅ 3.3 Column name-based references instead of magic numbers

**Problem:** `updateEventInMaster` and `logEventToMaster` use hardcoded column numbers (`getRange(targetRow, 10)` etc.).

**Fix:** `getMasterColumnMap()` helper reads header row by name:

```javascript
function getMasterColumnMap(masterSheet) {
  var headers = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function(h, i) { map[h.toString().trim()] = i + 1; });
  return map;
}
```

**Status:** Applied in `Code.gs` v10. `getMasterColumnMap()` is used in `getAllEventsFromMaster`, `updateEventInMaster`, and `getEventFromMaster`.

---

### ✅ 3.4 Flat map for `getColumnIndices` (replacing else-if chain)

**Problem:** The `else-if` chain is hard to maintain and fragile.

**Fix:** Replace with a `COLUMN_ALIASES` config map + reverse lookup (single O(n) pass, first-match-wins).

**Status:** Applied in `Code.gs` v10. `COLUMN_ALIASES` config map and `_aliasReverseLookup` reverse lookup replace the else-if chain in `getColumnIndices()`.

---

### 🔵 3.5 Pagination

At ~1,000 rows max, no pagination needed. CacheService 15s TTL handles the read load. No change required.

---

## PHASE 4 — FRONTEND

### ✅ 4.1 roleGuard — TODO placeholder

**Status:** TODO comment added to `src/guards/role-guard.ts`.

---

### ✅ 4.2 Environment variables for GAS URL

**Status:** Implemented via a different approach than the original attempt. `VITE_GAS_URL` was abandoned (Angular esbuild doesn't inject Vite env vars). Instead, `src/environments/environment.prod.ts` holds a `GAS_URL_PLACEHOLDER` literal which CI/CD replaces with `sed` using the `GAS_URL` GitHub secret before building. `data.service.ts` reads from `environment.gasUrl` (the Angular environments pattern). A verification step in `deploy.yml` fails the build if the placeholder was not replaced.

---

### ✅ 4.3 Dummy auth hardcoded email removed

**Status:** Replaced `harshvardhan@browserstack.com` with generic placeholder `spoc@company.com` in `dummy-auth.service.ts`.

---

### ✅ 4.4 Fire-and-forget → fire-with-fallback

**Status:** `syncChangeToBackend` uses `AbortController` (5s timeout). Failed syncs are queued in `pendingSyncs` and retried on next `loadFromBackend`. `public syncError` signal exposed — amber banner shown in `app.component.ts` when syncs are pending.

---

### ✅ 4.5 Global error handler

**Status:** `src/services/global-error-handler.ts` created. Registered as Angular's `ErrorHandler` in `index.tsx`. Red toast shown in `app.component.ts` with 8s auto-dismiss.

---

### 🔵 4.6 Component decomposition

**Status:** Deferred per plan. TODO comments mark extraction points in `spoc-dashboard.component.ts` and `landing-page.component.ts`.

---

### ✅ 4.7 `src/constants.ts` created

**Status:** `STORAGE_KEYS`, `SYNC_CONFIG`, `VALIDATION`, `DEFAULT_LANYARD_COLOR`, `LANYARD_COLORS_FALLBACK` all centralised. All components and services import from constants.

---

### ✅ 4.8 Unify walk-in workflows

**Status:** `validateWalkInData()` exported from `data.service.ts` and used by both `walk-in-page.component.ts` and the admin modal in `spoc-dashboard.component.ts`. Company field added as required to admin modal.

---

### ⚠️ 4.9 Tailwind CSS production setup

**Status:** Attempted — `src/styles.css`, `postcss.config.mjs`, and `tailwind.config.js` were added and Angular was configured to compile Tailwind at build time. This caused persistent build failures (Angular v4 PostCSS incompatibility) and visual breakage. Fully reverted — CDN Tailwind restored in `index.html`.

---

### ✅ 4.10 `.gitignore` update

**Status:** `.env`, `.env.local`, `.env.*.local` added to `.gitignore`. `.env.example` exists in repo for documentation. Dead `/index.css` link also removed from `index.html`.

---

## Summary

| Item | Status |
|------|--------|
| 1.1 Remove duplicate functions | ✅ |
| 1.2 Fix lock double-release | ✅ |
| 1.3 Document off-by-one index | ✅ |
| 2.1 Auth direction documented | ✅ |
| 2.2 Backend input validation | ✅ |
| 2.3 HTML escaping in emails | ✅ |
| 2.4 Rate limiting | ❌ |
| 3.1 Read/write split + autoCheckIn | ✅ |
| 3.2 Payload doubling fix | ✅ |
| 3.3 Column name references | ✅ |
| 3.4 Flat map getColumnIndices | ✅ |
| 3.5 Pagination | 🔵 N/A |
| 4.1 roleGuard TODO | ✅ |
| 4.2 GAS URL env variable | ✅ |
| 4.3 Remove hardcoded email | ✅ |
| 4.4 Fire-with-fallback sync | ✅ |
| 4.5 Global error handler | ✅ |
| 4.6 Component decomposition | 🔵 Deferred |
| 4.7 constants.ts | ✅ |
| 4.8 Unified walk-in validation | ✅ |
| 4.9 Tailwind production build | ⚠️ Reverted |
| 4.10 .gitignore + .env.example | ✅ |

**19 / 22 fully done. 1 item outstanding (2.4 Rate limiting). 4.9 Tailwind production build remains reverted.**

---

## NOT IN SCOPE (Deferred)

- Full component decomposition (marked with TODOs)
- Real authentication implementation (direction documented in 2.1)
- roleGuard proper implementation (TODO added)
- Remove test functions from GAS (you'll handle)
- Pagination for read endpoint (not needed at ~1000 rows)
