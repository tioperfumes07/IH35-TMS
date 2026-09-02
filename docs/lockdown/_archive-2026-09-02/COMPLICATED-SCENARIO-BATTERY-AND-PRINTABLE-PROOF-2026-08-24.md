# COMPLICATED SCENARIO BATTERY + PRINTABLE FIDELITY (owner 2026-08-24)

**Not U14 recertify.** Do not restamp any of the 14 CERTIFIED modules. Unique leftover class only: 500 / dead click / silent no-op / reverse-empty / fake $0 / **missing JE after save** / **wrong table or missing FK** / **printable that is SPA chrome, 500, or off-letter**.

**Posting LIVE on USMCA.** Every money save must write the canonical row **and** a balanced JE. Only **QuickBooks** and **Trucking / Transportation (TRANSP / TRK)** flags stay OFF.

**CREATE TEST · VOID AT LAUNCH.** Empty TMS is expected. Do not DELETE financial rows.

Companion: `docs/lockdown/PROGRAM-SCENARIO-MATRIX-CONNECTIVITY-PROOF-2026-08-24.md` (hops 1–9 still required). Tracker identity: `apps/frontend/src/pages/program/scenario-tracker/registry.ts` + live probes `apps/backend/src/home/scenario-registry.ts`.

---

## Why this battery exists

Happy-path hops (book → bank) do not prove the operating system. The owner’s story is the **broken truck, replacement truck, same load**, plus drivers / units / trailers / diesel / bills / expenses / inventory / printables all talking to each other.

A TEST is proven only when you can name:

1. **UUID** of the load
2. **FK chain** (driver, dying unit, replacement unit, trailer, WO, bill, fuel, invoice)
3. **JE id** for every money hop
4. **Reverse click** from the other module back to the same UUID
5. **Print** of the document that hop produces (letter HTML, not the SPA shell)

---

## SCENARIO A — Breakdown + replacement truck (canonical owner story)

**Program key:** `scenario.breakdown_relay` → `/maintenance/in-transit-issues`

Label every TEST `TEST-BREAKDOWN-RELAY-2026-08-24`.

| Step | What you do (USMCA) | Canonical write | Must reverse-link |
|------|---------------------|-----------------|-------------------|
| A1 | Book labeled TEST load (customer + rate) | `mdata.loads` | customer, stops |
| A2 | Assign **driver D1**, **tractor T-DEAD**, **trailer TR-1** | load FKs + `dispatch.load_assignment_history` | driver / unit / trailer detail show the load |
| A3 | Dispatch / in transit | load status in-transit | dispatch board |
| A4 | Open **in-transit issue** (breakdown) on this load + T-DEAD | `dispatch.intransit_issues` (`load_id`, `unit_id`, `driver_id`) | load drawer shows the issue |
| A5 | Promote issue → **work order** | `maintenance.work_orders`; issue `promoted_to_wo_id` | WO shows load + unit T-DEAD |
| A6 | **Relay:** assign replacement tractor **T-LIVE** to the **same load** (T-DEAD stays on the WO) | `load_assignment_history.previous_unit_id` ≠ `new_unit_id`; load `assigned_unit_id` = T-LIVE | both units’ history show the load |
| A7 | Diesel on **T-LIVE** tagged to the load | `fuel.fuel_transactions.load_id` | fuel row → load → unit T-LIVE |
| A8 | Roadside tow/shop **bill** on the WO | `accounting.bills` TMS-native (`qbo_bill_id IS NULL`) + `linked_work_order_uuid` | bill → WO → issue → load; **JE posts** |
| A9 | Accessorial / extra miles on the load if detention/tow delay | proforma/invoice lines | invoice `load_id` + `customer_id` |
| A10 | Deliver + POD/BOL → revenue JE → invoice → GL → bank match | hops 4–9 | same load UUID everywhere |
| A11 | Driver settlement includes this load; roadside not paid as driver pay | `driver_finance.driver_settlements` | settlement lines → load |

**Probe (tracker green):** in-transit issue with `promoted_to_wo_id` **and** assignment history unit swap on the same `load_id`.

**FINDING if:** replacement unit overwrites T-DEAD off the WO; bill has no load/WO FK; fuel lands on T-DEAD after relay; invoice missing; save with no JE.

---

## SCENARIO B — Trailer hook / drop (same load)

**Program key:** `scenario.trailer_swap` → `/dispatch`

Keep customer + load number. Drop TR-1, hook TR-2 mid-route. History must keep **both** trailer ids. IFTA/miles stay on the load, not “a new load.”

---

## SCENARIO C — Roadside A/P (tow / shop)

**Program key:** `scenario.roadside_ap` → `/accounting/bills`

Vendor bill from the in-transit WO. **QBO-imported bills do not count.** JE required.

---

## SCENARIO D — Receive parts onto a WO

**Program key:** `scenario.parts_receive` → `/inventory/purchases`

Receive qty into `maintenance.parts_purchases` (on-hand upsert on `parts_inventory`). Optional consume on the breakdown WO. If parts GL flag is ON, JE must exist; if OFF, say UNVERIFIED flag — do not invent GL math.

---

## Other complicated TESTs (existing Program cards — still run)

Use the same load family (`TEST-BREAKDOWN-RELAY-…`) when the hop applies:

