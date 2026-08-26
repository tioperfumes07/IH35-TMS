# GO-2237 — 22:37 CT — 35 INSTRUCTIONS PER SEAT — IDLE = DEFECT

Owner: **no seat waits for the next order.** This paste is **35 numbered hops per seat** (CC-1, CC-2, CC-3, Codex, Cascade, Devin-A, Cursor). ACK in OUTBOX this turn, then **work item 1 of YOUR list** (or the first not grep-closed). Empty inbox / “awaiting instructions” after this file exists = **you did not open INBOX TOP**.

CURRENT-LAW
- USMCA only · no TRANSP/TRK · no TMS→QBO write-back
- U14 **14/14 CERTIFIED** · never restamp · never recertify
- CREATE-TEST-THEN-VOID · empty TMS expected · labeled TEST is the hop
- FAST-MERGE ~4 min · never `gh pr checks --watch` · **CC never `trigger_deploy`**
- Skip **#15546**. Fully-Wired 1–12 + Live Chrome = launch, not Box 4
- Hunt method: `docs/lockdown/DEEP-DIVE-UNIQUE-HUNT-CODER-INSTRUCTIONS-2026-08-24.md`
- Program hops + matrix: `docs/lockdown/PROGRAM-SCENARIO-MATRIX-CONNECTIVITY-PROOF-2026-08-24.md`

FACT (re-curl yourself)
- Live API `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`b711699`** at GO kick (hard-reload USMCA). SPA already auto-deployed later FE including **#16002** list chrome + 2290 Back.
- **Do not remake:** `#15916` `#15921` `#15925` `#15928` `#15931` `#15933` `#15941` `#15947` `#15954` `#15955` `#15957` `#15960` `#15988` `#16000` `#16002`
- Grep before coding: `from-load.ts` `const displayId = loadNumber` · cash-flow `Proforma / Pre-invoice` · `BookLoadModalV4` `properPersonOrPlaceName` · ParityTable gear `changePageSize(next)`
- Reuse load `065538c8-…` (`L-20260824-0007`), T-LIVE, WO `850e2cc4-…` when the hop is Program. Do **not** remake Complete / Close / `/425c` loop / BILL-2026-00015 / parts `45f36791`

Grep-verify every board id on `origin/main` before building. Stale OPEN = skip, **next number same turn**. Unique FINDING only = **500 / dead click / silent no-op / reverse-empty / fake $0**. File board + OUTBOX same turn.

ACK: `SEAT | ACK | GO-2237 | PORT=n | NOW=<your list #n> | SHA=<healthz> | GO`

---

## CC-1 · 9223 · MONEY · 35 serial (clone, not `IH35-TMS-clean`)

Never `/425c`. Never `trigger_deploy`. Reuse poster. **No new GL math.** Flags as locked. Money clone.

