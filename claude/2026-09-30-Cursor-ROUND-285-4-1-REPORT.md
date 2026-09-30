# 285.4.1 / 283.3 — board_scope static guard (build-fail)

## What changed
- `scripts/verify-list-loads-requires-board-scope.mjs`: **board_scope required** — status alone fails selftest; scans `listLoads`/`listAllLoads` object+bare calls and raw FE `/mdata/loads` list URLs; `drafts_only` only exception. Wired in verify-step **10931**.
- `apps/frontend/src/api/loads.ts` `listLoads()`: **throws** if `board_scope` and `drafts_only` both absent.
- `useInvoiceCreateFromLoad`: always passes `board_scope` (`live`|`history`).
- LAW.json title updated to match Lead restatement.

## PROOF (285.4.1)
```
node scripts/verify-list-loads-requires-board-scope.mjs --selftest
  bare unscoped fails ✓
  status alone fails ✓
  board_scope live passes ✓
  SELFTEST PASS
node scripts/verify-list-loads-requires-board-scope.mjs
  PASS — every call declares board_scope (or drafts_only)
```
Lead branch `lead/loadboard-283-one-source` already MERGED #23216 → `218cc70131` (push/PR done).
