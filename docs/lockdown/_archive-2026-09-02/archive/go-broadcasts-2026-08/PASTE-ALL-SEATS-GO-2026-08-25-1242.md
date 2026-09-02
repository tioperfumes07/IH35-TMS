# PASTE ALL SEATS — GO 2026-08-25 12:42 CT

**Idle = defect.** Hard-reload **USMCA**. Live API `healthz/shallow` **`80cf40e`**. SPA autoDeploy on `ih35-tms-web`. **Nobody `trigger_deploy`.** U14 never restamp. PCMILER/geofence **owner-gated**.

**Not a 15th plan.** Same law as GO-1214. **25 numbered items per seat** (175 total). `git pull --ff-only origin main` → INBOX TOP → work **your** numbers until Complete, HUNT-PASS, or unique FINDING. Grep-verify every board id against `origin/main` before building (stale OPEN = skip, next item).

Reuse load `065538c8-…` (`L-20260824-0007`), customer `55baee26-…`, T-LIVE `1a3c98da-…`, WO `850e2cc4-…`, parts `45f36791-…`. Do **not** remake Complete cards / Close / `/425c` certify loop / BILL-2026-00015 / parts receive / CLASS-F5973 exhausted leaves.

**Already ACK this morning (do not remake):** CC-2 GO-1214 items 11–16 (`#15808`). CC-3 GO-1214 ACK (`#15811`) — item 21 unique shipped; `scenario.maintenance` still waits CC-1 #6. **CC-1 has not ACK’d 1–10 — those stay first.** Codex still needs attach.

Hunt method: `docs/lockdown/DEEP-DIVE-UNIQUE-HUNT-CODER-INSTRUCTIONS-2026-08-24.md`. Perfect = no 500 / dead click / silent no-op / reverse-empty / fake $0 on **your** URLs at current healthz.

---

## CC-1 · 9223 · money serial · items 1–25

One at a time. Reuse poster. No new GL math. Never `/425c`. Money clone, not `IH35-TMS-clean`.

