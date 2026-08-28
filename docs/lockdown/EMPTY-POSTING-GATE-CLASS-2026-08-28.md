# EMPTY POSTING-GATE CLASS (2026-08-28)

**SUPERSEDED for “KEEP GATE · N/A”:** owner 2026-08-27 23:15 typed **seed every gated table** (`docs/lockdown/OWNER-NEVER-IDLE-SEED-EVERY-TABLE-2026-08-27.md`). All seven `launch_owed: true`. KEEP GATE rows below are **history only**.

Claude enumerated seven money paths gated on **zero-row** tables (prod, `bypass_rls=lucia`). Blast radius: name-matched tables in accounting/factoring/factor/dispatch/banking/driver_finance — **not** every poster gate chain. The list may be longer; the guard must auto-discover, not freeze this table as complete.

## Class (not a one-off)

Same shape as ACCT-F5692 `missing_pod_evidence`: fail-closed poster returns a gate string; Chrome walk **PASSes**; GL **does not move**.

## Cursor first-pass triage (USMCA)

| Table | Rows (Claude) | Path | Triage | Why |
|---|---:|---|---|---|
| `dispatch.pod_documents` | 0 | Revrec Event 2 | **RELOCATED** | Owner **B**: A/R on delivery + issued invoice. POD stays on **factoring** `has_approved_pod`. |
| `factoring.batch` | 0 | Factoring batch posting | **SEED** labeled TEST batch | Launch-owed if USMCA factors. Empty batch = Chrome-green, no money. |
| `factor.faro_daily_imports` | 0 | Faro import → recon | **KEEP GATE · N/A** | Faro is TRANSP history. Do not fake Faro imports to green USMCA. |
| `dispatch.detention_evidence` | 0 | Detention billing | **SEED** labeled TEST | Ops money path; empty evidence = silent no-post. |
| `banking.equipment_loans` | 0 | Equipment loan posting | **KEEP GATE · N/A** | USMCA owns **no assets** today. Seeding a loan would assert a false state. |
| `accounting.related_party_loan_schedule` | 0 | RP interest accrual | **KEEP GATE · N/A** | No RP loan on USMCA = do not accrue. |
| `accounting.tax_document` | 0 | Tax document path | **KEEP GATE · N/A** | Not Horizon 1. Year-end path. |

Barely exercised (1–2 rows) stay on the detector list, not this seven: escrow_postings, bol_documents, related_party_loan_entries, cash_advance_requests, driver_advances.

## Guard (do **not** ship the naive rule)

**Owner 23:15:** gated tables must not stay at 0. Seed labeled TEST (including one TEST asset). Do not delete.

**Legal guard:** `verify-no-posting-gate-on-empty-table.mjs` (CC-2, claim ≡3 then author) fails when a table in `posting-gate-tables.json` with `launch_owed: true` has 0 USMCA rows (lucia + completeness discriminator). All seven rows are `launch_owed: true`. Do not invent a KEEP_GATE_NA exception without a new owner letter.

## ~15 posting types (C25 is the type, not the leaf)

Golden tests (CC-2) assert **accounts + signs** once per type. Leaves inherit. Chrome proves the button reaches the poster.

invoice · customer payment · bill · bill payment · expense · settlement · escrow · driver advance · factoring advance · fuel event · bank categorization · transfer · manual JE · depreciation · reimbursement

USMCA depreciation / equipment loan golden tests = **N/A** until a real asset exists (same as KEEP GATE).

## Speed / culture (this GO)

- CC-1 **merge** stays one money PR. **Writing** items 1–4 (void reverse, unapplied, role UNIQUE, stale comment) may overlap on local branches; B is unlocked and is the fifth land.
- One labeled USMCA fixture set, **keep-TEST**, never void for proof (CC-3).
- Lifecycle: SQL (Cascade) and Chrome (Devin-A) **in parallel**.
- **Unverified work = defect. Idle while named-blocked = correct.** Idle while a unique FINDING or an unblocked NOW exists = still defect.

Companion: `docs/lockdown/OWNER-DECISION-ACCT-F5692-OPTION-B-2026-08-27.md`. GO: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-2310.md`.
