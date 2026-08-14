# CLAIMED-LEAVES — leaf-level claim board (anti-collision, cross-lane)

**Purpose:** prevent two coders from independently building the same reverse_link/connectivity leaf
at the same time (harmless-but-wasteful today: Cursor converted an EntityLink kind on a leaf CC-1
had just shipped). Mirrors the discipline `scripts/verify-steps/CLAIMED-NUMBERS.json` already
enforces for verify-step numbers, applied to scoreboard leaves instead.

**Rule (owner-directed, 2026-08-14):** before starting work on a `module:leaf` from the
`LINK-F5170`/`LINK-F5171` filings (or any future honesty-sweep filing), add a row here. Check this
file first — if another coder already claimed the leaf, don't duplicate; either skip it or
coordinate directly. Remove/mark DONE with the closing PR# once shipped; never delete a row, only
append status.

**Report format (permanent, all lanes, all future status updates):** every leaf claimed FIXED must
cite `LEAF / PR# / GUARD / WHAT CHANGED / OWNER-GATED`. No `X/Y cumulative` counters — see
`docs/audit/GUARD-WORKORDERS.md` 2026-08-14 entries for why (self-reported cumulative counts for
both LINK-F5170 "30/30" and LINK-F5171 "48/75" did not survive independent re-verification; itemized
per-leaf claims did). `OWNER-GATED: yes` requires a literal chat quote from the owner with a date —
a pending doc (e.g. `[HOLD-FOR-JORGE]` with unchecked approval boxes) is NOT an owner decision and
the leaf stays OPEN.

**Lane ownership (owner-directed, 2026-08-14):**
- **CC-1 (Claude Coder, money lane):** `banking.*`, `settlements.*`, `factoring.*`, `accounting.*`,
  and any leaf touching invoices/payments/liabilities/GL-JE. No other lane edits
  `apps/backend/src/{factoring,banking,accounting,settlements}/**` or their frontend API modules
  except for isolated `EntityLink` kind-consistency conversions.
- **Codex:** `safety.*`, `insurance.*`, `fuel.*`, `cash-flow.*`, `system.*`, `compliance.*`,
  `fleet.*`, `vendors.*`, `tasks.*`, `inventory.*`, `maintenance.*` (non-money reverse_link/
  connectivity gaps) + WAVE-A entity-column `.*`-floor removal.
- **Cursor:** `dispatch.*` (non-factoring), `customers.*`, general EntityLink/screen-consistency
  janitor pass.

---

## Claimed / in-progress

| Leaf | Claimed by | Date | Status |
|---|---|---|---|

## Done (cite closing PR, itemized format above lives in the PR body / GUARD-WORKORDERS.md)