1. **SKIP-IF-MAIN** `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` — grep `const displayId = loadNumber`. If present, do not remake #15941.
2. **SKIP-IF-MAIN** `CASHFLOW-PROFORMA-PROJECTED-LABELED` — grep Proforma / Pre-invoice. If present, do not remake #15947.
3. **NOW** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` — expense `57cabbab-f06a-4fa3-ad67-877eb2e64b0f` (`status=posted`, `posting_status=unposted`). Call existing poster. Prove JE + postings USMCA.
4. **FIX** `hop.bank` probe honesty — Program `matched_invoice_id` vs Neon recon + `matched_transfer_id`.
5. **FIX** `scenario.roadside_ap` JE on existing **TMS-native** WO bill (QBO clones do not count).
6. **FIX** `WO-AUTO-BILL-NEVER-POSTS-GL-JE` — `autoCreateBillFromWO` must call `postBillGlIfEnabled` (same as manual bill). Do not remake Bill `2273abf7`. Unblocks CC-3 WO complete.
7. **FIX** `LV-PAY-SETTLE-NOPOST` / `scenario.settlement` — paid settlement + posted pay-run JE. Never remake advances.
8. **FIX** `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS` — rate card × shortest miles, never customer rate. Codex proves UI only.
9. **SCENARIO** Print invoice / bill / expense letters — `wrapPdfDocument`, not SPA chrome.
10. **SCENARIO** Official invoice → vendor bill payment on roadside bill; factoring **only** on official invoice.
11. **FIX** `CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS` — same-transaction outbox + owner consumer; do not throw post-commit.
12. **FIX** `BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN` — all three cash-flow/report readers; hidden accounts must not leak into totals.
13. **FIX** `INVOICE-SENT-WITHOUT-AR-RECOGNITION-JE` if still true on USMCA.
14. **FIX** `CUST-MONEY-F6105` payment unapply dead route if still OPEN.
15. **FIX** `CUST-MONEY-F6312` statements / recurring / late fees — canonical invoices+payments only; no invented late-fee $.
16. **FIX** `DRV-MONEY-F6083` earnings GET failure masquerading as $0 if still OPEN.
17. **FIX** `DRV-MONEY-F6106` payment-methods GET failure false-empty if still OPEN.
18. **FIX** `DRV-MONEY-F6110` driver-hub financial feeds fail-as-zero if still OPEN.
19. **FIX** `FLEET-MONEY-F6113` unit trip-cost caller company vs membership if still OPEN.
20. **FIX** `FLEET-MONEY-F6304` unit asset-cost unused param silent fallback if still OPEN.
21. **FIX** `ACCT-F6284` bank tx split JSON memo leak to UI if still OPEN.
22. **WIRE** Manual daily cash projections persist + history — canonical table, opco RLS, FKs vendor/customer/driver/bill/expense/payment; real USMCA bank balances; auto TMS expenses **plus** operator bills/payments/CC. Flag stays OFF until owner says turn on.
23. **HUNT** `/accounting` unique 500/dead/silent/fake-$0 (one PR).
24. **HUNT** `/banking` unique leftover (one PR) — TEST expense → match → reconcile → ledger. Void-at-launch labeled.
25. **HUNT** `/factoring` unique leftover (one PR) — secured borrowing; **do not** create/reclassify reserve accounts (Rule 19).
26. **HUNT** `/settlements` unique leftover (one PR) — mint stays this seat.
27. **HUNT** `/vendors` money unique leftover (one PR).
28. **HUNT** `/customers` money tabs unique leftover after F6312 (one PR).
29. **PROVE** subledger→GL **forward-only** (no historical backfill). New docs only.
30. **PROVE** void = reversing JE by **UUID**, never display_id.
31. **PROVE** escrow is liability, not income. Named TEST or FINDING.
32. **PROVE** factoring is secured borrowing, not a sale. Named TEST or FINDING.
33. **PROVE** bill payment reduces Open A/P reverse on vendor + bill.
34. **PROVE** customer payment reduces Open A/R reverse on customer + invoice.
35. **HUNT** next unique money 500/dead/silent anywhere in accounting/banking/factoring/settlements not already listed.

---

## CC-2 · 9224 · leftover POST · 35 (reports / cash-flow / finance / tasks)

Do **not** remake #15921 #15947 #16002. Never Close remake. Do not loop `/425c`. Never `trigger_deploy`.

1. **NOW LIVE-WALK** `/cash-flow` on current healthz: Daily Prediction **Proforma / Pre-invoice**, AvP `basis: Proforma`, forecast `other`. HUNT-PASS or unique FINDING.
2. **HUNT** `/cash-flow` unique 500/dead/silent/fake-$0 (one PR).
3. **HUNT** `/cash-flow` Manual Daily Projections tab — persist/history completeness vs CC-1 #22 (Live Chrome after merge; do not invent GL).
4. **HUNT** `/reports` hub unique leftover (one PR).
5. **HUNT** `/reports` IFTA unique leftover (one PR).
6. **HUNT** `/reports` fuel recon unique leftover (one PR).
7. **HUNT** `/reports` settlement-summary leftover unique (do not remake load_count).
8. **HUNT** `/reports` A/R aging unique leftover — still **excludes** proforma (law).
9. **HUNT** `/reports` A/P aging unique leftover (one PR).
10. **HUNT** `/reports` P&L unique leftover (one PR).
11. **HUNT** `/reports` Balance Sheet unique leftover (one PR).
12. **HUNT** `/reports` Trial Balance unique leftover (one PR).
13. **HUNT** `/reports` profit-per-truck unique leftover (one PR).
14. **HUNT** `/reports` customer profitability unique leftover (one PR).
15. **HUNT** `/reports` trip-profitability unique leftover — do not remake #15921.
16. **HUNT** `/finance` unique leftover (one PR) — flag-off hub is **not** a FINDING.
17. **HUNT** `/finance` break-even vs Desktop workbook — unique 500/dead only (Cursor owns Excel export if net-new).
18. **HUNT** `/finance` calculator / loan-wizard unique leftover (one PR).
19. **HUNT** `/tasks` unique leftover (one PR).
20. **HUNT** `/reports` print letter unique leftover (one PR).
21. **HUNT** `/cash-flow` print letter unique leftover (one PR).
22. **HUNT** `/finance` print package unique leftover (one PR).
23. **HUNT** reports `runner.*` / `LINK-F5170` if still true (one unique PR).
24. **HUNT** `/reports` categories catalog hardcoded vs Neon if still true (one PR).
25. **SCENARIO** Prove `/tasks` reads TESTs on load `065538c8-…` (HUNT-PASS or FINDING).
26. **SCENARIO** Prove `/finance` reads same TEST dollars (HUNT-PASS or FINDING).
27. **SCENARIO** Prove `/cash-flow` 7-day strip uses last delivery stop, skips cancelled (HUNT-PASS or FINDING).
28. **HUNT** Company Overview P&L `/reports/management` unique leftover (one PR) — do not void 6210 TEST yourself (CC-1 data).
29. **HUNT** `/reports` cash flow statement vs `/cash-flow` page unique leftover (one PR).
30. **HUNT** next unique `/cash-flow` tab after 2–3.
31. **HUNT** next unique `/reports` tab after 4–15.
32. **HUNT** next unique `/tasks` action after 19.
33. **HUNT** next unique `/finance` leaf after 16–18.
34. **LIVE** QBO list chrome on **reports/finance lists only** — if search/range/gear still wrong **after #16002**, unique FINDING (do not remake ParityTable).
35. **HUNT** next unique leftover POST 500/dead/silent on your URLs.

---

## CC-3 · 9225 · lists / legal / leftover chrome · 35

Do **not** remake #15933 #16000 #16002. Never steal CC-1 money. Never `trigger_deploy`. `#64` WO complete waits CC-1 item 6.

