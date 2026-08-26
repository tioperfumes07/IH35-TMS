# PASTE ALL SEATS — GO NOW (2026-08-24 17:45 CT)

Idle 45+ min = defect. **Do not wait on Cursor.** Re-wake: copy YOUR 20 hops from this file (or Cursor chat paste). Live SHA: `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version` (last walked **`7f20197`**). Main is ahead. If SHA changes: hard reload, re-walk, unique FINDING only if still broken **on the new SHA**.

CURRENT-LAW: leftover unique only (500 / dead / silent). U14 14/14 CERTIFIED — never recertify. USMCA posting LIVE; QBO + TRANSP/TRK OFF. FAST-MERGE ~4 min. Deploy 5–10 min AND 5–10 PRs, one in-flight. CC never `trigger_deploy`. CREATE-TEST-THEN-VOID. Not Fully-Wired 1–12.

Open leftovers on `7f20197` (Cursor shipping): `BOOK-LOAD-CUSTOMER-AUTOCOMPLETE-EMPTY` · `CREATE-INVOICE-MENU-API-400` · `COMPLICATED-PRINT-F09` (printable 400 missing `operating_company_id`). Do not restamp PASS hops from Cascade’s 7f20197 walk.

Shared first 4 (every seat): (1) curl healthz (2) hard reload (3) `/program` STALE? (4) ACK OUTBOX then run 1–20. Do not stop after #1.

OUTBOX: `SEAT | ACK | IDLE-WAKE-1740 | NOW=<url> | SHA=<healthz> | HOP=<n> | UUID=<id-or-none> | FINDING=<id-or-none> | GO`

---

## Devin-A (20)

1. Curl healthz. SHA in ACK.
2. Hard reload.
3. `/program` — STALE? unique FINDING with source name. Else continue.
4. Open hop.book `/dispatch/book-load?book_load=1`.
5. Type `TEST-CASCADE` in Customer. If empty → FINDING `BOOK-LOAD-CUSTOMER-AUTOCOMPLETE-EMPTY` (already filed; update SHA only if still empty after new SHA).
6. If picker empty: `/customers?create=1` — do not idle on page `+ Create`.
7. Reuse `TEST-CASCADE-CUSTOMER-20260824-vp1oyj` `/customers/8327b3cb-b400-44c9-ab0e-1306f74537db` if still there.
8. Select customer + rate → Save draft. Name load UUID + `mdata.loads`.
9. If Save blocked on Customer: FINDING with typed string + SHA. Nothing invented.
10. `/accounting/invoices?create=1` (Topbar Create → Invoice).
11. If `GET /api/v1/accounting/invoices?limit=1` 400 Invalid UUID: FINDING `CREATE-INVOICE-MENU-API-400` SHA-stamped.
12. If drawer opens: CREATE labeled TEST invoice. UUID + `accounting.invoices`.
13. Print that invoice. Letter HTML = pass. SPA chrome or 400 = FINDING `COMPLICATED-PRINT-F09`.
14. Fake id `/invoices/1.html` 400 is expected. Only real UUID counts.
15. `/dispatch` assign if you booked a load. FINDING if silent.
16. Matrix `?module=customers` — unique 500/dead only.
17. File board + OUTBOX same turn. No product PR. No U14 restamp.
18. If SHA still `7f20197` and picker empty: do not wait — keep CREATE TEST on `?create=1` and next hop.
19. When SHA ≠ `7f20197`: hard reload, re-prove hops 4–13 before new FINDING.
20. Next ACK: hop.assign on the TEST load. Never idle.

## Cascade (20)

1. Curl healthz.
2. Hard reload.
3. `/program` tracker snapshot (STALE + 9 hops + 4 battery cards).
4. Re-walk hop.book — form present vs Dispatch 522-char empty.
5. Re-walk hops 2–5 `/dispatch` (assign / in-transit / deliver / POD).
6. Re-walk hops 6–9 invoices / JE / banking.
7. Battery: `/dispatch/in-transit-issues` (F08 was FIXED on 7f20197 — only reopen if generic Maintenance again).
8. `scenario.trailer_swap` `/dispatch`.
9. `scenario.roadside_ap` `/accounting/bills`.
10. `scenario.parts_receive` `/inventory/purchases`.
11. Matrix accounting/banking/factoring/settlements — F10 was FIXED; reopen only if last-10-PRs h1 returns.
12. Printable: real invoice UUID `.html` (not `1`).
13. Real bill UUID `.html`.
14. Real WO UUID `/pdf`.
15. 400 `operating_company_id undefined` = `COMPLICATED-PRINT-F09` still OPEN. SPA-steal gone is not enough.
16. File FINDING-UPDATE with SHA + UUID. No product PR.
17. Do not recertify U14. Do not claim Fully-Wired 1–12.
18. If Book Load customer search still empty: FINDING-UPDATE Devin’s picker finding, do not invent a second id.
19. When SHA moves: full 9-hop + battery + print table in one OUTBOX.
20. Next: same TEST-CASCADE customer + load family. Never idle.

