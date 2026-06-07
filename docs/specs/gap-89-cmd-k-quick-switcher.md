# GAP-89 — Universal Cmd-K Quick Switcher

## Summary

Adds a global Cmd+K / Ctrl+K quick switcher that searches loads and drivers (extensible to more entity types) from anywhere in the office TMS shell.

## Database

- Migration `0408_search_universal_index.sql`
- Schema `search.universal_index` with GIN index on `search_text` tsvector
- RLS scoped by `app.operating_company_id`

## API

- `GET /api/search/universal?operating_company_id=&q=&types=&limit=`
- Returns ranked results: `{ results: [{ uuid, entity_type, entity_uuid, display_text, secondary_text, url_path, icon, rank }], count }`

## Backend services

- `indexer.service.ts` — `indexEntity()` upsert + nightly company scans for loads/drivers
- `query.service.ts` — Postgres `plainto_tsquery` search with tenant isolation
- `search-indexer-incremental.ts` — daily 03:00 America/Chicago catch-up job

## Frontend

- `CmdKQuickSwitcher.tsx` — modal overlay, 150ms debounce, arrow/enter navigation, recent search history (10)
- `SearchResultItem.tsx` — per-result row with entity badge
- `AppLayout.tsx` — mounts quick switcher in office shell via `Shell.tsx`

## CI guard

```bash
npm run verify:cmd-k-quick-switcher
```

## Acceptance

- [x] Migration 0406 defines universal search index
- [x] Cmd+K opens modal in office shell
- [x] Keyboard navigation (↑↓ + Enter)
- [x] RLS tenant isolation on index table
- [x] verify script in CI chain