| Leaf | Closed by | PR# | Guard |
|---|---|---|---|
| `settlements:disputes` | CC-1 | #6740 | `verify-driver-settlement-finance-reverse-section.mjs` |
| `settlements:liabilities.list` | CC-1 | #6740 | `verify-driver-settlement-finance-reverse-section.mjs` |
| `banking:reconciliation` | CC-1 | #6752 | `verify-bank-account-reconciliation-reverse-section.mjs` |
| `banking:driver_escrow` | CC-1 | #6760 | `verify-banking-driver-escrow-reverse-link.mjs` |
| `factoring:factors.admin` | CC-1 | #6792 | `verify-customer-factoring-reverse-section.mjs` |
| `factoring:batches.detail` | CC-1 | #6792 | `verify-customer-factoring-reverse-section.mjs` |
| `factoring:dispatch.queue` | CC-1 | #6804 | `verify-factoring-dispatch-queue-reverse-section.mjs` |
| `factoring:home.recourse_pipeline` | CC-1 | #6821 | `verify-factoring-recourse-chargebacks-reverse-section.mjs` |
| `factoring:home.chargebacks_fees` | CC-1 | #6821 | `verify-factoring-recourse-chargebacks-reverse-section.mjs` |
| `factoring:submit.queue` | CC-1 | #6836 | `verify-factoring-submit-queue-reverse-section.mjs` |
| `factoring:home.equipment_loans` (vendor side — unit side already built) | CC-1 | #6876 | `verify-vendor-equipment-loans-reverse-section.mjs` |
| `factoring:home.vendor_merges` (driver + vendor side) | CC-1 | #6895 | `verify-vendor-merges-reverse-section.mjs` |
| `settlements:panel.open_driver_bills` | Cursor | #6726 | `verify-load-driver-pay-bill-entitylink.mjs` |
| `dispatch:load.drawer.driver_pay` | Cursor | #6726 | `verify-load-driver-pay-bill-entitylink.mjs` |
| `dispatch:load.drawer.factoring` | Cursor | #6733 | `verify-load-factoring-invoice-entitylink.mjs` |
| `customers:detail.quality` | Cursor | #6736 | `verify-roundtrips-quality-load-entitylink.mjs` |
| `dispatch:misc.layover` | Cursor | #6806 | (sibling guards; no dedicated leaf guard yet — flagged by Cursor itself) |
| `safety:safety.drawer.company_violation_detail` | Codex | #6750 | `verify-safety-alert-profile-reverse.mjs` |
| `safety:safety.parity.company_violation_detail` | Codex | #6750 | `verify-safety-alert-profile-reverse.mjs` |
| `safety:safety.drawer.integrity_alert_detail` | Codex | #6750 | `verify-safety-alert-profile-reverse.mjs` |
| `safety:safety.parity.integrity_alert_detail` | Codex | #6750 | `verify-safety-alert-profile-reverse.mjs` |
| `safety:safety.drawer.anomaly_detail` | Codex | #6750 | `verify-safety-alert-profile-reverse.mjs` |
| `safety:safety.parity.anomaly_detail` | Codex | #6750 | `verify-safety-alert-profile-reverse.mjs` |
| `insurance:coverage_gaps` | Codex | #6756 | `verify-insurance-profile-reverse.mjs` |
| `insurance:lawsuits.list` | Codex | #6756 | `verify-insurance-profile-reverse.mjs` |
| `fuel:card_overage` | Codex | #6761 | `verify-fuel-card-overage-profile-reverse.mjs` |
| `drivers:panel.team_split_config` | Codex | #6768 | `verify-driver-team-split-config-reverse.mjs` |
| `cash-flow:cash-flow.panel.projection` | Codex | #6774 | `verify-cash-forecast-profile-reverse.mjs` |
| `dispatch:dispatch.modal.save_load_template` | Codex | #6777 | `verify-load-template-customer-reverse.mjs` |
| `system:audit.trail` | Codex | #6785 | `verify-system-audit-record-reverse.mjs` |
| `accounting:payments.receive` | Codex (unconfirmed guard) | #6724 | TBD — Codex to confirm |
| `accounting:accounting.parity.vendor_credits_page` | Codex (unconfirmed guard) | #6724 | TBD — Codex to confirm |
| `accounting:accounting.panel.trk_bulk_register` | Codex (unconfirmed guard) | #6724 | TBD — Codex to confirm |
| `accounting:accounting.panel.detail` | Codex (unconfirmed guard) | #6724 | TBD — Codex to confirm |
| `lists:catalog.drivers.teams.list` | Codex (unconfirmed guard) | #6728 | TBD — Codex to confirm |
| `dispatch:queues.detention` | Codex (author) · Cursor (confirm 2026-08-14) | #6853 | `verify-dispatch-detention-reverse-links.mjs` (+ `verify-dispatch-detention-board.mjs`) |
| `dispatch:docs.pod` | Cursor (confirm 2026-08-14) | pre-existing + guards green | `verify-disp-wire-03-pod-capture.mjs` · `verify-dispatch-pod-bol-workflow.mjs` · `verify-pod-bol-evidence-linkage.mjs` |
| `dispatch:docs.ocr` | Cursor (confirm 2026-08-14) | pre-existing + guards green | `verify-dispatch-ocr-queue.mjs` |
| `tasks:tasks.drawer.task` | Codex (author) · Cursor (confirm 2026-08-14) | #6864 siblings / step 3310 | `verify-task-drawer-reverse-links.mjs` |
| `lists:chrome.toolbar_filter` | Cursor | #6858 | `verify-collapsed-list-filters-apply.mjs` (FilterPopover draft→Apply) |
| `dispatch:settings.notify` (customer reverse Open) | Cursor | #6863 | `verify-customer-notify-linkage.mjs` |
| `safety:driver_scheduler` temp-cover Open (driver/unit) | Cursor (EntityLink janitor) | #6863 | `verify-temp-cover-driver-linkage.mjs` · `verify-temp-cover-unit-linkage.mjs` |
| `dispatch:load.safety.open_queues` | Cursor | #6872 | `verify-safety-load-reverse-accidents.mjs` · `verify-hos-violation-linkage.mjs` · `verify-internal-fine-load-reverse.mjs` |
| `safety:driver_unit.accidents_hos_fines.open` | Cursor (EntityLink janitor) | #6872 | `verify-hos-violation-linkage.mjs` · `verify-asset-safety-reverse-section.mjs` |
| `dispatch:load.safety.incident_open_queues` | Cursor | #6875 | `verify-safety-load-reverse-accidents.mjs` · `verify-safety-incident-list-filters.mjs` |
| `safety:asset.incident_open_queues` | Cursor (EntityLink janitor) | #6875 | `verify-asset-safety-reverse-section.mjs` |
| `safety:driver.dot_training_complaints.open` | Cursor (EntityLink janitor) | #6880 | `verify-driver-safety-reverse-section.mjs` |
| `safety:asset.dot_dvir.open` | Cursor (EntityLink janitor) | #6880 | `verify-asset-safety-reverse-section.mjs` |
| `settlements:disputes.open_queue` | Cursor (EntityLink janitor) | #6885 | `verify-driver-settlement-finance-reverse-section.mjs` |
| `customers:factoring.open_entitylink` | Cursor (EntityLink janitor) | #6888 | sibling factoring reverse guards |
| `safety:section_shell.open_entitylink_only` | Cursor (EntityLink janitor) | #6893 | `verify-driver-safety-reverse-section` · `verify-asset-safety-reverse-section` |
| `compliance:tab.hos_tracker` | Codex · Cursor confirm 2026-08-14 | #6739 / #6744 | `verify-compliance-hos-profile-reverse.mjs` PASS |
| `compliance:fleet.hos_board` | Codex · Cursor confirm 2026-08-14 | #6739 | `verify-compliance-hos-profile-reverse.mjs` PASS |
| `compliance:property_tax.list` | Codex · Cursor confirm 2026-08-14 | #6743 | `verify-compliance-tax-filings-unit-reverse.mjs` PASS |
| `compliance:property_tax.detail` | Codex · Cursor confirm 2026-08-14 | #6743 | `verify-compliance-tax-filings-unit-reverse.mjs` PASS |
| `compliance:form2290` | Codex · Cursor confirm 2026-08-14 | #6743 | `verify-compliance-tax-filings-unit-reverse.mjs` PASS |
| `fleet:unit.profile.documents` | Codex · Cursor confirm 2026-08-14 | #6731 | `verify-fleet-reverse-link-remainder.mjs` PASS |
| `fleet:unit.detail.tasks` | Codex · Cursor confirm 2026-08-14 | #6729 | `verify-fleet-unit-profile-edit-detail.mjs` PASS |
| `fleet:unit.edit.quick_availability` | Codex · Cursor confirm 2026-08-14 | #6731 | `verify-fleet-reverse-link-remainder.mjs` PASS |
| `fleet:trailer.profile.assignment` | Codex · Cursor confirm 2026-08-14 | #6731 | `verify-fleet-reverse-link-remainder.mjs` · `verify-trailer-profile-sections-complete.mjs` PASS |
| `fleet:trailer.profile.maintenance` | Codex · Cursor confirm 2026-08-14 | #6731 | `verify-trailer-profile-sections-complete.mjs` PASS |
| `fleet:trailer.profile.insurance_claims_reverse` | Codex · Cursor confirm 2026-08-14 | #6731 | `verify-trailer-profile-sections-complete.mjs` PASS |
| `fleet:trailer.profile.documents` | Codex · Cursor confirm 2026-08-14 | #6731 | `verify-fleet-reverse-link-remainder.mjs` PASS |
| `vendors:md.vendor_details` | Codex · Cursor confirm 2026-08-14 | #6718 | `verify-vendor-master-detail-reverse-link.mjs` · `verify-master-detail-reverse-leaves.mjs` PASS |
| `inventory:assignments.wo_link` | Codex · Cursor confirm 2026-08-14 | pre-existing | `verify-dispatch-inventory-vendor-workflow-links.mjs` PASS |
| `maintenance:arriving_soon.convert_to_wo` | Codex · Cursor confirm 2026-08-14 | board FIXED | `verify-arriving-soon-work-order-reverse.mjs` PASS |
| `drivers:disputes` | Codex · Cursor confirm 2026-08-14 | tip guards | `verify-drivers-subnav-routes-registered.mjs` · `verify-driver-settlement-finance-reverse-section.mjs` PASS |
| `maintenance:defects.convert_to_wo` | Codex · Cursor confirm 2026-08-14 | tip guards | `verify-maintenance-reverse-link-remainder.mjs` · `verify-maintenance-picker-law-queues.mjs` PASS |
| `maintenance:pre_flight_dvir.queue` | Codex · Cursor confirm 2026-08-14 | tip guards | `verify-preflight-dvir-tabs-url-sync.mjs` · `verify-maintenance-hidden-surface-reverse-links.mjs` PASS |
| `maintenance:panel.pm_alerts` | Codex · Cursor confirm 2026-08-14 | tip guards | `verify-pm-alert-work-order-picker.mjs` PASS |
| `factoring:home.vendor_merges` | Cursor (EntityLink janitor) · #6895 surface | #6899 | `verify-vendor-merges-reverse-section.mjs` |

