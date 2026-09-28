# ROUND 207 — full detail (CC-1, 2026-09-28)

## A — Faro invoice 87: NOT missing. Root cause found, nothing seeded.

Load 13615 exists, status `completed_docs_received`, `rate_total_cents=490000` ($4,900.00 — matches
the workbook exactly). Its invoice (`accounting.invoices` display_id `13615`) is not voided and its
`factoring_advance_id` points directly at `accounting.factoring_advances` row `FAC-2026-00125`
(faro_invoice_number `87`), which matches the workbook on every figure: `invoice_total_cents=490000`,
`faro_purchase_date=2026-09-21`, `factor_fee_cents=7350` ($73.50), customer Semares Forwarding
Services (confirmed via `accounting.invoices.customer_id` join). The chain load → invoice → advance
is fully wired.

**Why it looked absent:** that advance row was voided today at `2026-09-28T13:29:11Z`
(`void_reason: "ROUND-175 reversal — load identity unproven, Lead ruling 172-Updated"`) then
reinstated 28 minutes later at `13:57:18Z` (`reinstate_reason: "ROUND-175 — voided in error, real
Faro purchase"`). Per this codebase's standard void/reinstate convention, `voided_at` is NOT cleared
on reinstatement — only `reinstated_at` is set. Any check using a bare `voided_at IS NULL` filter
therefore still excludes a currently-real, reinstated row.

**Scope, not guessed:** exactly one other row shares this identical signature from the same
ROUND-175 event — `FAC-2026-00097` (faro_invoice_number `1013272-2`), voided `13:26:09Z`, reinstated
`13:57:11Z`, same void/reinstate reason pair. Live count: `voided_at IS NULL` (naive) = 93 currently
"active" advances; the correct definition (`voided_at IS NULL OR reinstated_at > voided_at`) = 95 —
exactly the +2 these rows account for. **Re-run diff, correct definition: 0 real gaps.**

**Not fixed, only flagged (pending a decision):** `apps/backend/src/accounting/factoring-advances.
routes.ts`'s own documented `status=active` pseudo-status (GO-23 row16, "owner FINISH LAW
2026-09-03") is defined as literally `voided_at IS NULL` — the same blind spot. Any UI/report using
`status=active` for factoring advances would currently hide these same 2 rows. Did not change this
without direction, since it's tied to an owner-approved convention.

## B — Genaro's 2 loads: incomplete mint at the driver_bills→settlement_lines materialization step. Seeded at his real rate.

Loads 13633/13634 are not different in shape from any neighbor (routing-engine miles, `0.0` empty
miles, active un-deactivated driver `6edcb351-e81b-4bf2-adf7-5eca9eff9137`, correctly and
consistently assigned across his whole history). `driver_finance.driver_bills` rows exist for both
(`DB-000272`, `DB-000261`), auto-created correctly from the loads, `status='open'`,
`settled_in_settlement_id IS NULL` — the system's standard preliminary mint at the generic default
rate (`rate_per_mile_cents=48`, i.e. $0.48/mi) DID run. What never ran is the materialization of
those bills into `driver_finance.settlement_lines` earnings on his current open settlement
(`P-0018`, id `b3912fde-...`, created `2026-09-28T18:01:55Z` — the exact `updated_at` on both loads),
which sat as an empty shell (`source_document_ref IS NULL`, no lines) rather than a permanent gap.

**Rate used: $0.45/mi, not the driver_bills default $0.48/mi.** His own database already records why:
a voided earnings line on load 13619 (`AUTH-104`) states verbatim *"this line's $0.48/mi
driver_bills-sourced figure ($781.06) does not match the signed document's $0.45/mi figure"* — his
real, signed rate is $0.45/mi, independently confirmed by his own two most recent AlwaysTrack-sourced
settled loads (13610, 13619), both at exactly $0.45/mi loaded and empty miles alike. Not copied from
another driver — his own established, signed rate, used twice already.

**Seeded, live, committed:**
- `driver_finance.settlement_lines`: 2 new `earnings` rows on settlement `b3912fde-...` —
  "Load 13633 — Loaded Miles 1,497.7 @ $0.45" = $673.97; "Load 13634 — Loaded Miles 1,358.6 @ $0.45"
  = $611.37. Same `item_id`/`posting_account_id` as his real historical earnings lines (not invented).
  `source_driver_bill_id` links each to its driver_bills row. Constraint verified
  (`round(quantity*rate_cents) = round(amount*100)`) before commit.
- `driver_finance.driver_bills`: both rows' `settled_in_settlement_id` set to `b3912fde-...`,
  `status` left `open` (matches the existing convention for bills linked to a still-open settlement
  — 6 other live examples share this exact shape).
- `driver_finance.driver_settlements` (`b3912fde-...`): `first_load_number='13633'`,
  `last_load_number='13634'`, `gross_pay=net_pay=1285.34`.

**Not added, flagged instead:** every one of his other settled loads also carries a flat $25.00
`escrow_contribution` line alongside earnings. Not added here — the ask was specifically driver pay
(earnings), and I did not want to guess whether the escrow policy applies identically before that's
confirmed. If it should, it's two more lines, same pattern as ROUND 198's resolutions.

## C — The 56 ambiguous extra_pay rows, grouped for one ruling.

56 rows, `line_type='extra_pay'`, description pattern `"AlwaysTrack tarp/other/extra-stop load
NNNNN settl NNNN"` (one real load+settlement each, not a literal duplicate description — 56 distinct
rows, one shared ambiguous CONCEPT). **Total: $3,868.91.** No raw itemized AlwaysTrack payload exists
anywhere in this schema to split them by row (checked `information_schema.tables` for any
raw/settlement/alwaystrack-shaped source — none).

Amount distribution (for context, not as a rule to auto-split): 29 of 56 are exactly $50.00; the
rest range $11.76–$581.26 with no clean pattern that maps to a specific one of the 3 items.

**The 3 candidate items this description could mean** (all exist in `catalogs.items`, USMCA-scoped):
- Driver Pay-Tarp-Enlonada/Desenlonada
- Driver Pay-Extra Pick Up
- Driver Pay-Extra Delivery/Drop

One ruling closes all 56: either pick one item for the whole group, or give a rule (e.g., by amount,
by load leg count) that this session can apply mechanically without guessing per row.
