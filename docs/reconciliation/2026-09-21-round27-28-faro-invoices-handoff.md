# Round 27.1 / Round 28 — Invoices + Factoring (Faro is truth) — session handoff

Source of truth: `~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx`, 25 sheets. Full extract of
the 9 sheets relevant to this work committed alongside this file:
`docs/reconciliation/2026-09-21-master-reconciliation-extract.json`.

## What shipped, real and verified, this PR

1. **`factor.faro_daily_imports` header/ledger mismatch — root-caused and (correctly, on the second
   try) resolved.**
   - Live-verified 2026-09-21: the single existing row (`c1e27709-28f7-4886-860f-b9597ddad71a`,
     statement `2026-09-04`) had `gross_total_cents=15,174,000` (51 invoices / $151,740.00) while
     its own child rows in `factor.faro_invoice_lines` summed to `10,405,000` (34 rows /
     $104,050.00) — a $47,690.00 gap.
   - **Root cause of the row's current shape**: its `raw_payload.lines` carry
     `{po, inv, date, debtor, escrow_reserve_cents}` — a shape the app's only writer of this table
     (`upsertFaroDailyImportOnClient` in `apps/backend/src/data-infra/data-infra.service.ts`) never
     produces (it always stores `{lines: input.lines}` verbatim in `FaroCsvLine` shape —
     `invoice_number`/`gross_amount_cents`/... never `po`/`inv`/`debtor`). `created_at` on the header
     equals `created_at` on all 34 lines (2026-09-07T19:43:17Z) but the header's own `updated_at`
     (2026-09-07T21:06:55Z) is later with zero corresponding change to the line table. The only
     writer supersedes-then-reinserts an ENTIRE batch on every write, so it cannot produce
     "header changed, lines untouched." **Conclusion: something wrote directly to
     `factor.faro_daily_imports`'s header columns outside the app** (raw SQL / manual edit), almost
     certainly to record the *full* 51-invoice Faro escrow-ledger statement as a memo, around the
     same time as commit `62335ba3e6` ("factoring 51/$151,740 reconciled in register").
   - **First attempt (WRONG DIRECTION, reverted same session):** shrank the header to
     $104,050.00/34 to match the incomplete ledger. **Owner correction (Round 28, mid-session):
     "Faro's data is the truth for factoring... App header $151,740.00 CORRECT."** The header was
     right; the 34-line ledger is what's incomplete (17 lines never resolved to a USMCA invoice, no
     error raised). **Reverted live** to the original $151,740.00/51-invoice totals, with a full
     correction note left on the row (`notes`, `raw_payload._correction_...`) so the audit trail
     records both the mistake and the fix, not just the final state.
   - **Real, live-reproduced bug found in the process**: `factor.faro_invoice_lines` carries a
     **non-partial** unique index `uq_faro_invoice_lines_per_import (daily_import_id,
     invoice_number)` — it does not exclude `superseded_at IS NOT NULL` rows. Calling the app's own
     sanctioned reimport path (`upsertFaroDailyImportOnClient`) a second time with any
     previously-seen `invoice_number` throws a live `23505 duplicate key` **even though the prior
     row was just superseded in the same transaction**. Reproduced live (see below), not simulated.
     This is almost certainly *why* whoever fixed the header resorted to raw SQL in the first place
     — the real reimport path is broken for exactly this case. **Not fixed in this PR** (needs a
     migration making the index partial: `... WHERE superseded_at IS NULL`) — filed as its own
     finding below, not silently worked around again.

2. **`factor-reconciliation` routes were fully built and completely dead.**
   `apps/backend/src/accounting/factor-reconciliation/{recon.service.ts,routes.ts}` — a real,
   tested reconciliation engine (`importStatement`, `listReconciliationRuns`,
   `listReconciliationItems`, `listImportCandidates`) — existed with zero callers:
   `registerFactorReconciliationRoutes` was never imported or invoked anywhere in
   `apps/backend/src/index.ts`. Every route 404'd for every caller since the module was written.
   **Fixed**: registered in `index.ts`. `factor.reconciliation_runs` had genuinely never run once
   (0 rows) — confirmed live.

3. **Real bug found + fixed in `recon.service.ts` while smoke-testing the newly-wired route**:
   the `missing_on_statement` INSERT used a bare `-$4` on an untyped parameter —
   `operator is not unique: - unknown` (Postgres error 42725), live-reproduced. Every reconciliation
   run that ever hit a "ledger has an advanced invoice the statement doesn't mention" case would
   have thrown this. Fixed to `-($4::bigint)`.
   **Reconciliation was deliberately NOT run yet** (see "What's genuinely still open" below) — running
   it against the still-incomplete 34-line ledger would render a false-clean result (33-34 "matched",
   0 "missing_in_ledger") that hides the real 17-line gap, because `importStatement` reconciles
   against `factor.faro_invoice_lines` rows, not the header's own declared totals. That is exactly
   Round 28 step 2's "guard that fails the import loudly on header/line mismatch" gap — reconciliation
   is not a substitute for that guard; it runs downstream of a *complete* ledger.

