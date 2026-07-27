# ACCT-R-44 — accounting surfaces crash to a blank page on a partial optional chain (2026-07-27)

**Finding:** ACCT-R-44 (ranked **ACCT-F14**)
**Lane:** NON-FINANCIAL — frontend reliability. No GL math, no schema, no posting path touched.
**Manifest item:** `docs/module-completion/accounting.json` → `ACCT-R-44`
**PR:** #3669

## Why this is registered as an accounting finding

The defect is a cross-cutting frontend crash class, but four of its instances sit on
`apps/frontend/src/pages/accounting/**`, which `MONEY_PATH_RE` in `verify-no-money-theater.mjs`
correctly classifies as money-touching. Rather than borrow an unrelated `ACCT-F##` or fabricate one,
the finding is recorded here on its own merits: an accounting surface that unmounts to a blank page is
an accounting defect, whatever the mechanism.

## Root cause

`query.data?.rows.length` guards the **first** hop and nothing after it. When the query resolves to an
object that lacks `rows`, `.length` throws. Because these expressions sit in render, React unmounts the
**entire page** to the router ErrorBoundary — the operator sees a blank screen, not a missing badge.

The `?.` makes the line *look* defensive, which is why it passed review 39 times across the codebase.
It defends the wrong hop. That is precisely why the control has to be mechanical rather than careful
reading.

Accounting surfaces affected:

| file | expression |
|---|---|
| `pages/accounting/CoaRolesPage.tsx` | `accountsQuery.data?.accounts.length` |
| `pages/accounting/CollectionsPage.tsx` | `.data?.<list>.length` (×2) |
| `pages/accounting/UndepositedFundsPage.tsx` | `.data?.<list>.length` (×2) |
| `pages/accounting/AccountingAuditTrailPage.tsx` | `.data?.pages.flatMap` |
| `pages/qbo-sync-detail/QboSyncDetailPage.tsx` | `.data?.pages.flatMap` |

## Live proof

- Reproduced in the frontend suite 2026-07-27: `useSettlementDisputes`' `openCount`
  (`listQuery.data?.disputes.filter(...)`) killed the whole Drivers page with
  `TypeError: Cannot read properties of undefined (reading 'filter')`.
- `MissingRequiredChip` has the same shape on `summary.required.filter`, and that chip renders inside
  the fleet, asset and vehicle profile pages — one malformed payload blanks all three.
- Whole frontend suite: **106 failing / 1169 passing**, against an `origin/main` baseline of
  **161 / 1114**, measured by stashing every change and re-running. 11 fixed, 0 regressed.
- `npx tsc -b --force --pretty false`: exit 0.

## Fix

Every site guards each hop (`data?.X?.method()`), and an absent list reads as an empty one — the same
meaning a caller gives `[]`, with the page surviving. No behaviour change on well-formed responses.

## Guard

`scripts/verify-no-partial-optional-chain.mjs` + `scripts/verify-steps/1650-verify-no-partial-optional-chain.mjs`.

It earned its place immediately by finding four sites the manual sweep missed — `.data?.pages.flatMap`
in two of the accounting pages above (`flatMap` was absent from the first regex) and two in
`apps/driver-pwa`, an app that had never been scanned. Its selftest runs eight shape cases and then
re-plants the original `openCount` defect into the real repaired `useSettlementDisputes.ts`, requiring
it to be caught.

Scope is deliberately narrow — only a first hop that **is** optional-chained followed by one that is
not. Flagging every unchained `a.b.c` would produce hundreds of false positives and get the guard
switched off, which is worse than no guard.

## Status

**FAIL → fixed in #3669, pending live browser re-proof (Rule 23).** The crash class and its repair are
proven at guard and suite level; a browser click-through of the five surfaces above is still owed
before this flips to PASS.

## Remaining

The wider class — an unguarded nested read with **no** optional chain at all, e.g.
`props.summary.rows.length` — is out of this guard's scope by design, since an enclosing conditional
frequently proves it. That class is covered only when the frontend suite is wired into CI, which is
tracked separately: the suite currently runs in **no** CI job (`ci.yml` compiles the frontend but never
executes it; `test:coverage` is backend-only).
