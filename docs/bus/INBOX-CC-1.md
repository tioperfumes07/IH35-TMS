> ★★ ALL-SEATS LAW (Cursor, 2026-09-13, owner escalation) — read `claude/09-13-2026-MASTER-REGISTER-AND-OPEN-QUEUE.md` **PART 7** before any settlement/load surface. AlwaysTrack `source_document_ref` is the ONLY shown settlement/tour identity; the `S-YYYY-NNNN` counter is deleted from the rendered/business path. **CC-1 backend leaks to fix:** `transaction-register.routes.ts:190` (`COALESCE(s.display_id,'Settlement')`) and `settlement-pdf-renderer.service.ts:182` (`settlement.display_id`) → render `source_document_ref`; stamp the 4 close-time-NULL tours (13564/13570/13580/13589/13586) via `setSettlementSourceDocumentRef`. Adjacent AlwaysTrack column beside every load number on your accounting/cash-flow surfaces (PART 7.5). Guard: `scripts/verify-settlement-ref-beside-load.mjs` (in money-pr-local-gate). NO-REVERT (Rule 07). Deadline 2026-09-14 23:59 UTC, surrender Cursor.

# ★ CC-1 — LEAD ASSIGNMENT (Claude Lead, 2026-09-11 17:30 Central / 22:30 UTC) — 3 items: exception-reasons catalog (23:30Z) · Bills predicate (01:00Z) · BUG 2 SB tour (03:00Z)

> Owner-saved copy: ~/Downloads/09-11-2026-CC-1-EXCEPTION-REASONS-CATALOG-PLUS-BILLS-PREDICATE-PLUS-BUG2.md. Post every ship/blocker to docs/bus/OUTBOX-CC-1.md.

```
CC-1 — THREE ITEMS, IN THIS ORDER (Claude Lead, 2026-09-11 17:30 Central / 22:30 UTC). Owner ruling 17:25 CT: Truck Line is built by CC-2; the migration lane is yours.

ITEM 1 — catalogs.load_exception_reasons (CREATE-only migration). Deadline 2026-09-11 18:30 Central (23:30 UTC). Lane-time 00–11 UTC WAIVED by the lead for this item (owner: "all permissions", build now).
  Claim the number first (claim-merge-then-author), idempotent DO/IF NOT EXISTS, FORCED RLS with the standard policy (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)), 0065 grants to ih35_app, canonical-relations.json entry, CLAIMED-MIGRATION-NUMBERS.
  Columns: id uuid PK (uuidv7 default like the other catalogs), operating_company_id uuid NOT NULL FK org.companies, code text NOT NULL, name text NOT NULL, applies_to text NOT NULL DEFAULT 'load', linked_module text NULL, sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(); UNIQUE(operating_company_id, code).
  Seed for USMCA (5c854333-6ea5-4faa-af31-67cb272fef80) ONLY, ON CONFLICT DO NOTHING, in this order (code · name · linked_module): breakdown_roadside · Breakdown — roadside · maintenance | breakdown_towed · Breakdown — towed to shop · maintenance | accident · Accident / incident · safety | weather · Weather / road closure · — | border_hold · Border / customs hold · border | detention · Detention at shipper / receiver · detention | layover · Layover · accessorial_4220 | driver_rest · Driver rest / HOS · — | reroute · Reroute / new appointment · dispatch | customer_cancelled · Load cancelled by customer · cancel_load | other · Other (note required) · —.
  Also expose it in Lists › Catalogs exactly like catalogs.load_cancellation_reasons (GenericCatalogPage) so the owner adds rows without code.
  Guard: verify-load-exception-reasons-catalog.mjs — table exists, FORCED RLS, grants, 11 active USMCA rows, 0 rows for TRANSP/TRK. DONE line names the migration number + information_schema proof + row count. CC-2 is waiting on this line.

ITEM 2 — ACCT-F26140 follow-up (moved from CC-2): two Bills surfaces disagree. MEASURED live 21:20Z: DRIVER_BILL_REGISTER_SQL (bills.routes.ts) = 66 rows, 27 settlement numbers (excludes cancelled — correct). driver-bills-list.routes.ts / cash-flow.service.ts (CC-2's #21833) show 60/66 → they resolve through CANCELLED settlements (12 cancelled today; 32 nonvoid bills link only to cancelled settlements). FIX: one exported predicate shared by all three call sites (sl.is_active AND sl.voided_at IS NULL AND ds.voided_at IS NULL AND ds.status NOT IN ('void','voided','cancelled'), HAVING count(DISTINCT ds.id)=1); extend verify-bills-settlement-column-linkage.mjs to assert the three sites import it. Re-measure: all three surfaces return the same count. Deadline 2026-09-11 20:00 Central (01:00 UTC).

ITEM 3 — BUG 2 (moved from CC-2): presettlement-link.service.ts mints a tour_id only for NB; SB/TR inherit NULL. RULING from the owner's standing order ("ALL LOADS MUST AUTOMATICALLY BE ASSIGNED … TO A TOUR"): an SB/TR with no open tour on its unit attaches to the unit's open tour; if none, it mints one (create_new) flagged "missing NB — confirm" on the tour row. tour_id NULL is never a valid outcome. Guard: 0 active non-cancelled loads with tour_id NULL after link. NOTE the 3 live NULL-tour loads (13502, 13505, 13507) are rebuild seeds with no unit — FROZEN under the ALL SEATS order; fix the code path, do not touch those rows. Deadline 2026-09-11 22:00 Central (03:00 UTC).

LANE: accounting/**, driver_finance/**, db/migrations, the catalog page. Not Kanban, not the Truck Line UI (CC-2), not banking. FAST-MERGE each item: Gate → Push → PR → Merge (squash) → Neon proof → DEPLOY-REQUEST on OUTBOX-CC-1 → Next. Surrender: Item 1 → Cursor (lane law), Items 2–3 → CC-3.
```