## Uncertain — empty (Cursor confirm 2026-08-14 night)

All prior Uncertain rows moved to Done after independent guard PASS on tip `origin/main`.

## Open — genuinely unclaimed by anyone (as of 2026-08-14 evening)

| Leaf | Lane owner |
|---|---|
| `settlements:cash_advances` | CC-1 |
| `settlements:modal.mark_disbursed` | CC-1 |
| `settlements:modal.hold_deduction` | CC-1 (honestly un-built by LINK-F5174, was false-green before) |
| `settlements:modal.liability_breakdown` | CC-1 (same) |
| `settlements:drawer.advance_detail` | CC-1 (same) |
| `settlements:drawer.liability_detail` | CC-1 (same) |
| `settlements:panel.pay_run_close` | CC-1 (same) |
| `factoring:accounting.list` | CC-1 |
| `factoring:banking.entry` | CC-1 |
| `accounting:reverse.open_entitylink` | CC-1 / Rule 23 — EntityLink-only Open on Invoices/Bills/Expenses reverse is money theater without write path; skip Cursor |

## Reclassified — not a fix, Required-flag correction

| Leaf | Note |
|---|---|
| `fleet:unit.profile.qbo_mapping` | Codex scope-corrected: dropped from Required (was never a real gap) |

---

## Known denominator defect (do not cite "75" or "30" as exact without re-deriving)

The original `LINK-F5171-REVERSE-LINK-COLUMN-GAPS` filing (`docs/audit/GUARD-WORKORDERS.md`, CC-1,
2026-08-14) states "75 leaves" but three independent recounts of its own prose (CC-1 regex: 73,
CC-1 manual: 68, Codex: 78) all disagree with each other and with the stated 75. There is no
machine-readable list backing that number — `docs/specs/scoreboard/modules/*.required.json`'s
`honesty_audit` sections only record the FALSE-dropped leaves, not the GENUINE-GAP ones. This
table (above) is now the closest thing to an authoritative itemized list; treat it as the source of
truth going forward, not the original filing's summary count. The `LINK-F5170` connectivity filing's
"30" held up under recount (confirmed 30 distinct leaves), so that denominator is trustworthy.
