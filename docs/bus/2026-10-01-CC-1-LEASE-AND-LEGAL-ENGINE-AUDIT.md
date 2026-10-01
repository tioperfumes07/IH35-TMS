# CC-1 — LEASE ENGINE + LEGAL ENGINES AUDIT (2026-10-01, read-only, code + prod)

Owner 2026-10-01: T122 / T124 / T156 (owner IH 35 Transportation) ARE leased to USMCA; contract + amounts not yet
entered. Lease engine redesign in progress with the owner's Claude agent — this is the as-built inventory.

## Prod (read as ih35_ci_readonly)
- accounting.lease_contract 0 rows · lease_asset_line 0 · lease_schedule_period 0 · lease_classification 0 ·
  catalogs.lease_terms 12. USMCA operates 16 leased trucks (13 TRK-owned, 3 TRANSP-owned) — **0 lease contracts**.
- legal.matters 18 · contract_templates 71 · contract_instances 4 · contract_instance_links 0 · insurance.claim 8 ·
  insurance.lawsuit 2.

## Lease engine — as built
- Tables `202606290062_fin22_lease_asc842_subledger.sql` (+ `202611020000_lease06` equipment_id, lessee company,
  one-lessee / one-asset-kind / no-self-lease CHECKs; `202613301000_fleet_lease_08` rate_per_unit informational).
- Services `accounting/lease-asc842/lease.service.ts` (create, add asset, schedule, activate),
  `lease-posting.service.ts`; routes `lease-posting.routes.ts` (accounting autoload); screen
  `/accounting/leases/:id` view-only; legal `TruckLeaseCreatorModal` / `UnifiedContractCreatorModal`.

## Gaps (priority order)
1. **Lessor contradiction** — owner ruling 2026-08-30 (`scripts/run-fleet-lease-08-…mts:4-8`) says lessor =
   TRANSP; poster re-title guard (`lease-posting.service.ts:156-172`) throws RETITLE_REQUIRED unless unit owner is
   TRK; `rental_income` bound only on TRK (`202612320000`). T122/T124/T156 cannot post as wired.
2. **Orphan AP/AR** — lessee Cr ap_control (`:497-510`) and lessor Dr cash/AR (`:200-203`) with NO bill / invoice
   row; FH-8 §2.3 monthly bill (`LEASE_CONTRACT_BILLING_ENABLED`) never built → subledgers cannot tie.
3. **Intercompany 8000-block due-to/due-from** (`202609210000`) unused by the poster → consolidation elimination.
4. `LEASE_GL_POSTING_ENABLED` ON for TRK only → lessee (USMCA/TRANSP) entries silently skipped.
5. No monthly automation — only period 1 posts at activation; no cron for later periods.
6. **Two sources of truth** — `mdata.units.currently_leased_to_company_id` set by unit/equipment edit, never from
   or checked against an active lease.
7. Trailers: DB has `lease_asset_line.equipment_id`, but `addLeaseAsset` / route take no equipment_id; detail
   page drops trailers.
8. Screens: no lease list, no create/edit, no lease section on the main unit / trailer profile; the unit finance
   tab is same-company only and plain text (a USMCA user never sees a TRK/TRANSP-booked lease).
9. Legal → finance: `lease.signed` event (`signed-finance-handoff.service.ts:158-190`) has no listener; truck-lease
   modal books lessee as a vendor and vehicles as free text; contract link types lack company / vendor / trailer /
   lease_contract / load.
10. Lessee ASC 842 (ROU asset, lease liability — FH-3/7/8 Part C) unbuilt; insurance / IRP / maintenance
    responsibility only template prose (no fields, no link to insurance.policy_unit); poster writes JEs inline,
    not through the shared poster.

## Legal engines — linkage
| | Customers | Vendors | Drivers | Units | Trailers | Loads | AP | AR | Expense | CoA/GL | Void stamps |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Contracts / e-sign | both ways | partial (no link type) | fwd; no profile reverse | fwd; no reverse | missing | missing | n/a | n/a | n/a | none (guarded, correct) | yes |
| Matters | missing | missing | both ways | both ways | both ways | missing | bills.legal_matter_id | missing | expenses.legal_matter_id | reserve never accrued; no legal-expense / accrued-legal-liability roles | no (close only) |
| Insurance claim | — | yes | yes | via assets | yes | yes | bill_id | missing (recovery) | expense_id | recovery postings table (0) | — |
| Insurance lawsuit | — | missing (attorney vendor) | missing | missing | missing | missing | missing | — | — | — | — |

Doc anchors: `docs/specs/FH-8-LEASE-CONTRACT-DESIGN.md`, `docs/specs/FH-3-FH-7-FH-8-ASC842-DESIGN-2026-06-28.md`.
CC-1 builds on the owner's redesign instructions; nothing changed by this audit.
