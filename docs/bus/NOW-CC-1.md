# ROUND 190 item 1 — REPOST REFUSED (correctly), self-corrected one mistake — CC-1 — 2026-09-28 16:25Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r190.md`.

**Result: none of the 44 should be reposted. All 44 already have a correct, live GL entry
elsewhere.** The order's premise ("real cash, zero GL entry") does not hold — verified live, not
assumed, including one real mistake I made and fixed within minutes.

## What actually happened

Ran the reconciliation + repost script (`scripts/ops/2026-09-28-round190-repost-44-faro-advances.ts`,
AUTH-113) against the 44 named advances, using each row's own `notes` FARO_FEES JSON as ground
truth (the header was independently verified corrupted in PR #23023 — this was disclosed before
running, not discovered after).

- **40 of 44 reconciled cleanly.**
- Attempting the actual repost on those 40 hit `duplicate key value violates unique constraint
  uq_factoring_advances_faro_invoice_number` on **39** of them. This is not a bug in the repost —
  it is live proof that **each of these 39 already has an ALREADY-CORRECT, ALREADY-LIVE twin
  advance** (FAC-2026-00092 through roughly 00132, `status='advanced'`, identical
  `invoice_total_cents`/`advance_amount_cents`/load, notes marked "REPAIR-OK"), created during an
  earlier, untracked repair session. Reposting would have double-counted real cash that is already
  correctly on the books.
- **1 row (FAC-2026-00084) DID post** — it has no `faro_invoice_number`, so the unique-constraint
  safety net that caught the other 39 could not catch it. I found its twin independently right
  after (**FAC-2026-00091**, same invoice/load/amounts, `status='advanced'`, created 13 minutes
  after FAC-84 in the same repair session) and **self-corrected within minutes**: reversed the
  duplicate JE via `reverseFactoringAdvanceEventInClientTx` (the same sanctioned engine — never a
  raw delete, never a hand-edit) and restored FAC-84's header to `voided`. Confirmed live: the
  wire-fee account's totals are back to exactly 71 debit / 48 credit / $174,666.12 / $174,436.12 —
  identical to before I touched anything. Net effect of my own mistake, after correction: zero.
- **4 rows (FAC-2026-00048/63/64/82) correctly refused reconciliation** — their `notes.purchase`
  does not match the header's own `invoice_total_cents` (a real, separate, unexplained
  discrepancy). Never touched.
- **The remaining 2 (FAC-2026-00086/90, loads 13615/13619)** also have already-live twins
  (FAC-2026-00125 and FAC-2026-00097) — but via a more tangled ROUND 172/175 correction chain tied
  to those two loads' own customer/PO identity problem (the exact loads named in the ROUND 173
  defect register). Confirmed before any write was attempted on them — not touched.

**Guard `verify-factoring-posting-legs-match-header.mjs`: PASS**, confirmed live after the
self-correction.

## Why this happened

Someone (untracked, no committed script found) already did the real repair work for essentially
all 44 advances, days before this order — reversing the bad wire-fee-swapped JE and re-posting
correctly under a NEW display_id, while leaving the OLD display_id as a voided, zeroed, orphaned
husk (marked "REPAIR-VOID-ZERO-ADV"). The order's framing ("reversed with NO live funding JE")
was true of the OLD display_id in isolation, but false of the underlying real transaction, which
has a live home under a different number. I verified this for all 44, not just the 39 the unique
constraint happened to catch mechanically.

## Full detail

See `docs/bus/OWNER-AUTHORIZATIONS.md` AUTH-113's status block for the complete, itemized
accounting of every one of the 44, and PR history for the actual commands run and their exact
output.

## Standing per "nothing gets half-built"

Task 1 is DONE (correctly refused, not silently skipped). Tasks 2-4 of ROUND 190 (330 of 336
settlement lines with `posting_account_id IS NULL`; 214 with `item_id IS NULL`; the new
`verify-settlement-line-posting-account-complete.mjs` guard) are NOT started — naming that
explicitly, not carrying it silently.
