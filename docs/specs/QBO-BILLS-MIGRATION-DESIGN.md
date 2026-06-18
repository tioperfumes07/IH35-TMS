# QBO Open A/P Bills → accounting.bills — Migration DESIGN (design-first, owner-gated)

**Status: DESIGN ONLY — not built, not scheduled.** This is the prerequisite that makes the Accounts
Payable page (PR #1176) show real data and lets A/P reconcile toward the 99.9% / cancel-QBO goal.
It imports **real financial data** → financial cluster: show SQL/plan first, Jorge OK, GUARD-verify,
**never self-merge**. Reuses existing tables; writes no new GL math.

## Why this is needed
GUARD live (2026-06-18): `accounting.bills` = **0 rows** for TRANSP; `/api/v1/accounting/ap-aging`
returns zero. The real open A/P (**$1,182,195.33 / 147 vendors**) lives in **QBO**, never migrated. The
A/P page ties to QBO in *structure*; this migration makes the *data* real. Two separate deliverables —
the page (done, #1176) and this import — must not be conflated.

## Source of truth for the bills
`mdata.qbo_bills` is a **mirror that FKs an existing `accounting.bills` row** (`bill_id NOT NULL`), so it
is NOT the import source. The un-migrated QBO open bills come from one of:
- **`qbo_archive.entities_snapshot`** (`qbo_entity_type='Bill'`, append-only raw QBO JSON, per-company) —
  if a forensic snapshot of Bills exists; OR
- a **fresh QBO pull** of open Bills / the A/P Aging Detail (QBO `Bill` query or the MCP
  `qbo_accounting_get_ap_aging_detail`), archived into `entities_snapshot` first (so the import is
  reproducible and auditable, never a blind live write).

**Step 0 of the plan: confirm which source actually holds the 147-vendor / $1.18M open set, per entity.**

## Target — `accounting.bills` (exists; carries the QBO bridge already)
Columns present: `operating_company_id`, `vendor_uuid` (text), `amount_cents`, `paid_cents`, `due_date`,
`status` (default `unpaid`; `partial`/`paid`), **`qbo_bill_id`** (the QBO bridge). No schema change needed
for the core import (verify `qbo_bill_id` is UNIQUE per company; add a partial unique index if absent —
that index would be the only additive migration, show-SQL-first).

## Mapping (per bill, per entity — TRANSP first)
| accounting.bills | from QBO Bill |
|---|---|
| operating_company_id | the entity (TRANSP `91e0bf0a…`) |
| qbo_bill_id | QBO `Bill.Id` (bridge; idempotency key) |
| vendor_uuid | resolve `Bill.VendorRef` (qbo vendor id) → `mdata.vendors.qbo_vendor_id` → vendor id, **same entity** |
| amount_cents | `Bill.TotalAmt × 100` (integer cents) |
| paid_cents | `TotalAmt − Balance` × 100 (so `amount−paid = Balance = open`) |
| due_date | `Bill.DueDate` |
| status | `Balance=0`→`paid`; `0<Balance<Total`→`partial`; else `unpaid` |
| txn_date / doc_number | `Bill.TxnDate` / `Bill.DocNumber` (→ mirror) |

After insert, write the `mdata.qbo_bills` mirror row (`bill_id` → the new bill, `qbo_id`, `total_cents`,
`payload_json` = raw, `created_in_tms=false`, `sync_status='synced'`).

## Invariants
- **Idempotent:** `INSERT … ON CONFLICT (operating_company_id, qbo_bill_id) DO NOTHING` — re-runs never
  double-create. A re-run after new QBO bills appear imports only the new ones.
- **Per-entity / no commingling:** TRANSP only in pass 1; TRK/USMCA are separate passes against their own
  QBO realm. Vendor resolution is entity-scoped.
- **Open-only (optional):** import open bills (`Balance > 0`) for A/P aging; or import all + let status
  reflect paid (fuller history). Decision for Jorge.
- **Unresolved vendor:** if `VendorRef` has no `mdata.vendors` match, do NOT silently drop — surface as a
  gap (the vendor mirror must be complete first, like the CoA-completeness gap). Bill stays unimported,
  reported.
- **void-not-delete / audit:** standard; the import is additive.

## Verification (GUARD, after a sanctioned run — NOT prod-blind)
- `SUM(amount_cents − paid_cents)` over `accounting.bills` (TRANSP) **= QBO A/P aging total ($1,182,195.33)**.
- vendor count = 147; top line = intercompany "Ih 35 Trucking-Vendor" $293,232.84.
- The A/P page (#1176) now shows the real buckets and TOTAL **ties to QBO**.
- Every imported bill has a non-null `qbo_bill_id` (1:1 bridge; no orphan/dupe).

## Sequencing / gates
1. **Step 0** — confirm the source set per entity (archive vs fresh pull); report counts.
2. Design the importer (a script or a one-shot migration that reads the archived snapshot) + the optional
   `qbo_bill_id` unique-index migration — **show SQL/plan first**.
3. Run on an **isolated Neon branch** (same recipe as #1173) → GUARD verifies the $1.18M tie → Jorge OK →
   run against prod under owner authorization. **Never self-merge; never blind prod write.**

This is the critical path to real A/P reconciliation. Tracked; not started.