4. **`accounting.factoring_reserve_movements` (the real, GL-poster-written reserve ledger) already
   has 110 rows / $5,094.47 held for USMCA — it is NOT empty.** `factoring.reserve_movement`
   (singular — a different, legacy table only `postReserveMovement`/`faro-csv-import.ts`'s
   CSV-line-loop path would ever write, and that path is gated on `wasNewlyAdvanced`, which is false
   for every already-advanced invoice) is the ONE that's empty — 0 rows, confirmed live, system-wide,
   not just USMCA. **The task's "reserve_movement has zero rows, build the register" premise is
   TRUE only for the dead/legacy table** — the real reserve ledger already works. This needs the
   owner's/lead's attention as a naming-collision footgun (two tables, same purpose, one dead) before
   anyone builds a "reserve register" against the wrong one.

5. **`DuplicateVendorsBanner.tsx:135` fixed for real**, not just the predicate. The old code
   correctly diagnosed (in its own comment, `VENDOR-MERGE-QBO-ID-MISMATCH`, owner-live-tested
   2026-09-08) that a naive predicate flip would 404 — the QBO-vendor-merge form it deep-linked to
   genuinely requires a synced `qbo_vendor_id`, which 0 of 618 USMCA vendors have. Traced the actual
   generic, already-built, already-tested vendor-merge primitive
   (`POST /api/v1/vendors/:id/flag-duplicate` + `POST /api/v1/vendors/:id/merge`,
   `apps/backend/src/mdata/reclassify.routes.ts`) that works on the app's own vendor id — had **zero**
   frontend callers anywhere in the repo (also dead). Wired the banner directly to it: "Merge these"
   now expands to an explicit "Keep [A] / Keep [B]" confirm (merging is real and hard to reverse — no
   automatic survivor pick), calls flag-then-merge, no QBO involved on either call. 5 new/updated
   tests, all passing.

## Live proof (this session, Neon `br-fancy-credit-akjnd07a`, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`)

- Header before any change: `gross_total_cents=15174000` vs `sum(faro_invoice_lines.gross_amount_cents)=10405000`.
- Header after the (reverted) shrink: `10405000` — confirmed equal to lines, then confirmed WRONG per Round 28.
- Header after the correction: `gross_total_cents=15174000, advance_total_cents=14718778, reserve_total_cents=227611, fee_total_cents=227611` — restored exactly to the original, owner-confirmed-correct values, with the full correction trail in `notes`/`raw_payload`.
- `factor.reconciliation_runs` / `factor.reconciliation_items`: created one run + items against the (then-incorrect, shrunk) header to prove the newly-wired route + the operator-ambiguity fix both work end-to-end (`missing_in_ledger: 33, matched: 1, missing_on_statement: 3`) — then **deleted** both rows once the header correction made that run's own numbers stale, rather than leave a known-wrong "first reconciliation" on record. A real first run needs to happen against a *complete* ledger — see below.
- `accounting.factoring_reserve_movements` (USMCA): 110 rows, all `held`, `sum(amount_cents)=509447` ($5,094.47).
- `factoring.reserve_movement` (USMCA and system-wide): 0 rows.
- `apps/frontend`: `npm run typecheck` clean; `DuplicateVendorsBanner.test.tsx` 5/5 passing.

## What's genuinely still open (named, not guessed at, not silently dropped)

Real source data for ALL of the below is now sitting in
`docs/reconciliation/2026-09-21-master-reconciliation-extract.json` (parsed from the owner's xlsx,
committed this PR) — this is not a "go find the file" pointer, the actual rows are in the repo.

