# PROGRAM SCENARIOS + MATRIX — LIVE CONNECTIVITY PROOF (owner 2026-08-24)

**Owner word:** Coders (including Devin and Cascade) **run and complete the scenarios in Program**, **and the mapping (matrix)**, and prove each TEST transaction lands in the **correct tables, ledgers, columns, and modules**. That is how we authenticate **true connectivity and linkage**. Create labeled TEST / samples. **Void at launch** (CREATE-TEST-THEN-VOID). Never DELETE financial rows.

This is **not** a U14 recertify. Do **not** restamp CERTIFIED modules. Unique leftover hunt stays in force; this wave **adds** the Program hop/matrix proof.

---

## Surfaces (live USMCA)

| What | URL |
|------|-----|
| Program board + Scenario Tracker | `/program` |
| Module mapping (Required / Audited / Done) | `/program/matrix?module=<module>` |
| Tracker spine | `/program/tracker` |
| Hop identity (code) | `apps/frontend/src/pages/program/scenario-tracker/registry.ts` |

Live SHA first: `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`.

---

## The 9 hops (run in order on **one** labeled TEST load)

Canonical keys from `HOP_IDENTITY`. Every hop: click the Program title → live href → **create TEST if empty** → reload → **prove the write**.

| # | Key | Title | Live href | Money / table proof (must name row) |
|---|-----|-------|-----------|-------------------------------------|
| 1 | `hop.book` | Book the load | `/dispatch/book-load` | `mdata.loads` row; customer FK; proforma writer if wired |
| 2 | `hop.assign` | Assign driver & truck | `/dispatch` | load.driver_id + unit_id; pay = rate×shortest miles |
| 3 | `hop.dispatch` | Dispatch / in transit | `/dispatch` | in-transit; `actual_departure_at` on Delivered drag |
| 4 | `hop.deliver` | Deliver — record time | `/dispatch` | delivered_pending_docs + departure timestamp |
| 5 | `hop.pod_bol` | POD + BOL | `/dispatch` | completed_docs_received; billing trigger |
| 6 | `hop.revenue` | Earn the revenue | `/accounting/invoices` | Event 1 JE **or loud flag-OFF** (never silent $0) |
| 7 | `hop.invoice` | Make the invoice | `/accounting/invoices` | `accounting.invoices` + lines; customer_id; load_id |
| 8 | `hop.gl` | Money in the books | `/accounting/journal-entries` | balanced `journal_entries` + postings; USMCA opco |
| 9 | `hop.bank` | Match the bank | `/banking/transactions` | payment apply; A/R down; bank match |

**Posting flags default OFF** until owner says turn on. If JE is skipped: **loud skip + named flag**, never silent $0. Empty TMS before create is expected.

---

## Scenarios (Program tracker cards)

Run **your lane’s scenarios** from `SCENARIO_IDENTITY`. Same bar: create TEST → canonical table → reverse link on the other module → OUTBOX finding.

| Key | Href (registry) | Lane owner |
|-----|-----------------|------------|
| `scenario.customer` | `/customers` | Devin-A + Cursor |
| `scenario.coa` | `/lists/accounting/chart-of-accounts` | CC-1 |
| `scenario.ap` | `/accounting/bills` | CC-1 |
| `scenario.factoring` | `/factoring` | CC-1 + Cascade |
| `scenario.banking` | `/banking/transactions` | CC-1 + Cascade |
| `scenario.driver_onboarding` | `/drivers` | Codex |
| `scenario.settlement` | `/driver-finance/settlements` | Codex + Cascade |
| `scenario.advance` | `/drivers/cash-advances` | Codex |
| `scenario.deductions` | `/drivers/deductions` | Codex |
| `scenario.escrow` | `/banking/driver-escrow` | Codex + CC-1 |
| `scenario.fuel` | `/fuel` | Codex |
| `scenario.maintenance` | `/maintenance/work-orders` | Codex + CC-3 |
| `scenario.accident` | `/safety` | Codex |
| `scenario.insurance` | `/safety/insurance` | Codex |
| `scenario.legal` | `/legal/matters` | CC-3 |

**CC-2:** after hops exist, prove `/reports` `/cash-flow` `/tasks` **read the same TESTs** (not a second set of fake zeros).

**CC-3:** `/program` + `/program/matrix` chrome (500 / dead tab) **and** mapping cells for lists/legal/maintenance.

---

## Mapping (matrix) — required every seat

Open `/program/matrix?module=<your module>`. For each Required leaf you touch:

1. Click through to the **live** surface (not a scoreboard screenshot).
2. Confirm the cell is not fake-green (Required without a live hop).
3. If a create surface exists: CREATE TEST, then confirm the matrix/program tracker **does not claim Done** unless the live row exists.

Modules by seat (do not steal another seat’s prefix):

| Seat | Matrix `?module=` |
|------|-------------------|
| Cursor | `dispatch` `customers` |
| CC-1 | `accounting` `banking` `factoring` |
| CC-2 | `reports` |
| CC-3 | `lists` `legal` (maintenance unique only) |
| Codex | `drivers` `fleet` `safety` `fuel` |
| Cascade | audit all four money modules + hop 1–9 walk |
| Devin-A | `customers` then `dispatch` |

---

## FINDING shape (every seat, including Devin + Cascade)

File in `docs/audit/GUARD-WORKORDERS.md` (or OUTBOX if audit-only) **same turn**. Unique only:

- 500 / 404 on the hop API
- Dead click / silent no-op on Save
- Reverse-empty: Neon has the TEST row, UI shows none
- Fake $0 / swallow `.catch([])`
- **Linkage miss:** invoice without `customer_id`/`load_id`; JE without postings; payment that does not reduce Open; matrix leaf with no live target

Not a finding: empty table **after** you created TEST and it persisted; posting flag OFF with a **visible** skip; U14 recertify noise.

OUTBOX one-liner:

```
SEAT | ACK | PROGRAM-SCENARIO-PROOF | NOW=/program | SHA=<healthz> | HOP=<key> | TABLE=<schema.table> | UUID=<id> | JE=<id-or-FLAG-OFF> | FINDING=<id-or-none> | GO
```

---

## Law that still binds

- USMCA only. No TRANSP/TRK. No TMS→QBO write-back.
- U14 14/14 CERTIFIED — never restamp.
- CREATE-TEST-THEN-VOID — void at launch, not now.
- FAST-MERGE ~4 min. CC never `trigger_deploy`.
- RLS: do not treat Owner-unscoped 0 as absence; prove with opco + bypass discriminator when claiming “no row”.
