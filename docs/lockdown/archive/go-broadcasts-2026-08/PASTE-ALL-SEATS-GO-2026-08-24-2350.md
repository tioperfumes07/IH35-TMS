# PASTE ALL SEATS — GO 2026-08-24 23:50 CT

Owner: continue. **Finish the Program scenarios.** Hard-reload live SHA **`c6f70e3`**.

**Deploy:** API **LIVE** `c6f70e3` (`dep-da6hscn10e5c73bpkesg` landed #15713/#15714). **Nobody `trigger_deploy`.** Do not second-kick.

**U14 14/14 CERTIFIED. Never restamp.** CREATE-TEST-THEN-VOID. Idle = defect.

**One TEST family — reuse, do not remake:**
- Load `065538c8-af72-4dfd-9929-6ee71d8eb7f5` (`L-20260824-0007`)
- Customer `55baee26-…` CC3 TEST Customer 20260822-1054
- T-DEAD `bb1e77ab-…` · T-LIVE `1a3c98da-…`
- WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`
- Parts purchase `45f36791-8f34-4705-9a32-34131d82a509` **DONE**
- Expense `57cabbab-…` still needs JE (CC-1)
- Kanban = `PATCH /api/v1/dispatch/loads/:id/transition?operating_company_id=`

**Already LIVE — do not remake:** `scenario.breakdown_relay` (#15713/#15714) · `scenario.parts_receive` · BILL-2026-00015 · hop 6 JE `e2246f9f-…` on this load.

**Geofence new Book Load:** `PCMILER_ENABLED` is OFF (`/geocoding/search` `enabled:false`). Cursor lead — not a seat stop.

| Seat | Port | NOW (finish these Program cards) | Do not |
|------|------|----------------------------------|--------|
| **CC-1** | 9223 | Serial money on **this load**: (1) `hop.bank` deposit (2) `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` (3) `CASHFLOW-PROFORMA-PROJECTED-LABELED` (4) JE `57cabbab` (5) Event-2 A/R. Then Program: `scenario.roadside_ap` (prove existing TMS bill+JE, do not remake BILL-2026-00015) · `scenario.ap` · `scenario.banking` · `scenario.factoring` (after official invoice, not proforma) · `scenario.escrow` if still `--`. | `/425c` · remake parts · `trigger_deploy` |
| **CC-2** | 9224 | Prove `/reports` `/cash-flow` `/finance` `/tasks` **read the same TESTs**. Print letters. Unique leftover meanwhile. Re-walk `/cash-flow` **after** CC-1 labels. | remake hop 9 · parts · Close · `/425c` loop |
| **CC-3** | 9225 | `scenario.legal` CREATE labeled TEST matter if `--`. Matrix `?module=lists` `?module=legal`. WO print letter (not SPA). Next unique leftover. | remake parts `45f36791` · CLASS-F5973 · bill `2153f5dc` |
| **Codex** | 9226 | **Finish ops scenarios on this load:** `scenario.trailer_swap` (history keeps both trailers) · A7 `scenario.fuel` diesel on **T-LIVE** + `load_id` · hops 2–5 if card `--` · then `scenario.settlement` `scenario.advance` `scenario.driver_onboarding` (prove, do not remake roster) · `scenario.accident`/`scenario.insurance` **only if true accident — do not fake**. Print dispatch sheet after swap. Unique FINDING if card `--`. | `trigger_deploy` · U14 restamp · remake breakdown |
| **Cascade** | audit | `/program` hard-reload `c6f70e3`. Walk hops 1–9 + remaining `--` cards. FINDING only. | product PR · U14 restamp |
| **Devin-A** | audit | `hop.book` + `scenario.customer`. Not PARKED. FINDING if Book Load silent (PCMILER off ≠ silent POST). | product PR · U14 restamp |
| **Cursor** | 9222 | Lead. Do **not** steal hop 9. PCMILER/geofence owner-gated. FAST-MERGE unique leftover if found. | second-kick · remake closed TESTs |

Law: `docs/lockdown/PROGRAM-SCENARIO-MATRIX-CONNECTIVITY-PROOF-2026-08-24.md` + `docs/lockdown/COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF-2026-08-24.md`.

OUTBOX: `SEAT | ACK | GO-2350 | PORT=n | SHA=c6f70e3 | KEY=<scenario-or-hop> | UUID=<id> | JE=<id-or-none> | FINDING=<id-or-none> | GO`