| Key | Complicated twist |
|-----|-------------------|
| `scenario.advance` | Cash advance to D1 while T-DEAD is down |
| `scenario.deductions` | Deductible / damage only if accident path; else skip |
| `scenario.accident` + `scenario.insurance` | If the breakdown is an accident, not mechanical — do not fake an accident |
| `scenario.settlement` | Pay D1 for miles after relay; do not pay T-DEAD’s shop bill as wages |
| `scenario.fuel` | Gallons on T-LIVE + load_id |
| `scenario.factoring` | After official invoice (not proforma) |
| `scenario.banking` | Match customer receipt **and** vendor bill payment |

---

## Printable / report letter law

**Architecture:** TMS letter HTML uses `wrapPdfDocument` + `PDF_BASE_STYLES` (letterhead, Inter, numeric tables). SPA `window.print()` on a page with the sidebar is a FINDING.

**Operator print** uses `openPrintableDocument` (`?print=1`) for canonical `.html` routes.

### Inventory (open each after the TEST exists — CREATE if empty)

| Document | How to open | Spec / chrome | Seat |
|----------|-------------|----------------|------|
| Invoice | Invoice detail → Print → `/api/v1/accounting/invoices/:id.html` | wrapPdfDocument letter | CC-1 |
| Pre-invoice / proforma | Same invoice route while status `proforma` — watermark/status must say proforma, **must not** age into A/R | ND-INV-01 | CC-1 |
| Bill | `/api/v1/accounting/bills/:id.html` | letter | CC-1 |
| Bill payment | `/api/v1/accounting/bill-payments/:id.html` | letter | CC-1 |
| Dispatch sheet | Load drawer → dispatch-sheet.html | letter; driver/unit/trailer/stops = live load | Codex + Cursor |
| Load / rate confirmation | Customer rate-con **file** on the load + factoring package cover | package must not be SPA chrome; missing rate-con after CREATE = FINDING | Codex |
| Work order | WO detail → Print WO PDF → `/api/v1/work-orders/:id/pdf` | must use letter CSS (`PDF_BASE_STYLES`); Print must not print the SPA shell | CC-3 + Codex |
| Settlement | `/api/v1/driver-finance/settlements/:id.html` | letter | Codex |
| Cash advance receipt | `printLetterHtml` | letter window, not SPA | Codex |
| Expense | expense detail print | letter | CC-1 |
| A/R aging, A/P aging, P&L, BS, TB | report Print → `printLetterHtml` | letter; **same TEST dollars**, never fake $0 | CC-2 |
| Cash flow statement + overview | `/cash-flow` Print | letter; same TESTs | CC-2 |
| Finance statements package | `/finance` Print | letter | CC-2 + Cascade |
| Profit per truck / customer profitability | reports Print | letter; T-LIVE vs T-DEAD must not double-count the load | CC-2 |
| Fuel reconciliation | `/fuel` reports Print | letter; load-tagged diesel | Codex |
| Form 425C | `/425c` official print (`buildPrintHTML` / court caption) | **court form**, not TMS invoice letter — still must not print SPA chrome; do not loop leftover `/425c` certify | CC-2 (format only) |
| 425C exhibits | exhibits Print | letter helper | CC-2 |
| Property allocation (TX BPP rendition) | compliance filings / business-property-allocation | CREATE TEST rendition if empty; print must be the form, not empty SPA | CC-3 |
| Tasks | `/tasks` — print if the surface has Print; else FINDING only if Print exists and is dead | not a second certify of leftover-POST tasks | CC-2 |
| Receive inventory | `/inventory/purchases` — print receipt if control exists; else file unique FINDING for **missing print** only if blueprint requires a receive ticket | CC-3 |

**FINDING examples:** Print opens app chrome; 500 on `.html`; invoice letter missing load # after relay; dispatch sheet still shows T-DEAD after replacement assign; WO PDF without company legal name; cash-flow print $0 while JE exists; Form 425C print-day instead of filed date (already guarded — don’t weaken).

Do **not** invent a new leftover certify campaign around `/425c`. Format-check the printable, then leave.

---

## Seat NOW (this battery)

| Seat | Port | Complicated + print |
|------|------|---------------------|
| Cursor | 9222 | Hops 1–9 on **one** breakdown-relay load + matrix dispatch/customers + dispatch-sheet print |
| CC-1 | 9223 | A8–A11 money + invoice/bill/proforma letters + GL |
| CC-2 | 9224 | Reports/cash-flow/finance/425C **print** bound to those TESTs |
| CC-3 | 9225 | WO + inventory receive + property allocation print; lists/legal unique leftover |
| Codex | 9226 | A2–A7 + trailer swap + fuel + settlement print |
| Cascade | audit | Full A1–A11 + money matrix; FINDING on missing JE/FK |
| Devin-A | audit | Customer + hop.book on the same TEST family; A/R not counting proforma |

OUTBOX:

```
SEAT | ACK | COMPLICATED-BATTERY | NOW=/program | SHA=<healthz> | KEY=scenario.breakdown_relay | LOAD=<uuid> | UNIT_DEAD=<id> | UNIT_LIVE=<id> | WO=<id> | BILL=<id> | JE=<id> | PRINT=<doc> | FINDING=<id-or-none> | GO
```
