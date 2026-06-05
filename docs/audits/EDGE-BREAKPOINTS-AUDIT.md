# EDGE BREAKPOINTS AUDIT

Date: 2026-06-05  
Branch: `closure/mobile-edge`  
Scope: `320px`, `1920px`, `2560px`

## Summary

- Added dedicated edge breakpoint stylesheet at `apps/frontend/src/styles/breakpoints-edge.css`.
- Added reusable wrapper at `apps/frontend/src/components/layout/UltraWideContainer.tsx`.
- Added automated edge guards:
  - `scripts/edge-breakpoint-walk-320.mjs`
  - `scripts/edge-breakpoint-walk-1920.mjs`
  - `scripts/edge-breakpoint-walk-2560.mjs`
  - `scripts/verify-no-overflow-at-edge-breakpoints.mjs`

## Breakpoint Findings

### 320 (small mobile)

- Added `<375` media query for micro-layout (`@media (max-width: 374px)`).
- Enforced single-column KPI layout marker (`.edge-kpi-grid`).
- Added stacked primary-action marker (`.edge-primary-actions`) for narrow widths.
- Verified mobile nav trigger and hidden desktop controls markers in topbar.

### 1920 (desktop)

- Added `@media (min-width: 1920px)` max-width container (`1800px`) centered on page.
- Added `edge-ultrawide-shell` wrapper marker and shared shell class for adoption.
- Established explicit import link from `UltraWideContainer` to edge stylesheet.

### 2560 (ultrawide)

- Added `@media (min-width: 2560px)` max-width container (`2200px`).
- Added KPI scale markers (`.edge-kpi-card`) for larger card widths.
- Added typography scale marker for ultrawide readability.

## Evidence Notes

- Static guard scripts validate markers and route/module coverage.
- Screenshot capture is deferred to CI/browser execution environment.
