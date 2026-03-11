# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StackConnect-App is an event check-in and attendee management system for Sales SPOCs (Sales Points of Contact). The frontend is Angular v21 (standalone components, zoneless, hash routing) deployed to GitHub Pages. The backend is a Google Apps Script (GAS) deployed as a web app that reads/writes to Google Sheets.

## Commands

```bash
npm install --legacy-peer-deps   # Install dependencies (legacy flag required)
npm run dev                       # Dev server on http://localhost:3000
npm run build                    # Production build to ./dist
```

No test runner is configured in this project.

## Environment Setup

Copy `.env.example` to `.env` and set `VITE_GAS_URL` to your Google Apps Script deployment URL:

```
VITE_GAS_URL=https://script.google.com/macros/s/.../exec
```

In production, CI/CD replaces `GAS_URL_PLACEHOLDER` in `src/environments/environment.prod.ts` using the `GAS_URL` GitHub secret.

## Architecture

### Frontend (Angular v21)
- **Entry point:** `index.tsx` — bootstraps `AppComponent` with zoneless change detection and hash-based routing (`withHashLocation()`)
- **Routing:** `src/app.routes.ts` — all routes use `/#/` prefix (hash routing for static hosting)
- **State management:** Angular Signals throughout (`signal`, `computed`, `effect`) — no NgRx or RxJS subjects
- **Styling:** Tailwind CSS v4 via PostCSS

### Backend (Google Apps Script)
- **File:** `Code.gs` — single-file GAS backend (~877 lines)
- **Protocol:** All requests go through `doGet`/`doPost` → `handleRequest()` with an `action` parameter
- **Read actions:** `read`, `metadata`, `get_event`, `get_all_events`
- **Write actions:** `add`, `update`, `log_event`, `update_event` (all acquire a ScriptLock)
- **Caching:** Reads cached for 15s per sheet (`read_{sheetId}` key); cache cleared on writes
- **Email:** GAS sends HTML notification emails to SPOCs on attendee check-in via `GmailApp`

### Key Components
| File | Purpose |
|------|---------|
| `src/components/landing-page.component.ts` | Admin console — create/manage events, copy share links |
| `src/components/spoc-dashboard.component.ts` | Main attendee grid; `mode='admin'` (full access) or `mode='spoc'` (read-mostly). Shows login overlay when session is absent/expired — data fetch is deferred until auth passes. |
| `src/components/attendee-detail.component.ts` | Modal showing attendee details, lead intel (markdown), notes |
| `src/components/walk-in-page.component.ts` | Public registration form for walk-in attendees |
| `src/components/role-selection.component.ts` | Gateway page to choose Desk / SPOC / Walk-in role (no auth here — links go directly to the dashboard URLs) |
| `src/services/auth.service.ts` | Passphrase-based auth; validates against GAS Script Properties; stores session in localStorage with 6-hour TTL |
| `src/services/data.service.ts` | All API calls, signals-based state, sync retry queue |
| `src/guards/role-guard.ts` | `walkinGuard` (public); desk/spoc routes have no guard — the dashboard component handles auth internally via the login overlay |

### Data Flow
1. Frontend calls GAS via `fetch()` in `DataService`
2. GAS reads from / writes to Google Sheets
3. Attendee list auto-refreshes every 60s; failed writes are queued with up to 3 retries
4. A `syncError` signal drives a warning banner when pending writes exist

### Route Map
```
/#/                          → PublicHomeComponent (restricted access message)
/#/admin-console             → LandingPageComponent (event management)
/#/event/:id                 → RoleSelectionComponent
/#/event/:id/desk            → SpocDashboardComponent (admin mode)
/#/event/:id/spoc            → SpocDashboardComponent (SPOC mode)
/#/register/:id              → WalkInPageComponent (public form)
```

## Key Design Decisions

- **Hash routing** is intentional — required for GitHub Pages static hosting without a server
- **Zoneless change detection** (`provideZonelessChangeDetection()`) — use Angular Signals for reactivity; do not use `NgZone` or zone-dependent APIs
- **Auth via login overlay on the dashboard** — the desk and SPOC links are shared directly (`/#/event/:id/desk`, `/#/event/:id/spoc`). When a user opens these links without a valid session, the dashboard renders but shows a full-screen translucent/blur overlay with a passphrase form. No data is fetched until auth succeeds. Sessions persist in localStorage with a 6-hour TTL. Passphrases (`DESK_PASSPHRASE`, `SPOC_PASSPHRASE`) are stored in GAS Script Properties — never in the frontend bundle.
- **Login is a GET request to GAS** — using `?action=login&role=…&passphrase=…` to avoid CORS preflight (OPTIONS) which GAS cannot handle
- **Flexible column parsing** — `parseJsonData()` in DataService handles varying column names/order from Google Sheets; column mapping is case-insensitive and alias-based
- **Walk-in validation** rejects personal email domains (`@gmail`, `@yahoo`, `@hotmail`, `@outlook`, `@zoho`, `.edu`)

## CI/CD

GitHub Actions (`.github/workflows/deploy.yml`) triggers on push to `main`:
1. Injects `GAS_URL` secret into `environment.prod.ts`
2. Builds with `--base-href /StackConnect-App/`
3. Deploys to GitHub Pages

Requires repository secret: `GAS_URL`

## Backend Deployment

`Code.gs` is deployed separately via the Google Apps Script editor. The deployed URL goes into `GAS_URL`. After editing `Code.gs`, redeploy as a new version in the GAS editor and update the secret/environment variable with the new URL.
