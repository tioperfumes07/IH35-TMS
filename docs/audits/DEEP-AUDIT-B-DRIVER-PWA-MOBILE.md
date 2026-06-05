# DEEP-AUDIT-B — Driver PWA Mobile @ 375px

**Block:** CLOSURE-15-DEEP-AUDIT-B (Lane A)  
**Date:** 2026-06-05 (CST / Laredo)  
**Base SHA:** `cd467c30a` (dispatch)  
**Viewport:** 375×667 (iPhone SE class) — Chrome DevTools emulation + static `max-w-md` markers  
**CI guard:** `npm run verify:deep-audit-b-driver-pwa-375`

> **Pause point:** Live login/POD camera/geo tests require a test driver account (Jorge). Static + marker audit completed; manual device pass recommended before production driver rollout.

## Flow matrix

| Flow | Route / component | 375 layout | Static result | Manual / runtime |
|------|-------------------|------------|---------------|------------------|
| Login | `/login` `LoginPage` | `min-h-screen`, `min-h-11` toggles | **PASS** | OTP + Google SSO need live creds |
| Load assignment | `/loads/:id` `LoadDetailPage` | `max-w-md`, bottom padding `pb-24` | **PASS** | Needs assigned load |
| Geo-fence | `StopActionPage`, `AcceptancePage` `useGeofence` | Status card + blocked actions | **PASS** (static) | Mock coords in DevTools sensors |
| POD camera upload | `PodCapture` `capture` input + `compressImage` | `data-testid="pod-capture-panel"` | **PASS** (static) | Camera permission on device |
| Settlement view | `/earnings` `EarningsPage` | `max-w-md`, cycle KPIs | **PASS** (static) | Needs settlement cycle data |
| Cash advance | `/cash-advance`, `/cash-advance/new` | `max-w-md`, min-h-11 links | **PASS** (static) | TMS admin approval path separate |
| Logout | `/profile` → `signOut()` | `min-h-11` back link | **PASS** (static) | Session cookie clear on API |
| PWA install prompt | `InstallPrompt` | Fixed bottom card, safe-area aware | **PASS** (static) | `beforeinstallprompt` unreachable headless — **manual** iOS/Android |
| Offline mode | `upload-sync.ts` + `PendingSyncBar` | Queue bar above bottom nav | **PASS** (static) | Toggle DevTools offline + upload |

## 375px layout notes

- **Shell:** Pages use `max-w-md` centered column — no horizontal overflow at 375.
- **Bottom nav:** 7 icons in `grid-cols-7`, `text-[10px]` labels — tight but meets `min-h-11` touch targets; safe-area padding on `BottomNav`.
- **Load detail tabs:** Horizontal scroll `overflow-x-auto` on overview/stops/documents — **PASS** at 375.
- **Pending sync bar:** Sits above bottom nav (`z-30`) — does not obscure primary actions.

## Geo-fence behavior (static)

- `StopAction`: pending → denied → inside → approaching → outside states with i18n strings.
- `Acceptance`: blocks signature submit unless `geofence.inside` at pickup (25 mi radius default).
- Arrive/depart POST includes `lat`, `lng`, `accuracy_m`.

## Offline / sync

- `upload-sync.ts`: listens to `navigator.onLine`, exponential backoff (`RETRY_BACKOFF_MS`), 5-min interval sync.
- `PendingSyncBar`: shows syncing / offline-waiting / error modes with `pendingCount`.
- IndexedDB queue via `upload-queue.ts` (initialized in `ProtectedRoute`).

## Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| B-PWA-1 | **MEDIUM** | 7-item bottom nav labels truncate on narrow 375 — usable but dense; consider collapsing secondary items. | `BottomNav.tsx` |
| B-PWA-2 | **MEDIUM** | Install prompt cannot be validated in CI/headless — iOS requires manual “Add to Home Screen”. | `InstallPrompt.tsx` |
| B-PWA-3 | **LOW** | Cash advance not in bottom nav — reachable via deep link / scheduler flows only. | `App.tsx` routes |
| B-PWA-4 | **LOW** | Login loading state is text-only spinner — no branded skeleton. | `LoginPage.tsx` |

**CRITICAL:** None — mobile markers and offline queue wiring present.

**HIGH:** None in static audit; runtime driver login blocked on credentials (documented pause).

## CI guard

`scripts/deep-audit-b-driver-pwa-375.mjs` asserts 13 flow files expose 375-safe markers (`max-w-md`, `min-h-11`, geofence, POD camera, sync/offline).
