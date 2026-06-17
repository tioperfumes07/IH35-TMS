# PROJECTED-CASH-FOLLOWS-ETA (Phase 7, BLOCK 2) — design

Tier-1, touches the cash **forecast**. Show-first. **DESIGN ONLY** — no code or migration is in
this PR. Depends on BLOCK 1 (#1108, two-date model). Built only after Jorge approves this design
AND BLOCK 1 is merged. Ceremony: design → show → approve → branch-test → Jorge STOPS → GUARD →
merge → deploy → GUARD prod-verify.

## Hard boundary (Jorge-approved, restated)
FORECAST / PROJECTION ONLY. This NEVER auto-moves a posted invoice, an AR entry, a settlement, or
anything in QBO. When a load actually delivers and a real invoice posts, ACTUALS replace the
projection for that load and the projection disappears. **ETA changes a prediction, not a booked
transaction.**

## The date rule (locked)
```
projected_cash_date = effective_delivery_date  +  receivable_lag(load)
effective_delivery_date = COALESCE(predicted_delivery_date, scheduled_delivery_date)   // BLOCK 1
```
- `receivable_lag(load)` = **factoring advance timing** for factored loads (Block-20 VQ1 Factoring
  = Option A, typically **T+1**), OR the **customer's net terms** for non-factored loads. It is a
  per-customer/per-load constant, **never zero**. Anchoring cash to the delivery date alone would
  be wrong by the whole factoring/net window.
- A 1-day delivery slip moves projected cash by exactly 1 day; the receivable offset is preserved.

## Signals (RESOLVED 2026-06-17 — no Samsara)
- **No Samsara live ETA exists** → the `ETA_AUTO_FROM_SAMSARA` path is **dropped entirely**.
- `predicted_delivery_date` is proposed by **manual driver-app + dispatcher input** only.
- The **in-app HOS store** (the `/safety/hos` cycle clocks wired in the dispatch HOS columns) may
  inform the **late-RISK** signal (e.g. driver out of cycle hours vs. distance remaining) that
  *surfaces a proposal* — but it never commits the date.

## Confirm model (Jorge-locked = "we should confirm")
1. A signal computes a PROPOSED revised `predicted_delivery_date`. It does **not** auto-commit.
2. The proposal surfaces as a **dispatch exception** in the at-risk/late queue.
3. A dispatcher reviews → **confirms** → `predicted_delivery_date` updates → forecast re-buckets.
4. **Manual driver reports are proposals too** — same confirm gate (driver reports can be wrong).

## Anti-thrash
Re-forecast ONLY when the predicted date crosses a **calendar-day boundary** (cash is bucketed by
day). A 40-minute slip does nothing; 06-16 → 06-17 triggers a proposal. No flicker on GPS pings.

## Audit (required — McLeod/NetSuite bar)
Every CONFIRMED shift writes an append-only, per-entity row:
`load_id, old_predicted_date, new_predicted_date, triggering_signal(s), confirmed_by_user,
confirmed_at`. Proposed (unconfirmed) shifts are not committed and are not audited as changes.

Proposed table (DDL shown for approval — **migrated only on approval**):
```sql
-- forecast.predicted_delivery_changes — append-only, per-operating_company.
CREATE TABLE IF NOT EXISTS forecast.predicted_delivery_changes (
  id                    uuid PRIMARY KEY DEFAULT <uuidv7>,
  operating_company_id  uuid NOT NULL,
  load_id               uuid NOT NULL,
  old_predicted_date    timestamptz,
  new_predicted_date    timestamptz NOT NULL,
  triggering_signals    text[]      NOT NULL,   -- e.g. {driver_report,hos_risk,dispatcher}
  confirmed_by_user_id  uuid        NOT NULL,
  confirmed_at          timestamptz NOT NULL DEFAULT now()
);
-- RLS: operating_company_id policy (per-entity). Append-only: GRANT INSERT/SELECT only to
-- ih35_app; NO update/delete. Explicit GRANTs + drift capture; fresh-DB validated by CI.
```

## Consumers (re-bucket on a confirmed cross-day slip)
- Home KPI **"Projected invoice totals · next 10 days"**.
- The **Cash Flow forecast**.
Both read `projected_cash_date` (= effective_delivery_date + receivable_lag). When a confirmed
slip moves it across a day, the bars re-bucket. ACTUALS always supersede the projection once a real
invoice posts.

## Flags (OFF on merge)
- `CASH_FOLLOWS_ETA_ENABLED` (master) — whole feature off until GUARD prod-verify.
- ~~`ETA_AUTO_FROM_SAMSARA_ENABLED`~~ — **removed** (no Samsara ETA). Only the manual/dispatcher-
  confirmed path exists.

## Static guards (built with the feature, on approval)
- `verify-cash-eta-forecast-only` — assert NO code path in this feature writes invoices / AR /
  settlements / QBO. Forecast tables only.
- `verify-cash-eta-audit-logged` — assert every `predicted_delivery_date` commit writes a
  `forecast.predicted_delivery_changes` row (no silent date changes).

## Acceptance
A confirmed late slip on a test load moves the projected-cash bucket by the day delta (receivable
lag preserved); posted invoices / AR / QBO untouched; audit row written; anti-thrash holds sub-day
slips; everything behind OFF flags until GUARD prod-verify.

## Open questions routed to Jorge (before build)
1. **Receivable lag source of truth** — confirm we read factored-vs-net-terms + the T+1 / net days
   from the existing customer factoring profile / credit-terms (so the lag isn't hardcoded). Which
   field/table is canonical?
2. **Exception surface** — reuse the existing at-risk/late dispatch queue for the proposal, or a
   dedicated "ETA change" review list?
3. **Audit table home** — `forecast.predicted_delivery_changes` (proposed, keeps it in the forecast
   firewall) vs. a dispatch-schema location. Confirm schema placement before the migration.