1. **NOW HUNT** `/program` matrix `lists` + `legal` cells — unique leftover only.
2. **HUNT** `/lists` unique 500/dead/silent (one PR).
3. **HUNT** `/lists` second unique catalog (one PR).
4. **HUNT** `/lists` third unique catalog (one PR).
5. **HUNT** `/legal` unique leftover (one PR) — do not remake Complete.
6. **HUNT** `/legal` second unique leftover (one PR).
7. **HUNT** `/legal` matters deadlines / SOL unique leftover (one PR).
8. **FIX** `CUST-CRM-F6313` if still OPEN — CRM persist, not chrome-only.
9. **HUNT** `/help` unique leftover (one PR).
10. **HUNT** `/help` second unique tab.
11. **HUNT** `/system` unique leftover (one PR).
12. **HUNT** `/system` second unique tab.
13. **HUNT** `/inventory` unique leftover (one PR) — void-not-delete; do not remake #13931.
14. **HUNT** `/inventory` second unique tab / parts receive reverse.
15. **HUNT** `/users` unique leftover (one PR).
16. **HUNT** `/users` second unique tab.
17. **HUNT** `/docs` unique leftover (one PR) — grep DOCS-F6072 before remaking.
18. **HUNT** `/docs` second unique tab / upload.
19. **HUNT** `/home` unique leftover (one PR).
20. **HUNT** `/home` second unique tile/action.
21. **HUNT** `/program` unique leftover chrome (one PR) — no U14 restamp.
22. **SCENARIO** WO `850e2cc4` → `complete` **only after** CC-1 #6 JE (enum has no `closed`). Until then: unique FINDING elsewhere, do not idle.
23. **SCENARIO** WO print `/api/v1/work-orders/:id/pdf` if not proven.
24. **SCENARIO** `scenario.parts_receive` unique leftover only — do not remake `45f36791`.
25. **SCENARIO** `scenario.legal` unique leftover on `/legal/matters`.
26. **HUNT** remaining underscore / raw-enum comboboxes **outside** files already guarded this session (one PR).
27. **HUNT** `/lists` chart-of-accounts picker `+ Add new` first-row unique leftover (one PR).
28. **HUNT** `/inventory` vendor historical label unique leftover (one PR).
29. **FIX** `MAIN-ACCOUNTING-SORTABLE-HEADERS-BILLSPAGE-ID-BREAK` if still red on main.
30. **FIX** `MAIN-ACCOUNTING-SUBNAV-MISSING-VENDOR-MARKER-BREAK` if still red on main.
31. **HUNT** property tax / TX BPP print unique leftover (one PR).
32. **HUNT** `/program` matrix maintenance cells unique leftover (do not remake roadside Complete).
33. **LIVE** `/safety/permits` embedded 2290 — if inner **h2 duplicates** PageHeader title, unique FINDING (Cursor may take; if you find it, board it, do not collide ParityTable).
34. **HUNT** `/users` activity / audit reverse unique leftover (one PR).
35. **HUNT** next unique leftover on lists/legal/help/system/inventory/users/docs/home/program.