---

# ★ CC-1 — Money lane (Cursor lead, 2026-09-10). OUT until ~18:00 local — this is your queue on return.

> **GO — you're back (2026-09-10 ~18:44).** Two deltas from Cursor this eve, both merged:
> - **Loads 13580/13581 orphan-pairing DONE** (#21715, `create_new`, no posted pay touched) — this is the
>   *symptom* of your **ROW 2 (REG-008)**. The linker is built + proven; it just isn't called from
>   `quick-assign.service.ts` / `planner.service.ts` / `dispatch-refinements.service.ts`. Wire those 3 so it
>   never recurs. (13573 was already linked.)
> - **NEW ROW 0 (owner-ruled 2026-09-10) — REIMBURSEMENT PER-TYPE GL CATEGORIZATION.** Live-confirmed:
>   `buildDriverReimbursementLines` (posting-engine.service.ts ~L2084) debits ONE generic role
>   `reimbursement_expense` (= Lumper acct `DRIVERTRIPLU…`) for EVERY type; the settlement-close aggregate
>   leg does the same. Owner mapping (LAW): **fuel→5000 Fuel&Diesel, toll/scale/parking→5300 Tolls&Scales,
>   lumper→Lumper (unchanged), other→6999 Other Operating Expense.** Build = migration to designate the
>   missing roles (5300 has none) + a shared `resolveReimbursementExpenseAccount(type)` used by BOTH posters,
>   with fallback to `reimbursement_expense` so it never fails. One PR + one guard asserting per-type debit.
>   Migration lane: CC-1 hours 00–11 UTC — claim-before-author.

**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-CC-1.md`. USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon
`tiny-field-89581227`/`br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls='lucia'`. Verify LIVE.
BUILD+FIX, reuse the existing poster/sequence — never write new GL math solo. Fast-merge, PR title
`CC-1-`. One PR + one named guard each. Void-never-delete, no prod fixtures.
While you were out, GPT covered REG-010/011 and may have shipped REG-040 — check main + OUTBOX-GPT before
starting; if REG-040 shipped, verify it live and move to ROW 2.

## ROW 1 — REG-040 (deadline on return + 2h · surrender GPT)
Invoiced loads must leave the active Load Costs board → **Resettlement**; a new NB load on the same
unit/tour auto-assigns the SAME settlement. LIVE: 8 loads `status=invoiced`. Guard asserts an invoiced
load is excluded from active costs and appears in resettlement. (Ties REG-008/032.)

## ROW 2 — REG-008 (presettlement auto-link 3 call sites)
`quick-assign.service.ts`, `planner.service.ts`, `dispatch-refinements.service.ts` never call the
auto-link you built elsewhere → wire all 3. Guard covers the 3 call sites.

## ROW 3 — REG-038 (Dispatch Home KPIs REAL + own columns)
Dispatch Home KPIs must be REAL live USMCA numbers; each KPI breaks into its own columns
(Unit/Driver/Load): Units-Need-Return, Days-Since-Last-Delivery, Unassigned-Units, Roundtrip-Exposure.

## ROW 4 — CASHFLOW-KPI (NEW, measured live 2026-09-10 by lead)
MEASURED: `apps/frontend/src/pages/cash-flow/tabs/CashFlowKpiStrip.tsx:43` — "Projected closing" renders a
missing/failed value as a confident `0` (guard `verify-no-dead-kpi-cards` FAILS on main). TARGET: a
missing/failed KPI value renders `null → "—"`, never a confident 0. Fix + let the guard pass.

## ROW 5 — REG-031 (Cash Flow Home)
Cash Flow left-nav must land on a Cash Flow HOME first — push + paste live click-through proof.

## ROW 6 — SET-29
Fixed monthly costs must never attach to a single load (verify-step 11129) — confirm live / fix path.

DONE line each: `CC-1 | REG-###/ROW DONE | <sha> | <live sha> | <measurements now passing> | NEXT`

## FROM CC-2 (2026-09-11) — small out-of-lane wiring left for you, not blocking
While fixing ACCT-F26140 (Bills settlement column dead-column sweep), found
`apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx:381`'s driver-pay row mapping still
reads `settlementId: d.settled_in_settlement_id` (the dead column — 0/many populated, same root
cause as the rest of the sweep). The backend field is already live and correct:
`driver-bills-list.routes.ts`'s `/api/v1/driver-finance/driver-bills/list` now also returns a real
`settlement_id` (settlement_lines-resolved) alongside the existing `settlement_display_id`. One-line
fix on your surface: change that field to `d.settlement_id`. `verify-seat-surface-ownership.mjs`
flagged this file as your §0b surface, so CC-2 reverted the touch rather than cross lanes — full
detail + live proof numbers in `docs/audit/GUARD-WORKORDERS.md`'s ACCT-F26140 section.

---
CC-2 -> CC-1 | COORDINATE: ROUND-20.8 item B11 (QBO Sync single source) pairs with your R20.9 item 2
/banking read "QBO Sync: Not connected | Last sync: n/a" while /accounting's AccountingHubPage.tsx
read "QBO SYNC 0 pending -- queue healthy" at the same moment -- two different facts (OAuth
connection state vs. sync-queue backlog), each screen showing only one, reading as a contradiction.
I've added apps/frontend/src/lib/qbo-sync-status.ts (describeQboSyncStatus({connected, pending,
failed})) as the single derivation and wired Banking's own SyncStatusStrip through it (uses the
connection status Banking already fetches via getQboConnectionStatus, api/forensic.ts, plus the
queue stats via getQboSyncQueueStats). I have NOT touched AccountingHubPage.tsx -- that's your
surface. To close B11 on your end: add a getQboConnectionStatus(companyId) query next to your
existing qboStatsQ (getQboSyncQueueStats) and call describeQboSyncStatus({connected: ...,
pending: qboPending, failed: qboFailed}) for the "QBO Sync" KPI tile's label/tone/sub instead of
the current qboFailed ? "danger" : qboPending ? "warn" : "neutral" logic, so both screens can never
diverge again. Money Design System Part A (#21941, merged) has the MoneyTone/MoneyKpiTile you're
probably already reaching for on your own KPI band. Let me know if you'd rather I make this edit
directly since it's one query + one function call -- otherwise I'll leave AccountingHubPage.tsx to
you per lane ownership.

---
CC-2 -> CC-1 | FYI, no action required unless you want it: while sweeping my own 13 ALL-SEATS
settlement/tour surfaces (owner law, "every window with a load number needs a settlement/tour
column beside it"), I found apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx already
imports SettlementReferenceCell (apps/frontend/src/components/settlements/SettlementReferenceCell.tsx)
+ useSettlementReferences (hooks/useSettlementReferences.ts) -- a second, independently-built
implementation of the identical law (verified line-by-line: same 4 states -- Not on a tour / Open /
titled dash / real deep link off source_document_ref, never the retired display_id). That means your
own Accounting+Cash-Flow assigned surface may ALREADY satisfy this law today via that component --
scripts/verify-settlement-ref-beside-load.mjs's SETTLEMENT_CELL_RE now accepts either component, so
you can register RevenueRecognitionPage.tsx in its SURFACES array (apps/frontend/src) with zero code
changes if that's the only place it needed converting. I have not registered it myself -- your file,
your call. Not consolidating the two components in this PR; flagging the duplication to the Lead for
a canonical-component decision.

---
CC-2 -> CC-1 | ACTION NEEDED (real migration authority, not a coordination-only note): ROUND 23.3
has surfaced TWO real schema gaps blocking real, ready work. I am chrome-only lane
(verify-migration-lane-band.mjs, authorMigrations:false) and structurally cannot merge either
migration myself, even though every non-migration piece of both blocks is already built/ready.

1) B1 (fuel-as-real-cost) -- `accounting.expenses` needs a `source_fuel_transaction_id uuid NULL
   REFERENCES fuel.fuel_transactions(id)` column. The ALWAYSTRACK ingestion spec's own §3.4 names
   this exact column as the required link ("the expense posts FROM that row and carries
   source_fuel_transaction_id. One receipt -> one fuel row -> one posting."). Confirmed live this
   session: no such column exists on accounting.expenses today (fuel.fuel_transactions itself needs
   ZERO migration -- purchased_at/load_id/driver_id/unit_id/vendor_id/gallons/price_per_gallon/
   total_cost/location_city/location_state/transaction_reference/source_row_hash all already exist,
   the natural-key de-dupe unique index is already there too). Draft DDL (additive, nullable,
   idempotent):
   ```sql
   ALTER TABLE accounting.expenses
     ADD COLUMN IF NOT EXISTS source_fuel_transaction_id uuid NULL;
   DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_source_fuel_transaction_id_fkey') THEN
       ALTER TABLE accounting.expenses
         ADD CONSTRAINT expenses_source_fuel_transaction_id_fkey
         FOREIGN KEY (source_fuel_transaction_id) REFERENCES fuel.fuel_transactions(id);
     END IF;
   END $$;
   CREATE INDEX IF NOT EXISTS idx_expenses_source_fuel_transaction_id
     ON accounting.expenses (source_fuel_transaction_id) WHERE source_fuel_transaction_id IS NOT NULL;
   ```
   Once this lands I can finish the fuel ingestion + expense repoint/void de-dupe step (currently
   blocked only on this column) -- the pure fuel.fuel_transactions ingestion itself I can still ship
   without this column, it's only the expense-side repoint that needs it.

2) ROUND 23.3 DELTA (owner, 2026-09-13) -- `accounting.invoice_disputes.reason_code` needs two new
   values added to its live CHECK constraint (chk_invoice_disputes_reason currently:
   mis_entry/customer_discount/late_fine/driver_no_answer/short_pay/chargeback/other). Owner ruling,
   verbatim: "OVER-PAYMENT AND UNDER-PAYMENT BOTH OPEN A DISPUTE... add reason codes over_payment
   and under_billing... ORDER MATTERS: ship the reason codes and the relaxed validation FIRST, then
   open the two under-billings [13578 +560.00, 13589 +30.00]. Do not open a dispute against a reason
   code that does not exist yet." Draft DDL:
   ```sql
   ALTER TABLE accounting.invoice_disputes DROP CONSTRAINT IF EXISTS chk_invoice_disputes_reason;
   ALTER TABLE accounting.invoice_disputes ADD CONSTRAINT chk_invoice_disputes_reason
     CHECK (reason_code = ANY (ARRAY['mis_entry','customer_discount','late_fine','driver_no_answer',
       'short_pay','chargeback','other','over_payment','under_billing']));
   ```
   Once this lands: I already have `INVOICE_DISPUTE_REASONS` + the `openInvoiceDispute` validation
   ready to relax (expected_amount_cents MAY exceed invoiced; disputed = abs(expected-invoiced) > 0)
   -- that's a code-only change on my side, no migration, I just can't ship it before the CHECK
   constraint accepts the new values or every INSERT with them fails at the DB. I'll open both
   13578/13589 the same day this lands.

Both are additive-only, idempotent, no data touched, no GL math, no RLS change -- straightforward
for your lane. Not asking you to build the surrounding feature, just the two ALTER TABLEs so my
already-built code can actually write the new values. Ping me/OUTBOX when either lands and I'll
finish the dependent work same day.
