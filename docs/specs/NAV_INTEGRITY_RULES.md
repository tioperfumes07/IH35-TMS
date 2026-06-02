# Nav integrity rules (Block 9+)

## Invariant

1. **SUBNAV → ROUTE:** Every leaf `href` / `path` in module subnav (accounting, maintenance, drivers, lists, reports, safety tabs, sidebar flyouts) must resolve to a `<Route path="...">` or a `<Navigate>` from that exact path.
2. **ROUTE → NAV:** Every static route must be reachable from at least one subnav/sidebar/hub entry, listed in `scripts/nav-integrity-allowlist.json`, or be a dynamic detail route (`:param`) whose list parent is in the same module.

## Allowlist (`scripts/nav-integrity-allowlist.json`)

| Section | Purpose |
|---------|---------|
| `ADMIN_ONLY` | Owner/admin tools not shown in module subnav |
| `BLOCK_43_TODO` | Known orphans deferred to Block 43 (banking workflows, factoring standalone, ComingSoon stubs, lists domain hubs, legal/misc) |
| `URL_SYNC_DEFERRED` | Route-reachable parents whose tabs are still state/query-only (not dead links) |

Each `BLOCK_43_TODO` entry includes a `reason` comment for audit.

## Guard

- Script: `scripts/verify-nav-integrity.mjs`
- npm: `npm run verify:nav-integrity`
- CI: wired in `npm run verify:arch-design`

## Block 9 scope (Phase B)

- **Accounting:** Bill category filters (`?category=`), Settlements subnav group (dispute + abandonment queues).
- **Maintenance:** Master Data subnav group (7 pages), sidebar severe-repairs fix, removed duplicate `/accounting` redirect route.
- **Drivers:** Cash advance requests link in module nav (no removal of existing subtabs).

## Adding routes

1. Add subnav entry **or** allowlist with reason.
2. Run `npm run verify:nav-integrity`.
3. Prefer route-synced tabs (maintenance/legal pattern) over state-only tabs for new work (Block 43 URL sweep).
