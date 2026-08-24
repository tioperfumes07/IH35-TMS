# PROGRAM SCENARIOS + MATRIX — LIVE CONNECTIVITY PROOF (owner 2026-08-24)

**Owner word:** Coders (including Devin and Cascade) **run and complete the scenarios in Program**, **and the mapping (matrix)**, and prove each TEST transaction lands in the **correct tables, ledgers, columns, and modules**. That is how we authenticate **true connectivity and linkage**. Create labeled TEST / samples. **Void at launch** (CREATE-TEST-THEN-VOID). Never DELETE financial rows.

This is **not** a U14 recertify. Do **not** restamp CERTIFIED modules. Unique leftover hunt stays in force; this wave **adds** the Program hop/matrix proof.

**Complicated TESTs + every printable:** `docs/lockdown/COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF-2026-08-24.md` — truck breakdown → replacement unit on the same load, trailer swap, roadside A/P, parts receive, and letter-format invoices / proforma / dispatch / WO / 425C / cash-flow / finance.

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
| 6 | `hop.revenue` | Earn the revenue | `/accounting/invoices` | Event 1 JE **must post live** (DR Unbilled / CR Line-haul). Missing JE = FINDING |
| 7 | `hop.invoice` | Make the invoice | `/accounting/invoices` | `accounting.invoices` + lines; customer_id; load_id |
| 8 | `hop.gl` | Money in the books | `/accounting/journal-entries` | balanced `journal_entries` + postings; USMCA opco |
| 9 | `hop.bank` | Match the bank | `/banking/transactions` | payment apply; A/R down; bank match |

**OWNER 2026-08-24 15:16 CT — POSTING IS LIVE.** Every TMS posting flag / money write for **USMCA is ON**. A hop that skips the JE, invoice, bill, payment, settlement, or bank match is a **FINDING**, not “flag off.”

**The only flags that stay OFF in the entire app:** QuickBooks (no TMS→QBO write-back, no QBO sync campaign) and **Trucking / Transportation** entities (TRANSP / TRK). Do not turn those on. Do not post as those companies.

Empty TMS before you CREATE TEST is expected. After save, the ledger row must exist.

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
| `scenario.breakdown_relay` | `/maintenance/in-transit-issues` | Codex + Cursor + Cascade |
| `scenario.trailer_swap` | `/dispatch` | Codex |
| `scenario.roadside_ap` | `/accounting/bills` | CC-1 |
| `scenario.parts_receive` | `/inventory/purchases` | CC-3 |

**CC-2:** after hops exist, prove `/reports` `/cash-flow` `/finance` `/tasks` **read the same TESTs** and **Print letters** (not fake zeros). Form 425C print = court form — do not loop leftover `/425c` certify.

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
- **Posting miss:** save succeeded and USMCA posting is ON, but no JE / no invoice / no bill / no payment row

Not a finding: empty table **after** you created TEST and it persisted; U14 recertify noise; QBO/TRANSP/TRK still dark (that is correct).

OUTBOX one-liner:

```
SEAT | ACK | PROGRAM-SCENARIO-PROOF | NOW=/program | SHA=<healthz> | HOP=<key> | TABLE=<schema.table> | UUID=<id> | JE=<id> | FINDING=<id-or-none> | GO
```

---

## Law that still binds

- USMCA only. TRANSP/TRK flags OFF. QBO flags OFF. No TMS→QBO write-back.
- **All other posting flags ON.** TESTs must write real TMS books.
- U14 14/14 CERTIFIED — never restamp.
- CREATE-TEST-THEN-VOID — void at launch, not now.
- FAST-MERGE ~4 min. CC never `trigger_deploy`.
- RLS: do not treat Owner-unscoped 0 as absence; prove with opco + bypass discriminator when claiming “no row”.
