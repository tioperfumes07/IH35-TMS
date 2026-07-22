# Top-10 builder evidence — NEEDS-OWNER "finish the ANSWERED items" pass (2026-07-21)

> **Read-only evidence note** produced by a build-only (no-merge) pass over the Top-10 buildable
> actions in `docs/trackers/NEEDS-OWNER-ADJUDICATION-2026-07-21.md`. Verified against repo state at
> `origin/main` HEAD `b4e5254`. No `accounting.*` / `catalogs.*` / `mdata.*` / `db/migrations/*` were
> touched by this pass. Financial-cluster items are documented and left **HOLD-FOR-JORGE**; the
> factoring **reserve accounts are owner-manual only** (permanent ruling 2026-07-21) and were not touched.
>
> Purpose: stop re-litigating already-built items and give the owner/coordinator a crisp, verified
> map of what is **BUILT**, what is **HOLD (needs a migration / owner Neon-apply)**, and what is a
> **doc/CI-only** remainder. Precedence: prod-verified FACTS > guard > repo > doc > memory (§0).

## Verdict table

| # | Item | Verified state | Remaining action | Class |
|---|------|----------------|------------------|-------|
| 1 | **CHAIN-06** AR-subledger divergence | **BUILT in code.** `postFactoringCustomerPaymentEvent` updates `accounting.invoices.amount_paid_cents` + `status` (via `applyCustomerPaymentSubledgerRelief`); chargeback updates `status`→`factored` only (by design). All three guards wired (verify-steps **920/921/922**). | None to build. Refresh stale docs that still describe the bug as open (see "Stale docs"). Owner still gates the `FACTORING_GL_POSTING_ENABLED` flag + live Neon tie-out. | code done; owner flag gate |
| 2 | **0285-df-gap2 / flow5** dedup consolidation | **PARTIAL.** `payroll.*` copy retired (routes 308, CI baseline 0). GL poster reads **only** `driver_finance.driver_settlement_deductions`. But `driver_finance.settlement_lines` still has active writers: `line_type='deduction'` (net-pay mirror), `'abandonment_chargeback'` (no canonical row → invisible to GL), and dead `'auto_deduction'` (unmounted). `deduction_schedule` is an amortization **plan** that does not materialize canonical rows. | Owner decision open (§9.1): full-canonical retire vs document `settlement_lines` as display-only + reconciliation guard. Then a financial build. | **HOLD** (financial + owner decision) |
| 3a | **0091-d1-2** vendor resolver | **PARTIAL.** Expense/bill/ReferenceSelect + QboCombobox vendor **reads** now hit canonical `mdata.vendors`. But WO create validation (3 sites), the `maintenance.work_orders.vendor_id` **FK → `mdata.qbo_vendors`**, and CC-payment QBO lookup still bind the RETIRE mirror. No unified resolver module exists. | Repoint requires a **migration** (WO FK `mdata.qbo_vendors`→`mdata.vendors`, + `road_service_tickets.vendor_id`). Code-only change would violate the current FK. | **HOLD** (financial + migration) |
| 3b | **0008-g3** QBO mirror canonical | **Step-2 code repoint DONE.** No live backend writes to `accounting.qbo_{accounts,customers,vendors}`; `scripts/verify-no-accounting-qbo-writes.mjs` passes. | **CI-wire the guard** (shipped this pass — see PR "wire-accounting-qbo-writes-guard"). Step-1 migration `202607560000` remains **owner-HELD**; then shrink G4 baseline + deprecate (never drop) `accounting.qbo_*`. | guard wired (non-fin); migration owner-HELD |
| 4 | **CHAIN-04** Part-2b accept-bill | Read-only tie-out live. Auto-create `bill_payment` on accepting a "bill" bank-match candidate is not yet wired. | Build via the **existing** bill-payment poster (no new GL math). Touches posting → financial. | **HOLD** (financial) |
| 5 | **0490** reporting.* vs reports.* | **NOT done.** Both schemas exist; two incompatible `scheduled_reports` shapes. Guard `verify-no-deprecated-schema-creates.mjs` marks `reporting` DEPRECATED — **inverted vs §9.6** (which makes `reporting` canonical). Live mounted code writes `reports.*`; orphaned `reporting.*` CRUD/worker exists but is unmounted. No data migration. | Guard-flip alone is unsafe (existing `reports.*` `CREATE TABLE` migrations would trip it, and live writers target `reports.*`). Needs a mapped **migration** + code repoint + guard fix together. | **HOLD** (migration + repoint) |
| 6 | Verify-only (FIX-05 split, bf7 cash-advance recovery, DISP-WO, bf4 customer payment) | Per adjudication + §9.9 (all GL flags ON): these are flagged BUILT/flag-ON. FIX-05 explicitly **BUILT-LIVE** (skip rebuild). | LIVE proof needs gated prod Neon / health-endpoint access (owner hand). Without it: **UNVERIFIED — needs live check**; do not re-build. | verify-only (owner/live) |

## What this pass shipped (build-only, unmerged)

- **PR `chore/wire-accounting-qbo-writes-guard`** — CI-wires `verify-no-accounting-qbo-writes` via
  `scripts/verify-steps/1210-*.mjs` + drops its `.guard-exempt.json` line. Non-financial, Rule-17
  compliant (no `package.json`/`ci.yml`/`locked-guards.yml` edits). `verify:guard-wired` PASS,
  0 unaccounted. This is the concrete remainder of **0008-g3**.
- **This note** — the verified Top-10 map.

## Stale docs to refresh (flagged, NOT edited — several are owner-locked)

CHAIN-06 is fixed in code, but these still describe the pre-fix latent bug as current. They are
**owner/governance-locked**, so this builder pass flags them rather than editing:

- `docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md` (~lines 33–34) — "posters do NOT update subledger".
- `docs/specs/qbo-parity/CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md` §5 — "not patched here".
- `scripts/verify-chain-06-factoring-ar-tieout.mjs` header (~lines 8–9) — "amount_paid_cents is never updated".
- `docs/trackers/backlog-verify/accounting.md` — "chain-06 guards NOT referenced by workflows" (stale: wired via verify-steps 920–922 under Rule 17).

## Not touched (by standing law)

- Factoring **reserve accounts / reserve ledgers** — owner-manual only (permanent ruling 2026-07-21).
- Any `db/migrations/*`, `accounting.*`, `catalogs.*`, `mdata.*` schema/data — financial cluster, owner-gated.
- Held migrations (`202607560000`, others in `.held-migrations.json`) — owner Neon-apply only.
