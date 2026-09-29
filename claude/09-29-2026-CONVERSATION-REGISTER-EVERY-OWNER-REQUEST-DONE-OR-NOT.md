# IH35 — CONVERSATION REGISTER · EVERY OWNER REQUEST · DONE / NOT DONE
# Claude Lead · 09-29-2026 · updated through the 7-hour orchestration session
# Owner's order: "REGISTER IN CONVERSATION REGISTRY AND THE JOURNAL, ALL THINGS I REQUEST AND MARK AS DONE OR NOT DONE."

| # | Owner request (his words, condensed) | Status | Owner | Proof / where it stands |
|---|---|---|---|---|
| 1 | Settlement + invoice designs iterated to approval | **DONE** | Lead | v10 approved: "THESE DESIGNS ARE PERFECT" |
| 2 | "GET THESE DESIGNS LOCKED" — locked into the repo | **DONE** | Lead | `claude/00-LOCKED-DOCUMENT-DESIGNS-v10-DO-NOT-ALTER.html`, committed 8cff5b4a9d |
| 3 | "...AND BUILT IDENTICAL" — the app prints them | **NOT DONE** | Devin-A | Proven: renderer files dated Aug 12/18, zero matches for downtime/real fuel/approved_by/detention/layover/idle. ROUND 272 issued. |
| 4 | Idling / downtime estimates on the company settlement | **NOT DONE** | Devin-A | Designed in v10; not rendered. ROUND 272. |
| 5 | Real fuel cost per load printed automatically | **NOT DONE** | Devin-A | Engine live (48 real burns); not on the printed document. ROUND 272. |
| 6 | Detention/layover show APPROVED BY + METHOD | **NOT DONE** | Devin-A | ROUND 272. |
| 7 | Invoice auto-generates on delivered/closed when BOL exists, then auto-to-factoring for Faro | **NOT DONE** | Devin-A | ROUND 272. |
| 8 | Invoice redesigned to QuickBooks format, balance-due banner removed | **DONE** | Lead | v10 |
| 9 | Research the void engine vs QBO / NetSuite / McLeod / Alvys | **DONE** | Lead | `09-30-2026-LEAD-VOID-ENGINE-RESEARCH-*.md`. Result: NetSuite reversing-JE model is correct and we already have it. |
| 10 | Confirm the posting rule (post on record, not on bank match) | **DONE** | Lead | Owner confirmed: Dec 31 check is a December payment. Written into all seat headers as Part B. |
| 11 | "PERMANENTLY DELETE ALL VOIDED TRANSACTIONS" | **NOT DONE — SEQUENCED** | Devin-B | ROUND 271 Phase 3. Runs after the audit, per owner's later order. |
| 12 | Delete all test/sample/demo/example data app-wide | **NOT DONE — SEQUENCED** | Devin-B | ROUND 271 Phase 4. 59 flagged rows measured. |
| 13 | **Audit all modules for the factoring void defect BEFORE deleting** | **NOT DONE — ISSUED** | Devin-B | ROUND 271 Phases 1–2. 18 tables / 2,732 voided rows measured live. |
| 14 | Verify every engine posts to the right account for the right reason | **NOT DONE — ISSUED** | Devin-B | ROUND 271 Phase 5 (item 38). |
| 15 | Post the 254/257 draft expenses, fast, seed directly | **IN FLIGHT** | CC-1 | AUTH-131: 143 of 237 posted, drafts 257 → 114 |
| 16 | Batch bank-match everything matchable, owner does the rest | **NOT DONE** | CC-1 | ROUND 260 Part I |
| 17 | Geocode the 349 ungeocoded stops | **IN FLIGHT** | CC-3 | ROUND 262 |
| 18 | Instructions per coder in copy-paste boxes, by urgency | **DONE** | Lead | Rounds 258–272, Downloads + repo |
| 19 | Anti-drift language in every instruction | **DONE** | Lead | Part D, 13 items, every round |
| 20 | "NO CODER HAS WORK SAVED LOCALLY" — push, merge, deploy | **PARTIAL** | All seats | Part D items 12–13. Codex 2 commits local; CC-2 holds B8/R218/P0 on live-data guards; CC-3 holds ROUND 234. |
| 21 | Coders must not pause for blockers | **DONE** | Lead | ROUND 265 self-service law |
| 22 | Check the app live, Faro factoring, load boards | **DONE** | Lead | 93 advances, $315,356.28 outstanding, MTD 106 (contaminated), loads 86/23/14/13/13 |
| 23 | Register + journal, everything marked DONE or NOT DONE | **DONE** | Lead | this file |
| 24 | Get everything into the repo | **PARTIAL** | Lead | Committed locally (8cff5b4a9d, f929684ea5). Push to GitHub blocked — no credentials in this shell; handing to a seat. |

## LEAD RETRACTIONS ON THE RECORD

| Claim | Status | Corrected by |
|---|---|---|
| "201 unguarded RLS casts" | WITHDRAWN — 129 unique locations | Devin-B |
| "telematics.odometer_readings is empty" | WITHDRAWN — 177,906 readings in vehicle_locations | Devin-B |
| "130/130 bill_payments unposted" | WITHDRAWN — GL-exempt, cash posted via settlement JE | CC-2, CC-1 |
| "Parse the JE uuid from bill memos" | WITHDRAWN — only 93 of 223 carry one | CC-1 |
| "Build the void engine to QBO's standard" | WITHDRAWN — NetSuite model, already implemented | Lead research |
| "mdata.fuel_transactions" | WITHDRAWN — the real table is fuel.fuel_transactions | Devin-A |
| All-green self-check in Codex's round | WITHDRAWN in writing | Codex refused it |
| "15 invoices never sent to Faro" | WITHDRAWN — they are Transportation entity loads | Owner |
| "The Faro import never ran" | WITHDRAWN — it ran (34-row backfill 09-13); AUTH-001 purge wiped the table | CC-1 |

## OPEN ITEM — FARO RESERVES / HOLDBACK (owner 09-29, "we will work later")

Owner: *"sometimes the purchase might be for 30,000 and they apply 30,000 in payments but only send 10 in wire, that is because they hold funds for the CCG payment, but that we will work later, all these deductions are in the reserves account I believe."*

**What this means for the factoring model:** the wire we receive is NOT the advance amount. Purchase amount, payments applied, deductions/holdbacks, and net wire are four different numbers, and the gap lives in the **reserve account**. Any reconciliation that expects wire = advance is wrong by construction.

Measured today on USMCA: invoice face $325,346.72 · advanced $315,356.28 · **reserve held $4,736.59** · factor fees $4,888.44.

CC-2 independently hit the same shape: 12 of 15 matched bank lines are combined Faro wires covering several invoices (invoice 84 nets $3,589 against a $27,441 wire). Those bank lines cannot reconcile one-to-one to an invoice and must never be flagged as a data error.

**NOT SCHEDULED — owner deferred it himself.** Do not build against it yet. Do not let any guard assume wire = advance in the meantime.

**Owner's answer on where the holdback lands (09-29, deferred by him):** it is already in the blueprint / architecture / CPA answers. Create a **LOAN TO TRANSPORTATION** account and use the **loan creator** to open a loan to Transportation, so the amounts Faro deducts match against the loan account rather than floating. **NOT SCHEDULED — owner deferred. Do not build it yet. Do not invent a different treatment in the meantime.**
