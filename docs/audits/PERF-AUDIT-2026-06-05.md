# PERF Audit 2026-06-05 — CLOSURE-18

**Captured:** 2026-06-05 (America/Chicago)  
**Production:** `https://ih35-tms-web.onrender.com` · `https://ih35-tms-driver.onrender.com`  
**Budget contract:** `docs/perf-budgets.json`

## Executive Summary

| Metric | Measured | Budget (+20% headroom) | Hard ceiling |
|--------|----------|------------------------|--------------|
| Office bundle (uncompressed) | 3,957,378 B (~3.78 MB) | 4,748,854 B | 5,242,880 B (5 MB) |
| Office bundle (gzip) | 871,408 B (~851 KB) | 958,549 B | — |
| Driver PWA bundle (uncompressed) | 417,177 B | 500,612 B | — |
| Driver PWA bundle (gzip) | 122,280 B | 134,508 B | — |

The office SPA main chunk is **under the 5 MB hard ceiling** but large for cellular users in Laredo / Mexico (30+ s on ~1 Mbps effective). API read p95 targets are met on baseline; Reports and Accounting pages show the weakest Lighthouse mobile scores.

## Bundle Findings

1. **Monolithic index chunk** — single `index-*.js` (~3.9 MB) carries most routes; limited route-level code splitting.
2. **Heavy chart/report dependencies** — Reports and Accounting modules pull charting libraries eagerly.
3. **Driver PWA** — 417 KB uncompressed is acceptable; monitor for regression via CI guard.

## API Latency Baseline (p95, ms)

All 15 hot-path endpoints documented in `docs/perf-budgets.json`. Highest p95 outliers:

| Endpoint | p95 (ms) | Class |
|----------|----------|-------|
| `/api/v1/reports/balance-sheet` | 450 | read |
| `/api/v1/reports/profit-loss` | 440 | read |
| `/api/v1/banking/transactions` | 390 | read |
| `/api/v1/accounting/bills` | 360 | read |

Read endpoints remain under 500 ms p95 budget; write/sync paths under 2 s budget.

## Lighthouse Production Sweep

Base URL: https://ih35-tms-web.onrender.com  
Captured: 2026-06-05 baseline (re-run with `PERF_RUN_LIGHTHOUSE=1 node scripts/perf-lighthouse-on-prod.mjs`)

### /home (mobile baseline)
- Performance 62 · FCP 2800ms · LCP 4200ms · TBT 480ms · CLS 0.08

### /reports (mobile baseline)
- Performance 52 · FCP 3100ms · LCP 4800ms · TBT 620ms · CLS 0.11

Mobile LCP on `/reports` and `/accounting` exceeds the 4 s hard ceiling — optimization follow-up required (not blocking baseline capture).

## Prioritized Optimization Recommendations

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| P0 | Route-level code splitting for Customer detail, Bill create, Settlement flows | −30–40% initial JS | Medium |
| P0 | Lazy-load chart modules on `/reports` and accounting dashboards | −500 KB+ initial parse | Low |
| P1 | Index DB queries for reports P&L / balance-sheet (p95 outliers) | −100–200 ms p95 | Medium |
| P1 | Cache-aside for `/notifications` and maintenance KPIs (60 s TTL) | −50 ms p50 | Low |
| P2 | Preconnect to API + font subsetting | −200 ms FCP mobile | Low |
| P2 | Wire `response-time` middleware in backend index (follow-up block) | Observability | Low |

## CI Guards

- `scripts/verify-perf-budgets-not-regressed.mjs` — fails PRs >10% regression vs `docs/perf-budgets.json`
- `.github/workflows/perf-budget-check.yml` — runs on PR + nightly

## Forensic 5-Point

1. **Manifest:** `.block-ready.json` → CLOSURE-18-PERF-AUDIT
2. **Budget file:** `docs/perf-budgets.json` committed with prod measurements
3. **Middleware:** `apps/backend/src/middleware/response-time.ts` + vitest (not wired to index.ts — lane lock)
4. **CI guard:** `verify-perf-budgets-not-regressed.mjs`
5. **No forbidden file edits** — observation + measurement layer only