1. **Invoice-per-load minting (Round 28 step 1).** `CUSTOMER CHARGES` sheet: 51 rows
   (settlement, load, customer, item, miles, rate, QP%, amount). Needs: a contra-revenue GL account
   for QP (Quick Pay discount — `Total Invoiced = Charges − QP`, QP on its own line, never netted
   into the charge), the existing invoice-from-load path (`apps/backend/src/accounting/from-load.ts`,
   `proforma-mint-on-first-pickup.ts`) extended or a new minting path, `source_load_id` on every
   invoice, `IN` counter starting at 112 (never hand-picked). Do-not-invoice list (dispatched:
   13609/13615/13616/13617/13618; cancelled: 13556/13593, carrying $4,000.00/$4,800.00 — report the
   lines, don't invoice them). 13554 confirmed invoiced at $3,500.00 already (Faro inv 039).
2. **13579 / 13615 "status=invoiced, no invoice row" — root-caused, not yet fixed.**
   Live audit trail (`audit.audit_events`), both traced exactly:
   - **13579**: a real load. `f5f004bb-f9c3-47fd-83f7-bcd91b7909c7` was created 2026-09-07T20:16:00Z
     as an explicit **CC-1 live-proof test invoice** ("sample load 13579... sample factoring-packet
     invoice created to prove the route live" — MANUAL-DELIVERY-AUTH-01), then voided 105 seconds
     later in the same session. The bug: **voiding an invoice never reverts the source load's
     `status` back off `'invoiced'`** — a status-sync gap in the void path (`VOID-EVERYWHERE-PR2`).
   - **13615**: created 2026-09-14 via a completely normal dispatch/booking flow (audit trail is
     clean: reservation → `dispatch.load_created` status `unassigned` → instructions distributed →
     email sent). **No audit event of any kind explains how `status` became `'invoiced'`** — the
     application never emits a status transition here without an audit event, so this was set
     **outside the app** (the same raw-SQL-on-a-status-column pattern as the Faro header). The
     master spreadsheet's own "Dispatched" label for 13615 (Round 27.1 §1) agrees with the audit
     trail, not with the live DB status — reinforcing that the DB's `'invoiced'` value here is the
     wrong one, not the spreadsheet.
   Neither should be invoiced over blindly. The status-sync bug (voiding an invoice must revert the
   load's status) is a real, generally-applicable defect worth its own guard.
3. **Loud-fail guard on Faro import (Round 28 step 2).** Add a check in `commitFaroCsvImport` (or
   its caller) that compares `parsed.lines.length`/`sum(gross_amount_cents)` against whatever the
   caller expects as the statement's declared total, and refuses (loud error, not a silent partial
   import) rather than accepting a subset with no signal. Exact contract (what field carries "the
   declared total" for a fresh CSV import, since today's only header-total source *is* the
   line sum for a first-time import) needs one line of design before coding — flagging rather than
   guessing it.
4. **Load the full Faro history 2026-08-10 → today (Round 28 step 3).** `FARO PURCHASES` sheet: 90
   rows (89 real + 1 either blank or total, needs one look), full gross/escrow-reserve/cash-reserve/
   discount/fees/net-advance/receipts/schedule-fee/chargeback breakdown per invoice — this is the
   real per-line financial data the existing header row's `raw_payload` never had. Building all of
   `factor.faro_daily_imports` (one row per real statement date — need to confirm statement
   boundaries against Faro's own statement PDFs, not just purchase dates) + `factor.faro_invoice_lines`
   from this sheet, through the real `POST /api/v1/factoring/import/faro` route, is the concrete next
   block. `FARO LOAD MAP` sheet (65 rows) is the match key: 55 purchased/$208,837.00, 9
   self-carried/$36,069.72, 34 no-load (25 outside the window, 9 inside needing a load
   found-or-created — PO/inv 1013272-2, 37, 30, 32, 29, 34, 31, 35, 33 / $31,110.00 total).
5. **Reserve register (Round 28 step 4).** `FARO RESERVE MOVEMENTS` sheet: the real 17 movements
   (6 cross-entity RSV transactions + 11 invoice-level escrow→cash/schedule-fee movements),
   already extracted with dates/amounts/notes. `factoring.reserve_movement` being empty is a
   naming-collision non-issue per finding #4 above — before building anything here, confirm with
   the lead whether this should write the SAME canonical `accounting.factoring_reserve_movements`
   table the real poster already uses (recommended — one ledger, not two) or a genuinely new
   register, since the task named the legacy table specifically.
6. **8 cross-entity movement pairs (Round 28 step 5).** Fully present in `FARO MOVEMENTS REGISTER`
   (both the reserve-side and the "INTERNAL TRANSFERS IN THE PAYMENTS FILE" mirror side) — dates,
   amounts, counterparties, and verbatim notes all extracted. Needs the intercompany
   receivable/clearing GL account identified (or created) before posting either leg.
7. **Two Faro-side discrepancies to raise WITH FARO, not plug**, per Round 28's own instruction:
   cash reserve $4,135.41 vs movement-register ending $135.41 (**$4,000.00 unexplained**), and
   Payments to You $298,019.36 vs payments file $298,724.38 (**$705.02 unexplained**). Not
   investigated further this session — explicitly not ours to reconcile away.
8. **Bank matching suggest-only / GET-never-writes (Round 28 step 10)** — not verified this
   session; flagging as unverified rather than asserting it's fine.
9. **Daily-close-reconciles-to-Faro check (Round 28 step 9)** — not started.

None of 1/3/4/5/6/9 were attempted blind. Each touches real money (GL postings, invoice creation,
intercompany transfers) and needs the source data above turned into a reviewed design (accounts,
posting rules, statement-boundary confirmation) before code — that is the next block, sized to be
its own PR(s), not a footnote.