## CC-1 · 9223 (20)

1. Curl healthz. Never `trigger_deploy`.
2. Hard reload.
3. `/accounting/invoices?create=1` — if 400 Invalid UUID, FAST-MERGE unique (Cursor also shipping).
4. CREATE labeled TEST invoice if drawer works. UUID + `accounting.invoices`.
5. Print invoice letter `.html` with company or after Cursor print fix.
6. `/accounting/bills` CREATE TEST TMS-native bill (not QBO clone).
7. Link bill to a WO if one exists (`linked_work_order_uuid`).
8. Prove balanced JE in `accounting.journal_entries` + postings. Missing JE after save = FINDING.
9. `/accounting/journal-entries` — hop.gl.
10. `/banking/transactions` — hop.bank. Match must move A/R or A/P.
11. Proforma must not count as Open A/R.
12. Matrix `?module=accounting`.
13. Matrix `?module=banking`.
14. Matrix `?module=factoring`.
15. `scenario.roadside_ap` tow/shop bill on breakdown WO.
16. Print bill letter with real UUID.
17. Spine leftover: invoice/bill/payment/expense void `await emitAccountingSpineEvent` if still unique on your files — one small PR.
18. Never `/425c`. Never QBO write-back. Never TRANSP/TRK.
19. FAST-MERGE on unique money leftover only. Guard + Claude-green.
20. OUTBOX UUID + JE ids. Next hop. Never idle.

## CC-2 · 9224 (20)

1. Curl healthz. Never `trigger_deploy`.
2. Hard reload.
3. `/reports` — unique 500/dead/silent/fake $0 only.
4. Print a report letter (wrapPdfDocument / printLetterHtml), not SPA chrome.
5. `/cash-flow` — same TEST dollars as CC-1 invoice/bill.
6. Print cash-flow letter.
7. `/finance` — bind same TESTs.
8. Print finance letter.
9. Aging — fake $0 = FINDING.
10. P&L — bind TESTs or CREATE TEST then print.
11. `/tasks` unique leftover only. No TASK-F6360 remake.
12. Form 425C = court form. Do not loop leftover `/425c` certify.
13. Matrix `?module=reports`.
14. Matrix `?module=settlements` if dollars exist.
15. File unique FINDING if print is SPA or empty letter.
16. Never remake Close.
17. Never restamp U14 cash-flow/finance/reports Live Chrome.
18. FAST-MERGE unique only.
19. OUTBOX: report URL + UUID + FINDING or none.
20. Next leftover unique. Never idle.

## CC-3 · 9225 (20)

1. Curl healthz. Never `trigger_deploy`.
2. Hard reload.
3. `/dispatch/in-transit-issues` — table present? If generic Maintenance = F08 reopen.
4. CREATE TEST in-transit issue on a load if empty.
5. Promote to WO. UUID + `maintenance.work_orders`.
6. Print WO `/pdf` with real UUID. 400 missing company = F09 (Cursor shipping).
7. `scenario.parts_receive` `/inventory/purchases` — receive parts onto that WO.
8. Property allocation printable if the surface exists.
9. Matrix `?module=lists`.
10. Matrix `?module=legal`.
11. Scenario legal unique leftover only.
12. `/help` unique 500/dead only.
13. `/system` unique only.
14. `/inventory` unique only.
15. `/users` unique only.
16. `/docs` unique only.
17. `/home` unique only.
18. Never remake roadside / CLASS-F5973. Never restamp U14.
19. FAST-MERGE unique chrome only.
20. OUTBOX WO + parts UUID. Never idle.

## Codex · 9226 (20)

1. Curl healthz. Never `trigger_deploy`.
2. Hard reload.
3. Hop.assign `/dispatch` on any TEST load (or wait one Devin books).
4. Hop.dispatch in-transit.
5. Hop.deliver.
6. Hop.pod_bol evidence.
7. Print dispatch sheet letter (not SPA).
8. `scenario.breakdown_relay` T-DEAD ≠ T-LIVE on same load.
9. Prove assignment history unit swap.
10. `scenario.trailer_swap`.
11. Fuel row on that load going-forward only — never invent historical load FK.
12. Settlement/fuel must JE (posting LIVE). Missing JE = FINDING.
13. Matrix `?module=drivers`.
14. Matrix `?module=fleet`.
15. Matrix `?module=safety`.
16. Matrix `?module=fuel`.
17. Unique 500/dead/silent FAST-MERGE. Never remake CLASS-F5973.
18. Never restamp U14 customers/drivers/fleet.
19. OUTBOX LOAD + UNIT_DEAD + UNIT_LIVE + WO.
20. Next hop 2–5. Never idle.
