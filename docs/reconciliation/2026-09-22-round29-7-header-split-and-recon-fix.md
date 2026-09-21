# Round 29.7 — header split, count reconciliation, reconciliation engine fix

## Defect 1 — header blended two populations. Fixed, live.
Split `factor.faro_daily_imports` into two rows:
- `c1e27709-28f7-4886-860f-b9597ddad71a` (statement_date 2026-09-04) — now **scoped to exactly
  the 89 rows in the 2026-09-21 Faro export**. Header: gross **$311,587.00**, advance
  **$270,235.38**, reserve **$4,530.19**, fee **$4,673.82** — ties to every one of Faro's own
  control totals to the cent.
- `c4392703-4e0d-43fe-aacb-9ca2c3e794a8` (statement_date 2026-08-09, labelled "prior period,
  pre-2026-08-10, not in this export") — gross **$45,200.00**, advance **$43,794.00**, reserve
  **$678.00**, fee **$728.00**.
- Cumulative across both: gross $356,787.00. **Never presented as a Faro control figure** — the
  scoped row above is the one that reconciles to Faro.

## Defect 2 — count arithmetic. Resolved: it was 15, not 16.
`build_append_lines2.py`'s "already-present" count (18) never included the manually-resolved
Hummingbird ambiguity (13565, resolved to "already present" in prose but never added to the
tracked set) — so the "unmatched" list printed 16 instead of 15. Re-read live and confirmed:

- 34 existing + 70 new = **104** lines. Confirmed by count.
- 70 new + 19 already-present (18 + 13565) = **89** export rows. Confirmed by count.
- 34 − 19 = **15** unmatched, not 16. Their `SUM()`, read live:
  **gross $45,200.00 / advance $43,794.00 / reserve $678.00 / fee $728.00** — exactly the
  pre-08/10 population now registered as its own row above.
- Full 15-id list: `039, 13508, 13510, 13511, 13514, 13516, 13518, 13519, 13521, 13523, 13526,
  13529, 13534, 13544, 13567`.

## A third defect found while reconciling the residual, fixed
Gross/advance/reserve of the 89-matched population tied to Faro's controls exactly on first
read; **fee did not** ($4,713.82 vs $4,673.82, a $40.00 gap). Traced to 4 lines from the original
2026-09-07 import (`13548, 13558, 13559, 13568`) whose `fee_amount_cents` had folded in a $10.00
wire/dispatch fee on top of the 1.5% discount fee — inconsistent with every other row's
discount-only convention, and inconsistent with the raw export's own "Discount" column for those
same 4 rows (verified: `13548`'s raw Discount cell is $34.50, matching its `reserve_amount_cents`
exactly; the stored fee of $44.50 was $34.50 + a $10.00 Dispatch-column value that should never
have been folded in). Reset all 4 to `fee_amount_cents = reserve_amount_cents` (the correct
discount-only value). This closed the $40.00 gap exactly — gross/advance/reserve/fee for the
scoped statement now all tie to Faro's controls with **zero residual**.

## Standing rule — built, not just named
`apps/backend/src/factoring/faro-daily-import-provenance.ts` — `assertFaroDailyImportProvenance()`
validates a `raw_payload` against the exact `FaroCsvLine` shape (and specifically flags the
`{po,inv,date,debtor,escrow_reserve_cents}` fingerprint found live on the corrupted row). Wired
into TWO places:
1. `recon.service.ts`'s `importStatement()` — refuses to source a reconciliation run from an
   untrusted-provenance row (the guard that actually matters, since it fires at *read* time and
   cannot be bypassed by a raw-SQL write the way a write-time-only check could).
2. `data-infra.service.ts`'s `upsertFaroDailyImportOnClient()` — defensive write-time check so a
   future refactor cannot silently start writing the wrong shape.
Both prod rows' `raw_payload` were refreshed to the correct, accurate shape (rebuilt from the
live, correct `factor.faro_invoice_lines` rows via `jsonb_agg`) so they pass the guard and reflect
reality, not the stale record from two rounds ago. 8 new tests, all passing.