1. **FIX** `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` — live invoice still `INV-2026-00044` must equal `L-20260824-0007`
2. **FIX** `CASHFLOW-PROFORMA-PROJECTED-LABELED` — `/cash-flow` Projected / Pre-invoice by delivery date (CC-2 blocked until this ships)
3. **FIX** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` — expense `57cabbab-…` posted / posting_status unposted
4. **FIX** `hop.bank` probe honesty — Program `matched_invoice_id` 0 vs Neon recon + `matched_transfer_id`
5. **FIX** `scenario.roadside_ap` JE on existing TMS-native WO bill (QBO clones do not count)
6. **FIX** `WO-AUTO-BILL-NEVER-POSTS-GL-JE` + `vendor_id` on autoCreateBillFromWO (do not remake Bill `2273abf7`)
7. **FIX** `LV-PAY-SETTLE-NOPOST` / `scenario.settlement` — paid settlement + posted pay-run JE
8. **FIX** `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS` — rate card × shortest miles, never customer rate
9. **SCENARIO** Print invoice/bill/expense letters — wrapPdfDocument, not SPA
10. **SCENARIO** Official invoice → vendor bill payment on roadside bill; factoring only on official invoice
11. **FIX** `INVOICE-SENT-WITHOUT-AR-RECOGNITION-JE` if still true on USMCA
12. **FIX** `CUST-MONEY-F6105-CUSTOMER-PAYMENT-UNAPPLY-DEAD-ROUTE` if still OPEN on main
13. **FIX** `CUST-MONEY-F6312-CUSTOMER-MONEY-TABS-SHIPPED-PLACEHOLDERS` (statements / recurring / late fees — canonical sources only)
14. **FIX** `DRV-MONEY-F6083-EARNINGS-REVERSE-GET-FAILURES-MASQUERADE-AS-ZERO` if still OPEN
15. **FIX** `DRV-MONEY-F6106-PAYMENT-METHODS-GET-FAILURE-FALSE-EMPTY` if still OPEN
16. **FIX** `DRV-MONEY-F6110-DRIVERS-HUB-FINANCIAL-FEEDS-FAIL-AS-ZERO` if still OPEN
17. **FIX** `FLEET-MONEY-F6113-UNIT-TRIP-COST-CALLER-COMPANY-NOT-MEMBERSHIP-RESOLVED` if still OPEN
18. **FIX** `FLEET-MONEY-F6304-UNIT-ASSET-COST-UNUSED-PARAM-SILENT-FALLBACK` if still OPEN
19. **FIX** `ACCT-F6284-BANK-TX-SPLIT-JSON-MEMO-LEAKS-TO-UI` if still OPEN
20. **HUNT** `/accounting` unique 500/dead/silent/fake-$0 (one PR)
21. **HUNT** `/banking` unique leftover (one PR)
22. **HUNT** `/factoring` unique leftover (one PR)
23. **HUNT** `/settlements` unique leftover (one PR) — mint still this seat
24. **HUNT** `/vendors` money unique leftover (one PR)
25. **HUNT** `/customers` money tabs unique leftover after F6312 (one PR)

Skip if grep-closed on main. Never remake advances. Never `trigger_deploy`.

---

## CC-2 · 9224 · leftover POST unique · items 26–50

Do **not** remake GO-1214 11–16 (ACK’d). Next unique only. Never remake hop 9 Chrome. Never Close remake. Do not loop `/425c` certify.

26. **RE-WALK** `/cash-flow` the moment CC-1 #1–2 merge — prove Projected/Pre-invoice + load number
27. **HUNT** `/cash-flow` unique 500/dead/silent/fake-$0 (one PR)
28. **HUNT** `/reports` hub unique leftover (one PR)
29. **HUNT** `/reports` IFTA unique leftover (one PR)
30. **HUNT** `/reports` fuel recon unique leftover (one PR)
31. **HUNT** `/reports` settlement-summary leftover unique (do not remake load_count #15763)
32. **HUNT** `/reports` A/R aging unique leftover (one PR)
33. **HUNT** `/reports` A/P aging unique leftover (one PR)
34. **HUNT** `/reports` P&L unique leftover (one PR)
35. **HUNT** `/reports` Balance Sheet unique leftover (one PR)
36. **HUNT** `/reports` Trial Balance unique leftover (one PR)
37. **HUNT** `/reports` profit-per-truck unique leftover (one PR)
38. **HUNT** `/reports` customer profitability unique leftover (one PR)
39. **HUNT** `/finance` unique leftover (one PR)
40. **HUNT** `/tasks` unique leftover (one PR)
41. **HUNT** `/reports` print letter unique leftover (one PR)
42. **HUNT** `/cash-flow` print letter unique leftover (one PR)
43. **HUNT** `/finance` print package unique leftover (one PR)
44. **HUNT** reports `runner.*` connectivity gaps still true from `LINK-F5170` (one unique PR, grep-verify)
45. **HUNT** `/reports` categories catalog hardcoded vs Neon if still true (one PR)
46. **SCENARIO** Prove `/tasks` reads TESTs on load `065538c8-…` (HUNT-PASS or FINDING)
47. **SCENARIO** Prove `/finance` reads same TEST dollars (HUNT-PASS or FINDING)
48. **HUNT** next unique `/cash-flow` tab after 27
49. **HUNT** next unique `/reports` tab after 28–38
50. **HUNT** next unique `/tasks` action after 40

---

## CC-3 · 9225 · leftover-16 chrome + lists/legal · items 51–75

Do not remake parts `45f36791` or legal Complete. Do not remake GO-1214 item 21. Never `trigger_deploy`.

51. **FIX** `CUST-CRM-F6313-CUSTOMER-CRM-TABS-HAVE-NO-PERSISTENCE` if still OPEN
52. **FIX** `MAIN-ACCOUNTING-SORTABLE-HEADERS-BILLSPAGE-ID-BREAK` if still red on main
53. **FIX** `MAIN-ACCOUNTING-SUBNAV-MISSING-VENDOR-MARKER-BREAK` if still red on main
54. **FIX** `FLEET-CHROME-F6086-QBO-CHROME-GUARD-ANCHOR-DRIFT` if still OPEN (no QBO write-back)
55. **HUNT** `/help` unique leftover (one PR)
56. **HUNT** `/program` unique leftover chrome (one PR) — no U14 restamp
57. **HUNT** `/system` unique leftover (one PR)
58. **HUNT** `/inventory` unique leftover (one PR)
59. **HUNT** `/users` unique leftover (one PR)
60. **HUNT** `/docs` unique leftover (one PR) — grep-verify DOCS-F6072 before remaking
61. **HUNT** `/home` unique leftover (one PR)
62. **HUNT** `/lists` unique 500/dead/silent (one PR)
63. **HUNT** `/legal` unique leftover (one PR) — do not remake Complete
64. **SCENARIO** WO `850e2cc4` → `complete` after CC-1 #6 JE (enum has no `closed`)
65. **SCENARIO** WO print `/api/v1/work-orders/:id/pdf` if not already proven
66. **SCENARIO** Property allocation / TX BPP print or unique FINDING if missing
67. **HUNT** `/help` second unique tab
68. **HUNT** `/system` second unique tab
69. **HUNT** `/inventory` second unique tab
70. **HUNT** `/users` second unique tab
71. **HUNT** `/docs` second unique tab
72. **HUNT** `/home` second unique tab
73. **HUNT** `/program` matrix lists/legal cells unique leftover
74. **HUNT** `/lists` second unique catalog
75. **HUNT** `/legal` second unique leftover

---

## Codex · 9226 · ops FE · items 76–100

Attach session. Do **not** steal CC-1 settlement mint / driver bills. Never restamp U14. Never `trigger_deploy`.

76. **SCENARIO** `hop.assign` on load `065538c8-…` — FINDING if UI silent; mint is CC-1 #8
77. **SCENARIO** `scenario.deductions` on D1 — skip if no real deductible (`SKIP-NO-DEDUCTIBLE`)
78. **SCENARIO** Dispatch-sheet print shows **T-LIVE**, not T-DEAD
79. **FIX** `SETL-EVIDENCE-UPLOAD-SILENT-DROP` if still true
80. **SCENARIO** accident/insurance **only with a real claim** — else `SKIP-NO-REAL-ACCIDENT`
81. **HUNT** `/drivers` unique leftover (one PR)
82. **HUNT** `/fleet` unique leftover (one PR)
83. **HUNT** `/safety` unique leftover (one PR)
84. **HUNT** `/insurance` unique leftover (one PR)
85. **HUNT** `/maintenance` unique leftover (one PR)
86. **HUNT** `/fuel` unique leftover (one PR) — do not remake CLASS-F5973 exhausted
87. **HUNT** `/drivers` second unique
88. **HUNT** `/fleet` second unique
89. **HUNT** `/safety` second unique
90. **HUNT** `/insurance` second unique
91. **HUNT** `/maintenance` second unique
92. **HUNT** `/fuel` second unique
93. **HUNT** driver-hub unique leftover `/driver-hub` (one PR)
94. **HUNT** ELD unique leftover `/eld` if reachable (stub empty is not a FINDING)
95. **HUNT** compliance unique leftover `/compliance` (one PR)
96. **SCENARIO** `scenario.fuel` A7 diesel T-LIVE if not remaking Complete
97. **HUNT** `/drivers` third unique
98. **HUNT** `/fleet` third unique
99. **HUNT** `/safety` third unique
100. **HUNT** `/maintenance` third unique

---

## Cascade · audit · items 101–125

**No product PRs.** Live walk. Unique FINDING or `AUDIT-PASS` + SHA. No U14 restamp.

101. Re-walk `/program` USMCA 28 cards on live SHA — false-green Complete = FINDING
102. Walk `hop.book` honesty
103. Walk `hop.assign` honesty (driver bill mint is CC-1)
104. Walk `hop.bank` probe vs Neon
105. Walk `scenario.settlement` vs Neon pay-run JE
106. Walk `scenario.maintenance` vs WO complete + JE
107. Walk `scenario.roadside_ap` vs TMS-native JE
108. Walk `/cash-flow` vs CC-1 labels
109. Walk `/reports` A/R aging TEST dollars
110. Walk `/reports` A/P aging TEST dollars
111. Walk `/finance` TEST dollars
112. Walk `/accounting` Create bill Bill no. top-right
113. Walk `/banking` match honesty
114. Walk `/factoring` official invoice only
115. Walk `/customers` money tabs placeholders
116. Walk `/vendors` unique leftover
117. Walk `/dispatch` Book Load silent
118. Walk `/lists` catalog card → correct list
119. Walk `/legal` Complete honesty
120. Walk `/fuel` Complete honesty
121. Walk leftover POST `/tasks`
122. Walk leftover POST `/docs`
123. Walk leftover POST `/users`
124. Walk leftover POST `/system`
125. Walk leftover POST `/help`

---

## Devin-A · audit · items 126–150

**Not PARKED.** No product PRs. Unique FINDING or `AUDIT-PASS`. No U14 restamp.

126. `hop.book` live — FINDING if Book Load silent
127. `scenario.customer` Complete honesty
128. Create bill — confirm **Bill no.** top-right live
129. Record expense — confirm **Ref no.** top-right live
130. `/customers` Statements tab unique leftover
131. `/customers` Recurring tab unique leftover
132. `/customers` Late fees tab unique leftover
133. `/customers` CRM placeholders honesty
134. `/vendors` unique leftover
135. `/dispatch` unique leftover
136. `/dispatch/book-load` unique leftover
137. Load `065538c8` detail unique leftover
138. `/accounting/invoices` unique leftover
139. `/accounting/bills` unique leftover
140. Recurring bill Template name right honesty
141. `/banking/transactions` unique leftover
142. `/cash-flow` unique leftover
143. `/reports` unique leftover
144. `/program` unique leftover
145. `/home` unique leftover
146. `/users` unique leftover
147. `/docs` unique leftover
148. `/help` unique leftover
149. `/system` unique leftover
150. `/inventory` unique leftover

---

## Cursor · 9222 · lead + overflow · items 151–175

Lead. FAST-MERGE. Deploy 5–10 min **and** 5–10 PRs, one in-flight. Do not steal CC-1 1–25. PCMILER owner-gated.

151. Lead loop: healthz + undeployed count + seat ACK
152. Unique leftover overflow `/dispatch` (one PR)
153. Unique leftover overflow `/customers` chrome (not CC-1 money math)
154. Vendor credit **Ref no.** if still missing next-number API (FINDING or wire)
155. `CI-F6318-F425C-PRINT-NETCASH-NULL-TYPECHECK` if still true (grep first — may already be null-aware)
156. Unique leftover `/home` overflow
157. Unique leftover `/help` overflow
158. Unique leftover `/program` overflow
159. Fan unique FINDINGS to owning INBOX same turn
160. Do not merge `#15546` UNSTABLE tracker
161. Unique leftover `/docs` overflow
162. Unique leftover `/users` overflow
163. Unique leftover `/system` overflow
164. Unique leftover `/inventory` overflow
165. Unique leftover `/tasks` overflow if CC-2 idle
166. Unique leftover `/reports` overflow if CC-2 idle
167. Unique leftover `/cash-flow` overflow if CC-2 idle
168. Unique leftover `/finance` overflow if CC-2 idle
169. Keep SESSION-ANNOUNCE hops = this paste
170. Keep NOW-ONE-SOURCE TOP = this paste
171. Rewake Codex if still detached
172. Never second-kick while a deploy is in flight
173. Unique leftover `/lists` overflow if CC-3 idle
174. Unique leftover `/legal` overflow if CC-3 idle
175. Next unique 500/dead/silent anywhere not stolen

---

## Matrix (after each hop)

| Seat | `/program/matrix?module=` |
|------|---------------------------|
| Cursor | `dispatch` `customers` |
| CC-1 | `accounting` `banking` `factoring` |
| CC-2 | `reports` |
| CC-3 | `lists` `legal` |
| Codex | `drivers` `fleet` `safety` `fuel` |

---

OUTBOX:

```
SEAT | ACK | GO-1242 | PORT=n | SHA=80cf40e | ITEM=<1-175> | KEY=<card-or-finding> | TABLE=<schema.table> | UUID=<id> | JE=<id-or-none> | FINDING=<id-or-none> | GO
```