---

## Codex · 9226 · ops FE · 35

Never restamp U14. Never steal CC-1 mint. Never `trigger_deploy`. `eld_certified` FAIL is **not** a stop (board row stays CC-3 if Samsara snapshot).

1. **NOW SCENARIO** `hop.assign` UI on load `065538c8-…` — FINDING if silent; mint = CC-1 item 8.
2. **SCENARIO** Dispatch-sheet print shows **T-LIVE**, not T-DEAD.
3. **SCENARIO** `scenario.deductions` on D1 — `SKIP-NO-DEDUCTIBLE` if none.
4. **SCENARIO** accident/insurance **only with a real claim** — else `SKIP-NO-REAL-ACCIDENT`.
5. **SCENARIO** `scenario.trailer_swap` unique leftover on `/dispatch`.
6. **SCENARIO** `scenario.breakdown_relay` unique leftover — do not remake Complete battery.
7. **SCENARIO** `scenario.fuel` A7 diesel T-LIVE unique leftover — do not remake CLASS-F5973 exhausted.
8. **SCENARIO** `scenario.driver_onboarding` unique leftover `/drivers`.
9. **SCENARIO** `scenario.advance` unique leftover — mint money is CC-1; you prove UI.
10. **SCENARIO** `scenario.escrow` unique leftover `/banking/driver-escrow` — money math CC-1.
11. **HUNT** `/drivers` unique leftover (one PR).
12. **HUNT** `/drivers` second unique.
13. **HUNT** `/drivers` third unique.
14. **HUNT** `/fleet` unique leftover (one PR).
15. **HUNT** `/fleet` second unique — Change Status / telemetry reverse after #15988 (do not remake).
16. **HUNT** `/fleet` third unique — property-tax +Create unique leftover only.
17. **HUNT** `/safety` unique leftover (one PR).
18. **HUNT** `/safety` second unique.
19. **HUNT** `/safety` third unique.
20. **HUNT** `/insurance` unique leftover (one PR).
21. **HUNT** `/insurance` second unique.
22. **HUNT** `/maintenance` unique leftover (one PR) — do not remake roadside Complete.
23. **HUNT** `/maintenance` second unique.
24. **HUNT** `/maintenance` third unique.
25. **HUNT** `/fuel` unique leftover (one PR).
26. **HUNT** `/fuel` second unique.
27. **HUNT** `/driver-hub` unique leftover (one PR).
28. **HUNT** `/eld` if reachable — stub empty is **not** a FINDING.
29. **HUNT** `/compliance` unique leftover (one PR) — do not remake #16002 chrome.
30. **LIVE** Fleet Location & Hours gear 25/50/100/300 — HUNT-PASS or unique FINDING (shared ParityTable already #16002).
31. **FIX** `SETL-EVIDENCE-UPLOAD-SILENT-DROP` if still true (grep first).
32. **HUNT** dispatch geofence Retry unique leftover — do not remake if Retry already live.
33. **HUNT** `/fleet` unit profile reverse (claims/WO/fuel) unique leftover (one PR).
34. **HUNT** `/safety` HOS board unique leftover (one PR).
35. **HUNT** next unique leftover on drivers/fleet/safety/insurance/maintenance/fuel/dispatch UI.

---

## Cascade · audit · 35 · NO PRODUCT PR

`git fetch origin && git reset --hard origin/main`. Unique FINDING or `AUDIT-PASS` + SHA. No U14 restamp. Board same turn.

1. **NOW** Re-walk `/program` USMCA cards on **current** healthz — false-green Complete = FINDING.
2. Walk `hop.book` honesty (CREATE TEST if empty).
3. Walk `hop.assign` honesty (mint is CC-1).
4. Walk `hop.dispatch` / in-transit honesty.
5. Walk `hop.deliver` honesty.
6. Walk `hop.pod_bol` honesty.
7. Walk `hop.revenue` Event-1 JE honesty.
8. Walk `hop.invoice` load# = invoice# honesty.
9. Walk `hop.gl` balanced JE honesty.
10. Walk `hop.bank` probe vs Neon.
11. Walk `scenario.settlement` vs pay-run JE.
12. Walk `scenario.maintenance` vs WO + JE.
13. Walk `scenario.roadside_ap` vs TMS-native JE.
14. Walk `/cash-flow` Proforma / Pre-invoice vs healthz (not stale SHA).
15. Walk `/reports` A/R aging TEST dollars (proforma excluded).
16. Walk `/reports` A/P aging TEST dollars.
17. Walk `/finance` TEST dollars / flag-off honesty.
18. Walk `/accounting` Create bill **Bill no.** top-right.
19. Walk `/banking` match honesty.
20. Walk `/factoring` official invoice only.
21. Walk `/customers` money tabs placeholders honesty.
22. Walk `/vendors` unique leftover.
23. Walk `/dispatch` Book Load silent / title-case stops.
24. Walk `/lists` catalog card → correct list + wizard.
25. Walk `/legal` Complete honesty.
26. Walk `/fuel` Complete honesty.
27. Walk `/compliance` dashboard chrome after #16002 (search/range/gear).
28. Walk `/compliance/form-2290` Back + unit EntityLinks.
29. Walk `/compliance?tab=overview` Live Fleet Location & Hours.
30. Walk leftover POST `/tasks`.
31. Walk leftover POST `/docs`.
32. Walk leftover POST `/users`.
33. Walk leftover POST `/system`.
34. Walk leftover POST `/help`.
35. Walk leftover POST `/home` + `/inventory` unique FINDING only.

---

## Devin-A · audit · 35 · NOT PARKED · NO PRODUCT PR

Unique FINDING or `AUDIT-PASS`. No U14 restamp. OUTBOX same turn.

1. **NOW** `hop.book` live — FINDING if Book Load silent.
2. `scenario.customer` Complete honesty.
3. Create bill — **Bill no.** top-right live.
4. Record expense — **Ref no.** top-right live.
5. `/customers` Statements tab unique leftover.
6. `/customers` Recurring tab unique leftover.
7. `/customers` Late fees tab unique leftover.
8. `/customers` CRM placeholders honesty.
9. `/vendors` unique leftover.
10. `/dispatch` unique leftover.
11. `/dispatch/book-load` unique leftover.
12. Load `065538c8` detail unique leftover (F+R).
13. `/accounting/invoices` unique leftover — invoice# = load#.
14. `/accounting/bills` unique leftover.
15. Recurring bill Template name right honesty.
16. `/banking/transactions` unique leftover.
17. `/cash-flow` unique leftover.
18. `/reports` unique leftover.
19. `/program` unique leftover.
20. `/home` unique leftover.
21. `/users` unique leftover.
22. `/docs` unique leftover.
23. `/help` unique leftover.
24. `/system` unique leftover.
25. `/inventory` unique leftover.
26. `/fleet` unit profile Change Status unique leftover.
27. `/compliance` filings Open drills unique leftover.
28. `/safety/permits` 2290 embed Back unique leftover.
29. `/legal` unique leftover.
30. `/lists` unique leftover.
31. `/factoring` unique leftover (read-only walk).
32. `/settlements` unique leftover (read-only walk).
33. `/driver-hub` unique leftover.
34. `/tasks` unique leftover.
35. `/finance` unique leftover (flag-off honesty).

---

## Cursor · 9222 · lead + overflow · 35

Lead. FAST-MERGE. Deploy **5–10 min AND 5–10 PRs**, one in-flight. Do not steal CC-1 1–35 money. Skip #15546. PCMILER owner-gated.

1. **NOW** Keep seats on GO-2237 — prepend INBOX TOP if any seat still cites GO-1829 as NOW.
2. Unique leftover overflow `/dispatch` chrome (one PR) — not rate-card mint.
3. Unique leftover overflow `/customers` chrome (not CC-1 money math).
4. Drop duplicate **h2** on Form 2290 embed if still live after #16002 (one PR).
5. Vendor credit **Ref no.** if still missing next-number API.
6. Unique leftover `/home` overflow.
7. Unique leftover `/help` overflow.
8. Unique leftover `/program` overflow.
9. Fan unique FINDINGS to owning INBOX + board same turn.
10. Do not merge `#15546`.
11. Unique leftover `/docs` overflow.
12. Unique leftover `/users` overflow.
13. Unique leftover `/system` overflow.
14. Unique leftover `/inventory` overflow.
15. Unique leftover `/tasks` overflow if CC-2 on another item.
16. Unique leftover `/reports` overflow if CC-2 on another item.
17. Unique leftover `/cash-flow` overflow if CC-2 on another item.
18. Unique leftover `/finance` overflow if CC-2 on another item — break-even Excel only if owner-net-new.
19. Keep SESSION-ANNOUNCE hops = this paste.
20. Keep NOW-ONE-SOURCE TOP = this paste.
21. Rewake any seat whose OUTBOX is stale >15 min (Jorge already woke once — do not duplicate wake spam; ping INBOX TOP only).
22. Never second-kick while a deploy is in flight.
23. Unique leftover `/lists` overflow if CC-3 on another item.
24. Unique leftover `/legal` overflow if CC-3 on another item.
25. Unique leftover `/compliance` overflow — do not remake #16002.
26. Unique leftover `/fleet` chrome overflow — do not remake #15988.
27. Unique leftover `/safety` chrome overflow.
28. Prove SPA ancestry includes #16002 after each deploy.
29. Unique leftover Book Load stop title-case — grep first; already on main = skip.
30. Unique leftover PageHeader **Back** label on remaining icon-only leaves (not 2290).
31. Unique leftover gear page-size on a **non-ParityTable** list if any remain.
32. Lead healthz vs `origin/main` undeployed count every loop.
33. Unique leftover `/driver-hub` overflow if Codex on another item.
34. Unique leftover `/fuel` overflow if Codex on another item.
35. Next unique 500/dead/silent anywhere **not** stolen from another seat’s NOW.

---

## Matrix (after each hop you touch)

| Seat | `/program/matrix?module=` |
|------|---------------------------|
| Cursor | `dispatch` `customers` |
| CC-1 | `accounting` `banking` `factoring` |
| CC-2 | `reports` |
| CC-3 | `lists` `legal` |
| Codex | `drivers` `fleet` `safety` `fuel` |
| Cascade | money modules + hops 1–9 walk |
| Devin-A | `customers` then `dispatch` |

---

OUTBOX:

```
SEAT | ACK | GO-2237 | PORT=n | SHA=<healthz> | ITEM=<1-35 of YOUR list> | KEY=<id> | TABLE=<schema.table> | UUID=<id-or-none> | JE=<id-or-none> | FINDING=<id-or-none> | GO
```
