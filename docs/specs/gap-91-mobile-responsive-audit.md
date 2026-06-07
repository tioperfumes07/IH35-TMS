# GAP-91 — Mobile Responsive Audit + PWA Touch UI Polish

## Summary

Additive mobile audit infrastructure at 375×667 (iPhone SE 2nd gen). Identifies touch-target, table overflow, modal, and input-height risks via static source scan. Ships reusable mobile components without modifying existing office pages.

## Auditor

- `apps/frontend/src/audit/mobile-responsive/auditor.script.mjs`
- Outputs `latest-report.json`
- Regression gate compares against `baseline.json` (whitelisted known issues)

## New components

| Component | Purpose |
|-----------|---------|
| `MobileOptimizedTable` | Table on desktop, cards on `<640px` |
| `SwipeActionRow` | Touch swipe actions for list rows |
| `TouchOptimizedButton` | Driver PWA 56px glove-friendly button |

## Admin report

- Route: `/admin/mobile-audit`
- `MobileAuditReport.tsx` — issue table with owner module + suggested fix

## Scoped CSS

- `mobile-responsive-tweaks.css` — `.mobile-audit-scope` only (no global existing-page edits)
- `touch-target-tweaks.css` — `.driver-pwa-touch-scope` only

## CI

```bash
node apps/frontend/src/audit/mobile-responsive/auditor.script.mjs
npm run verify:mobile-responsive-audit
```

## Follow-up blocks

Per-module fix blocks should reduce baseline issue count over time; CI fails on **new** issues only.
