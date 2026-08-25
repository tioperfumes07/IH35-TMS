# NOW — ONE SOURCE (owner 2026-08-24 09:05 CT)

**12:42 CT GO — 25 items/seat · LIVE `80cf40e`.** Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1242.md`. CC-1 still 1–10 first. CC-2/CC-3 do not remake morning ACKs. Idle = defect. CC never `trigger_deploy`. U14 never restamp.

**12:14 CT GO — IDLE = DEFECT · LIVE `fb925ef`.** Same 30 items. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1214.md`. CC 429 ≠ HOLD. Hard-reload app. CC never `trigger_deploy`. U14 never restamp.

**11:39 CT GO — UNBLOCK · IDLE = DEFECT · LIVE `1c31518`.** Same 30 items. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1139.md`. Hard-reload app. Recurring CoA live (#15795). CC never `trigger_deploy`. U14 never restamp.

**10:38 CT GO — LIVE `69e60ff` · 30 numbered items.** Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1038.md`. Hard-reload app. Bill no./Ref no. top-right (#15764). Idle = defect. CC never `trigger_deploy`. U14 never restamp.

**09:40 CT GO — PROGRAM CENSUS LIVE `a80afec`.** Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-0940.md`. 28 cards: **20 Complete / 8 Merged**. Remaining: hop.assign · hop.bank probe · settlement · deductions · maintenance · accident · insurance · roadside_ap JE. CC-1 money serial still OPEN (invoice#=load# · cash-flow labels · JE `57cabbab`). Do not remake Complete. **Nobody `trigger_deploy`.** U14 never restamp.

**23:50 CT GO — FINISH PROGRAM SCENARIOS.** Live **`c6f70e3`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2350.md`. Reuse load `065538c8-…` (`L-20260824-0007`). Do **not** remake breakdown_relay / parts `45f36791` / BILL-2026-00015. **CC-1:** hop.bank then invoice#=load# + cash-flow labels + JE `57cabbab` then roadside_ap/ap/banking/factoring. **Codex:** trailer_swap + A7 diesel T-LIVE + settlement/advance/fuel. **CC-2:** same-TEST reports/cash-flow. **CC-3:** scenario.legal + WO print. Cascade/Devin-A walk FINDING only. **Nobody `trigger_deploy`.** U14 never restamp.

**23:32 CT GO — ALL SEATS WORK.** Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2332.md`. API deploy **IN FLIGHT** `dep-da6hl9p42hec73d5ai0g` tip `6c465b23`. Live still `41dfe49`. **CC never `trigger_deploy`.** Hard-reload when healthz moves. CC-1 hop 9 then invoice#=load# + proforma cash-flow + JE `57cabbab`. CC-2 unique leftover. CC-3 unique leftover (parts DONE). Codex trailer_swap/A7 after SHA. Cascade/Devin-A walk FINDING only. U14 never restamp.

**23:15 CT — seat ACKs.** CC-1 finishes hop 9 deposit (Undeposited Funds live) then invoice#=load# + cash-flow proforma labeled + JE `57cabbab`. CC-2 ACK: proforma cash-flow **not built** (honest); aging exclude PASS; next unique. CC-3 ACK: parts `45f36791` done — do not remake. Cursor shipped Samsara geofence outbox **#15710** `27a6b5ac` (not live until healthz moves). Do not steal hop 9 Chrome. Never `trigger_deploy`. U14 never restamp.

**22:34 CT OWNER RULING — cash flow MUST show proforma as Projected / Pre-invoice by delivery date. Invoice number = load number, never reminted on send.** Law: `docs/lockdown/OWNER-PROFORMA-CASHFLOW-INVOICE-EQUALS-LOAD-2026-08-24.md`. Live `20c02fd`. A/R aging still excludes proforma. 22:18 “exclude from forecast” is **void**. **CC-1:** `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` + `CASHFLOW-PROFORMA-PROJECTED-LABELED` + expense JE `57cabbab`. **Cursor:** BOOK-LOAD-NOOP. **CC-2:** prove cash-flow labels tonight. Never `trigger_deploy`. U14 never restamp.

**22:18 CT GO — SPINE NOT CLOSED.** Live then `9531b42`. Deploy later landed `20c02fd`. Split FIXERS vs TESTERS still in force.

**FIXERS:** Cursor = BOOK-LOAD-NOOP. CC-1 = invoice#=load# + cash-flow proforma **shown as Projected** + expense JE `57cabbab` + invoice Event-2. CC-3 = `parts_receive`. Codex = trailer/accident live + A7 diesel. Do not remake BILL-2026-00015 / Close / `/425c`.

**TESTERS:** Cascade + Devin-A hops 1–9. CC-2 prove `/cash-flow` **shows** Pre-invoice by delivery date **and** A/R aging **excludes** proforma. Program Now: must match Neon.

**21:57 CT GO — API live `d60fcd9` then immediately kicked `dep-da6g9cf10e5c73bkh760` tip `ab737d38` (insurance #15686 + SPA TS2322 #15687).** Hard-reload when healthz=`ab737d3`. SPA autoDeploy queued after web was `build_failed` on TS2322. **CC-1:** expense `57cabbab-…` still unposted JE. **CC-2:** next unique. **CC-3:** `parts_receive` on `850e2cc4-…`. Never `trigger_deploy`. U14 never restamp.

**19:39 CT GO — deploy `dep-da6e89v10e5c73bcsss0` IN FLIGHT (tip `a44357d8` #15662 in-process job catch-up).** Live until healthz moves = `1bfaaf2`. **CC-1:** still `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…` (status=posted, posting_status=unposted). **CC-2:** next unique; Q8 worker is multi-day, not idle-wait. **CC-3:** Bill `2153f5dc-…` already has `unit_id` (T-DEAD from that WO) + WO FK. Next `parts_receive` on `850e2cc4-…`. Transition still authorized. Never `trigger_deploy`. U14 never restamp.

**19:17 CT RULING — Kanban `@dnd-kit` drag failure in a seat tool is not a HOLD.** Advance TEST load `L-20260824-0007` via `PATCH /api/v1/dispatch/loads/:id/transition?operating_company_id=` (same LV-TXN-004 path as the board). Forbidden: mdata `/status` post-dispatch, SQL status writes. **CC-1:** still `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…`. Live `1bfaaf2`. Never `trigger_deploy`. U14 never restamp.

**19:13 CT GO — live `1bfaaf2`.** FK live. No second API deploy (no new API product commits). **CC-1:** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…` — reuse poster. **CC-2:** next unique; print battery done. **CC-3:** retry WO→Bill; prove `unit_id` after #15649 SPA. Never `trigger_deploy`. U14 never restamp.

**19:02 CT GO — deploy `dep-da6dmmvavr4c73et8hvg` IN FLIGHT (tip `1bfaaf26` = WO-bill FK #15642).** Live until then = `852b8e8`. **CC-1:** BILL-2026-00015 + JE already exist — hops 6–9, do not remake. **CC-2:** bind letters to that $185 bill now. **CC-3:** after SHA, retry WO→Bill; parts_receive. Cursor: `WO-CREATE-BILL-MODAL-DROPS-UNIT-PREFILL`. Never `trigger_deploy`. U14 never restamp.

**18:47 CT GO — deploy `dep-da6dg0u1egvs73b7i900` IN FLIGHT (tip `852b8e83` PRINT-F09).** Live until then = `e9c603e`. Hard-reload when healthz moves. **CC-1:** fix `WO-BILL-EXPENSE-CATEGORY-CROSS-ENTITY-FK` then roadside bill+JE on WO `850e2cc4-…` / load `L-20260824-0007`. **CC-2:** A3 is done; wait on that bill UUID for letter dollars — do not re-file A3. **CC-3:** parts_receive + WO print; Bill path is CC-1. Never `trigger_deploy` (Cursor only). U14 never restamp.

**17:45 CT GO — idle 45+ min is a defect. Do not wait.** Live last walked `7f20197`. Next 20 hops: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1740.md`. CREATE labeled TEST, name UUID + table + JE. Leftover unique ≠ Fully-Wired items 1–12. U14 never restamp.

**16:36 CT GO — seats are NOT waiting on Cursor merge.** Live `healthz` still `427f8ca`. Program hop routing (#15601) is on `main` (`b429ce00`) and **not live until version changes**. **Work anyway:** CREATE labeled TEST, name UUID + table + JE. **#15601 is leftover routing — not Fully-Wired items 1–12.** Full paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1636.md`. Idle = defect.

**This file is the only NOW.** Every session: `git pull --ff-only origin main` then this page + `INBOX-<SEAT>.md` TOP.

**THIS HOUR:** `docs/lockdown/PROGRAM-SCENARIO-MATRIX-CONNECTIVITY-PROOF-2026-08-24.md` + **`docs/lockdown/COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF-2026-08-24.md`**. Program hops + **breakdown/replacement-truck battery** + printable letters. **USMCA posting LIVE.** Only QBO + TRANSP/TRK flags stay OFF. Prove TESTs in real tables/JEs. Unique hunt still on. U14 never restamp. CREATE-TEST-THEN-VOID (void at launch).

**RUNBOOK:** `docs/lockdown/FINISH-ALL-MODULES-UNTIL-DONE-2026-08-24.md`  
**THE LIST:** `docs/lockdown/MODULE-CERTIFY-TRUTH-ONE-PAGE-2026-08-24.md`  
**LAW:** `docs/lockdown/CERTIFIED-MEANS-ZERO-UNIQUE-LEFTOVER-LAW-2026-08-24.md`  
**REMAINDER:** `docs/lockdown/LAUNCH-READY-UNIQUE-REMAINDER-2026-08-24.md`  
**FAST-MERGE 4 min ON · CONTINUOUS.** `docs/bus/FAST-MERGE-4MIN-LAW.md`

- **FULLY CERTIFIED (nothing pending):** U14 exclusive **14/14**. Nobody certifies them again.
- **NOT U14 CERTIFIED:** leftover POST leftover unique hop clean. Not a second exclusive campaign.
- **OWNER leftover POST CERTIFIED IMMEDIATE (not U14) @ `97d6a14` Live Chrome 09:05 CT:** cash-flow · finance · driver-hub · reports. Seats do not recertify.
- **leftover POST Live Chrome CERTIFIED (not U14) @ `97d6a14`:** also compliance · eld · inventory · fuel · users · home · help · tasks · program · system. `/docs` is the next line, not this SHA.
- **leftover POST Live Chrome CERTIFIED (not U14) @ `b47307e`:** `/docs` (entity tabs + Upload; #15371 #15372 #15373 live). `/425c` do not loop.
- **VOID as second CERTIFY:** WAVE 3/4 leftover stamps on already-U14 modules (customers/drivers/fleet/vendors/lists/legal/safety) and WAVE 2 maintenance.

If WAVE packs / PASTE / OUTBOX / Desktop INBOX still say leftover-CERTIFIED on a U14 module — **that line is void.**

Live SHA: `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version` (**re-curl**).

---

## Law still in force

- USMCA only. No TRANSP/TRK. No TMS→QBO write-back.
- U14 14/14 CERTIFIED. **Never restamp. Never recertify.**
- CERTIFIED ≠ leftover hop log ≠ Rule 24 `complete` ≠ matrix Box 4.
- Unique 500 / dead click / silent no-op. One small PR. CREATE-TEST-THEN-VOID.
- FAST-MERGE ~4 min. Never `gh pr checks --watch`. Deploy: Cursor, every **5–10 minutes AND 5–10 PRs**, one in-flight. CC never `trigger_deploy`.
- HOLD / idle / “no instructions” = defect.

---

## Chrome (one NOW per seat)

| Seat | Port | NOW | Role |
|------|------|-----|------|
| **Cursor** | **9222** | hops 1–9 E2E on one TEST load + matrix dispatch/customers | Lead. FAST-MERGE unique. Deploy cadence. |
| **CC-1** | **9223** | hops 6–9 + scenarios coa/ap/factoring/banking | Prove JE/invoice/bill/bank tables. Never `trigger_deploy`. |
| **CC-2** | **9224** | reports/cash-flow/tasks **read the same TESTs** | No fake $0. CREATE TEST if empty. |
| **CC-3** | **9225** | `/program` + matrix lists/legal + scenario.legal | Unique leftover chrome too. |
| **Codex** | **9226** | hops 2–5 + driver/fuel/safety/maint scenarios | Never restamp U14. |
| **Cascade** | audit | Full hop 1–9 + money matrix walk | FINDING if linkage miss. No product PRs. |
| **Devin-A** | audit | `/program` then `/customers` + hop.book | CREATE TEST. File FINDING. Not PARKED. |

Forbidden: remake Close / F6301 / fleet #15291–#15310 / fuel phantom #15335 / `/425c` loop.

---

## Superceded — do not take orders from

Any file that says leftover WAVE 3/4 leftover-CERTIFIED vendors/lists/legal/safety/customers/drivers/fleet, or that U14 is OPEN, or that leftover-6 / WAVE 2 is still a CERTIFY campaign.
