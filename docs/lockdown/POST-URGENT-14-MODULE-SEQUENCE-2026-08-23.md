# POST–URGENT 14 MODULE SEQUENCE (owner 2026-08-23)

**Owner (2026-08-23):** If a seat’s **own** Urgent-14 rows are all CERTIFIED, that seat **does not idle**. It starts this leftover sequence **now**, taking the first **unclaimed** row. Do not wait for Jorge. Do not watch INBOX.

Still-open Urgent-14 exclusive rows stay first **for that seat only**:
- Codex: customers → drivers → fleet (do not start leftover until those three CERTIFIED)
- CC-3: lists → legal (do not start leftover until those two CERTIFIED)

Same bar: Fully-Wired 1–12 + Live Chrome last. USMCA only. CREATE-TEST-THEN-VOID. Do not remake proven TESTs. Do not steal another seat’s prefix.

Canonical ids = `SIDEBAR_ITEM_IDS` in `apps/frontend/src/components/layout/sidebar-config.ts` (30 total).

**Correction (CC-3, 2026-08-23):** row 8 ELD is NOT a hidden stub — live-verified it is a fully real,
API-backed module (Live Duty Status, HOS Violations, Unidentified Driving, Driver Certifications, ELD
Settings all render live data). The "hidden stub" note below was stale; do not skip real hop testing on
it based on that assumption. Found+fixed a real defect there: TELEMATICS-F1 (see OUTBOX-CC-3).

---

## Sequence + current claim (one seat per row)

| Order | Module | Sidebar id | Route | Claim NOW |
|------:|--------|------------|-------|-----------|
| 1 | CASH FLOW | `cash-flow` | `/cash-flow` | **CC-1** |
| 2 | FINANCE HUB | `finance` | `/finance` | **CC-1** after cash-flow |
| 3 | DRIVER HUB | `driver-hub` | `/driver-hub` | **CC-2** when Codex SQL unique-empty (still help Codex 7–9 first) |
| 4 | 425C | `form_425` | `/425c` | **Cursor** |
| 5 | REPORTS | `reports` | `/reports` | **CC-2** (driver-hub unique-FINDING hunting empty; 2 fixes shipped, 3 modules' worth of chrome-law/create-void spot-checks clean, 2 items honestly logged open not blocking) |
| 6 | TASKS | `tasks` | `/tasks` | **CC-3** DONE -- unique-clean (no real defect found; Task Board/My Tasks/Calendar/Team Chat/Admin Report/Daily Tasks/Service Task Catalog all live, reverse link task->chat confirmed, required-field validation honest, picker_law N/A (assignee is identity.users, no catalog create-new concept) |
| 7 | COMPLIANCE | `compliance` | `/compliance` | **CC-3** DONE -- unique-clean (no real defect found) |
| 8 | ELD | `eld` | `/eld` | **CC-3** DONE -- all 5 sub-tabs hopped live (Live Duty Status/HOS Violations/Unidentified Driving/Driver Certifications/ELD Settings); found+fixed TELEMATICS-F1 (500 on Drill-down), merged `3126097ec`; the 2 "not wired yet" tabs are honest deferred-feature disclosures, not defects |
| 9 | INVENTORY | `inventory` | `/inventory` | **CC-3** DONE -- unique-clean (Parts & Stock/Assignments/Purchase History all live; Record Purchase forward-links vendor by name; Assignments honestly empty with a real explanatory note; Purchase History append-only with Void not delete; +Add-new-vendor first row confirmed; Escape closes dropdown-only) |
| 10 | USERS | `users` | `/users` | **CC-3** DONE -- found+fixed USERS-F1 (Change Role modal label mismatch); All/Active/Pending/Deactivated tabs all live, real data; Create User role select consistent |
| 11 | HOME | `home` | `/home` | **CC-3** DONE -- found+fixed DISPATCH-F2 (late-arrivals sample-data leak + count mismatch); Attention/KPI/Weekly-revenue/Work-orders/Fleet-Snapshot/Vendor-Mapping-Integrity/Filings-Compliance sections all live, real data |
| 12 | FUEL | `fuel` | `/fuel` | **CC-3** claiming now |
| 13 | DOCS | `docs` | `/docs` | next free |
| 14 | HELP | `help` | `/help` | next free |
| 15 | PROGRAM | `program` | `/program` | next free |
| 16 | SYSTEM | `system` | `/system` | next free |

Empty unique-FINDING on your claimed row → next **unclaimed** row in this table. Never idle. Never a 17th invented queue.

Forbidden prefixes while U14 OPEN: `/customers` `/drivers` `/fleet` `/lists` `/legal` (Codex / CC-3 only).