## Reconciliation engine bug — found live, fixed, re-run
The first live `importStatement()` run (before this fix) reported **85 of 89 items as
missing_in_ledger** — not because 85 invoices are actually missing, but because
`invoiceCandidatesRes` filtered candidate invoices by an *exact* match on
`fa.submitted_at::date = statement_date` (or advanced_at/released_at), a design that only worked
when a statement was always a single day. Now that a statement legitimately spans a window
(2026-08-10..2026-09-21, one row), that exact-date filter was structurally wrong for 85 of the 89
real, correctly-recorded invoices.

**Fix:** candidate matching now looks up `accounting.invoices` directly by the statement's own
`display_id` list — no date pre-filter needed, since we already know exactly which invoice numbers
the statement claims. The `missing_on_statement` direction (invoices this vendor advanced that
*aren't* on the statement) still needs a real date scope to stay meaningful — that now uses a
window derived from the statement's own lines' `due_on` (min..max) instead of a single exact date.
6 tests updated/passing (mock query shapes changed to match).

**Re-run live** (`ef9e81b6-8626-407e-91cd-db8d88c47535`, replacing the earlier
`dc0523fb-3255-4b83-ac6e-b3544a0bcde3` run, which was computed against the pre-fix engine and
deleted rather than left on record as misleading):
- `matched`: 38
- `amount_mismatch`: 3 (variance $3,210.00 total)
- `missing_in_ledger`: 48 (variance $182,887.00) — a large fraction of this is expected, not a
  bug: 44 of the 70 newly-appended lines have no USMCA load match at all (Faro purchased them; we
  have no load number to point at — per owner ruling, correctly stored with a `FARO-<inv#>`
  reference and `load_id = NULL`, never a guessed load FK). Those can never have an
  `accounting.invoices` row by definition. **Not yet separated from genuinely-missing invoices on
  real loads in this pass — real follow-up work, not claimed closed.**
- `missing_on_statement`: 26 (variance −$88,370.00) — invoices this company has on record as
  Faro-advanced within the window that the 89-row export doesn't mention. **Not yet individually
  investigated — named, not explained.**

## Reserve register — confirmed which table, quantified the gap
`accounting.factoring_reserve_movements` (the real, GL-poster-written ledger — confirmed correct
target per the prior round's own finding) has **110 rows, all `movement_type='held'`, summing
$5,094.47** for USMCA. Faro's own escrow ($4,530.19) + cash ($135.41) = $4,665.60.
**Difference: $428.87 — named here, not plugged, not netted.** Root cause not yet investigated in
this pass.

## Real, honest, not-yet-done (per owner instruction: do not touch settlement rows or migrations)
- Escrow-as-asset posting / factoring fee expense recognized as invoices close ($67.95, not
  $4,673.82) — accounting design + real GL entries, not started.
- The 8 direct legs ($35,730.00) and 5 reserve deposits ($28,489.00), individually posted with
  Faro's own note — not started.
- The 5 self-carried invoices (billed $15,625.00, paid $3,032.60, open $12,592.40) on their own
  AR aging line — not started.
- Reconciling-item register with the specific named lines ($4,000 / $705.02 closed, Watco removed,
  FLS 009-vs-008, IM $87.40 open, the new $428.87 reserve gap, the pre-08/10 block) — not built as
  a register; the facts are documented above but not yet in a queryable table/screen.
- Daily close check — not started.
- **13579**: voided invoice at `f5f004bb-f9c3-47fd-83f7-bcd91b7909c7` never reverted
  `mdata.loads.status` off `'invoiced'` — confirmed the exact code
  (`apps/backend/src/accounting/invoices.routes.ts:1122-1148`, the void UPDATE) never touches
  `mdata.loads` at all. **Not fixed this pass**: no existing utility recomputes a load's status
  from its invoices, and guessing the correct revert-to status (rather than building that
  utility, out of scope for a single bug fix) would risk a wrong write on load-status data across
  the fleet. Named precisely rather than guessed.
- **13615**: `status='invoiced'` with zero audit-trail events explaining the transition — still
  genuinely unexplained; the provenance-guard pattern built this round covers Faro import rows
  specifically, not `mdata.loads` writes. A general out-of-app-write detector for load status
  would need a DB-level trigger, which is a migration — outside this session's lane.
