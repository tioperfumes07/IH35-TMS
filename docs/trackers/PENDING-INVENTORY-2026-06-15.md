# IH35-TMS — FULL PENDING INVENTORY (reconciled) — 2026-06-15

**Source:** `MASTER_PROGRESS_REPORT.md` v28 (all sheets) + GitHub merged-PR record + design-spec scan.
**Method:** parsed every numbered task row; authoritative status = **col-6 "Reconciled Status"** (not col-5 orig). A row is OPEN when reconciled ≠ DONE. Then cross-checked drift both directions and scanned design-spec dirs for specs with no tracker row.
**Headline:** raw "non-DONE" tokens = 171, but the tracker's **dual status columns + duplicate Packet/Wave rows inflate that**. After reconciliation the TRUE actionable backlog is far smaller — most Packet-1/2 "PENDING" rows are **DONE-DRIFT** (already shipped, re-verified in the Wave-4 recon).

---

## SUMMARY COUNTS (reconciled, authoritative col-6)

| Reconciled status | rows |
|---|---|
| PENDING | 111 |
| PARTIAL | 9 |
| SUPERSEDED | 8 (not actionable) |
| ON DECK | 4 |
| NOT STARTED | 4 |
| ONGOING | 3 (continuous, not a block) |
| NEEDS CONFIRM | 1 |
| MISSING | 1 |
| NOT-BUILT | 1 |
| DRAFTED / DROPPED / PARKED / CANCELLED | 4 (not actionable) |
| build-queue rows (phases A–E, statuses M/S/L/XS) | ~19 |

**Of the 111 "PENDING": a large majority are DONE-DRIFT** (see next section). True net-new actionable ≈ **55–65 blocks**, of which ~12 are Tier-1 (money/security) and the rest Tier-3.

---

## ⚠️ DRIFT — direction 1: tracker says PENDING, but SHIPPED (DONE-DRIFT)

The Packet-1/2 rows (351–388) + Wave-1/2 rows (424–435) are an OLDER audit; the **Wave-4 recon (rows 650–680) already verified most as shipped**. These should be flipped to DONE:

| PENDING row | item | shipped as | Wave-4 verdict |
|---|---|---|---|
| 351 #05-Block-U | FUEL sub-nav | #817 | 650 DONE |
| 352 #06-Block-V | DISPATCH sub-nav | #818 | 651 DONE |
| 367 #21-Block-H | URL normalize | #389/#819 | 652 DONE |
| 369 #23-Block-J | Equipment dedup | #391 | 653 DONE |
| 357 #11-Block-C | Trailer Profile | TrailerProfilePage | 654 DONE |
| 358 #12-Block-D | Parts Catalog | Maint/OEM catalogs | 655 DONE |
| 366 #20-Block-G | Catalog stub purge | #518 | 658 DONE |
| 368 #22-Block-I | LISTS header counts | #393 | 659 DONE |
| 372 #26-Block-L | QBO sync drift | PULL+PUSH suite | 660 DONE |
| 373 #27-Block-AM | Loves sync | #399 | 661 DONE |
| 374 #28-Block-AN | Plaid sync | #402 | 662 DONE |
| 355 #09-Block-AA | seed-test archive | #400/#910 | 664 DONE |
| 377 #31-Block-AP | MAINT settings | pm-schedule | 665 DONE |
| 378 #32-Block-AR | Factoring profile | #904 | 666 DONE |
| 380 #34-Block-AG | 425C guard | Form425CHome | 668 DONE |
| 375 #29-Block-O | cust/vendor classes | #401 | 670 DONE |
| 381 #35-Block-AQ | Safety pseudo-user | #397 | 671 DONE |
| 385 #39-Block-AH | SAFETY dropdown | locked complete | 674 DONE |
| 386 #40-Block-AS | modal X-close | #398/#916 | 675 DONE |
| 364 #18-Block-AK | Bank escrow counter | #395 | 676 DONE |
| 382 #36-Block-AI | User last_login | #394 | 678 DONE |
| 354 #08-Block-A | migration ledger | #177/#878 | 679 DONE |
| 424 #77-A15 / 386 | modal X-close | #398 | DONE |
| 425 #78-A16 / 425 | archive test/seed | #400 | DONE |
| 427 #80-B13 | Loves sync | #399 | DONE |
| 429 #82-B15 | Plaid sync | #402 | DONE |
| 430 #83-A17 | drivers catalogs | #403/#482 | DONE |
| 431 #84-A18 | names master | #408 | DONE |
| 433 #86-B16 | Trailer Profile 2 | #404 | DONE |
| 434 #87-B17 | parts catalog | #407 | DONE |

→ **~30 PENDING rows are DONE-DRIFT.** Recommend a one-shot tracker reconcile to flip them (low-risk docs PR).

## ⚠️ DRIFT — direction 2: PARTIAL (shipped but incomplete) — genuinely open remainder

| row | item | what's done | what's missing |
|---|---|---|---|
| 656 Block-E | Services catalog + ETA | intervals/eta-calculator | live Samsara mileage ingest cron |
| 657 Block-F | Reefer hours | tables/routes/UI (mig 0366) | 15-min poller cron |
| 663 Block-Q | DOCS upload | backend + R2 | frontend upload UI |
| 667 Block-Z | Driver CDL/hire CSV | internal backfill | user import route |
| 669 Block-K/AL | Classes | read view | bulk-edit/write path |
| 672 Block-AO | PM countdown | cron registered | depends on Block-E intervals |
| 673 Block-AF | Help articles | 12 articles | ~8 modules missing |
| 607 AI-1 | period lock | snapshot lock (0218) | closed-period LEDGER-WRITE lock |
| 608 AI-2 | recon cron | services exist | scheduled wrapper |
| 609 AI-3 | daily probe | safety cron | FINANCIAL probes |

## ⚠️ DRIFT — direction 3: claimed-done-unverified
None found — spot-checks of recent DONE rows (#1017/#1018/#1019/#1021) all have code on main. The tracker's DONE column is reliable; the drift is all in the **stale-PENDING** direction.

---

## TRUE ACTIONABLE BACKLOG — grouped by Lane / Tier

### LANE B — Tier 1 (money / posting / void / period-close / COA-integrity / RLS-security)
| seq | item | v28 row | tier | status | depends-on | spec |
|---|---|---|---|---|---|---|
| B1 | #6999 Design C — COA partial-unique + runtime guard | (staged, held) | 1 | held-for-go | — | inline |
| B2 | Flip EXPENSE_GL_POSTING_ENABLED (decision; GUARD 1st live post) | 874/#1018 | 1 | ready (verified #1021) | B1 | — |
| B3 | GAP-EXPENSES Phase 3 — QBO purchase sync | NEEDS-ROW | 1 | design exists | B2 | 04_GAP-EXPENSES-PHASE-3 |
| B4 | EXPENSE-VOID-BLOCK-IF-LINKED-GATE3 | 879 | 1 | design-first | — | #1016 §5 |
| B5 | Expense void/reversal live (flip VOID_ENFORCEMENT_ENABLED) | — | 1 | gated on B4 | B4 | VOID-EVERYWHERE |
| B6 | Period-close × expense postings | 607/639 | 1 | partial | B2 | AI-1b |
| B7 | SEC-PROD-APP-ROLE-BYPASSES-RLS (#878) | 878 | 1 | design-first | — | inline |
| B8 | AI-2b/AI-3b recon cron + financial probes | 608/609/640/642 | 1 | partial | — | — |
| B9 | AI-4 periods init (bookkeeper-gated) | 610/641 | 1 | missing | — | — |
| B10 | Block-11 mutation audit coverage | 593/626/682 | 1 | pending | — | — |
| B11 | Block-19 tamper-evident audit hash chain | 599/635 | 1 | pending | — | — |
| B12 | COA-ACCOUNTS-UNAUDITED (#877) | 877 | 1 | design-first | — | inline |
| B13 | Bank reconcile-commit enable | 13 | 1 | pending | — | — |
| B14 | Opening-balance entry (owner-only) | 14 | 1 | pending | — | — |
| B15 | Block-35 Chart of Accounts main | 182 | 1 | not started | — | — |

### LANE A — Tier 3 (ship-on-green; smaller-fast-first after verify)
**Finance Hub builds (design specs exist in finance-build/ + docs/specs/):**
| seq | item | v28 row | status | spec | note |
|---|---|---|---|---|---|
| A1 | FH-2 Loan Wizard | #1023 | IN FLIGHT | 05-FH-2 | this session |
| A2 | FH-3 Amortization | DOCS done | reuse FH-2 loan-math.ts | 04-FH-3 | FAST (engine built) |
| A3 | FH-4 Calculator | DOCS done | pending | 06-FH-4 | small |
| A4 | FH-7 Unit Allocation | DOCS done | pending | 03-FH-7 | medium |
| A5 | FH-8 Lease Contract | DOCS done | pending | 10-FH-8 | medium |
| A6 | FH-6 Tax Manager | DOCS done | pending | 07-FH-6 | medium |
| A7 | FH-5 Bankruptcy | DOCS done | pending (3–5 sub-blocks) | 08-FH-5 | LARGEST |
| A8 | 1099 Generation | 600/636 | pending | 15-1099 | year-end |
| A9 | Relay Internal Bank | 956 (design) | design→build | 16-RELAY | medium |
| A10 | Mileage model | 943/946/954 (design) | design→build | MILEAGE | medium |

**Catalog / UI (VERIFY-OPEN-FIRST — many are PARTIAL not PENDING):**
| seq | item | v28 row | reconciled | action |
|---|---|---|---|---|
| A11 | Best Bay typo fix | 353/677 | NOT-BUILT | trivial, genuinely open |
| A12 | Fuel/Accounting/Fleet catalogs | 58/59/60 | PENDING | verify-then-build |
| A13 | Services catalog Samsara ingest | 656 | PARTIAL | finish cron |
| A14 | Reefer 15-min poller | 657 | PARTIAL | finish cron |
| A15 | DOCS upload UI | 663 | PARTIAL | frontend only |
| A16 | Classes bulk-edit | 669/371 | PARTIAL | write path |
| A17 | Help articles backfill | 673/384 | PARTIAL | ~8 modules |
| A18 | Cleanup-hyphen / list-error-states | 65/66 | PENDING | small |
| A19 | HOME Record Expense modal | 365 | PENDING (poss. drift #396) | verify first |

**Insurance / Fleet:**
| A20 | Insurance 500 / listUnits | 25 | HELD (Render log + rotation) | — |
| A21 | INS-COVERAGE assets-vs-units (#876) | 876 | design-first | — |

**Audit / QBO parity:**
| A22 | QBO drift reconcile — customers/vendors/CoA | (sub of Block-L) | mostly DONE; confirm | verify |
| A23 | CA-05 per-account register / CA-06 audit tab | 613/614/644/645 | pending | after CA-04 (done) |
| A24 | QBO invoice/bill PULL (parked) | 680 | PARKED | finance-gated when scoped |

**Hardening sweep (Wave-5, rows 681–692):** RLS cross-tenant test, audit-log mutation, webhook DLQ, idempotency keys, concurrency, rate-limit, CORS pin, SBOM, backup/DR doc, index/query tuning, long-run cron alert, worker monitor — **12 PENDING**, companions to shipped Tier-2 blocks.

**Stragglers / future (lower priority):**
- 32/33/36 real email provider + cron + orphan-report UI (blocks email features)
- 69/70/71/72 backend test infra / orphan triage / phone off-by-one / FMCSA verify
- 332–335 Sunday-5/31 follow-ups (Render predeploy doc, dup-script delete, Cursor gh re-auth, live-UI walk)
- 279 outbox consolidation (DRAFTED), 638/683 outbox DLQ (NEEDS CONFIRM)
- 646 cross-border customs gate, 648 Sidebar-V2, 649 density-pass (preview-gated, last)
- 195–199 Phase 6 (EDI/lanes/pricing/recurring/CSA), 262–268 mobile apps + Phase 8 (IFTA/2290/drug/CSA) — **future/post-MVP**
- 34 (agent list) TMS→QBO Payroll page — post-MVP Cycle 5

---

## NEEDS-ROW (design specs with NO clear tracker build-row)
| spec file | maps to | action |
|---|---|---|
| `EXPENSE SEQUENCE.../04_GAP-EXPENSES-PHASE-3-QBO-PURCHASE-SYNC` | Lane B B3 | **add build row** (design exists, no build row) |
| `finance-build/12-A3-CUTOVER.md` | A3 settlement cutover | confirm vs #929-#932 (likely shipped) |
| `finance-build/13-B10-SETTLEMENT-CONFIRM.md` | settlement confirm | confirm vs C1-pre-settlements #900 |
| `docs/specs/FH-3..FH-8-*-DESIGN.md` | A2–A7 | design rows exist (DOCS-FHx); **build rows missing** — add per FH build |
| `docs/specs/RELAY-INTERNAL-BANK-DESIGN.md` | A9 | build row missing |
| `docs/specs/MILEAGE-MODEL-DESIGN.md` | A10 | build row missing |
| `docs/specs/PERMISSIONS-DESIGN.md` | Roles & Permissions | **no tracker row at all** — NEEDS-ROW |

---

## RECOMMENDED SEQUENCE + WHY

**Governing rule (two different rules per lane):**
- **Lane A (Tier-3, parallel, ship-on-green): smaller-fast-first** — your instinct is right. Clearing small items fast (a) shrinks the queue, (b) removes drift noise so the true big blocks (FH-5, hardening sweep) stand out, (c) each merge is a verified win. **BUT verify-each-is-still-open first** (≈30 Packet rows are already shipped — don't rebuild them).
- **Lane B (Tier-1, money path, sequential): risk/dependency-first, NOT size** — a fast-but-wrong money change is worse than a slow-correct one.

**Lane B order:** B1 #6999 Design C (cheap, protects the resolution path) → **B2 flip the flag** → B3 Phase-3 QBO sync → B4 Gate-3 void guard (HARD GATE) → B5 void live → B6 period-close → B7 SEC-RLS (biggest exposure, highest blast radius — design early, execute deliberately/staged) → B8–B15 audit/integrity/CoA.

**Lane A order:** (0) **one-shot tracker reconcile** to flip the ~30 DONE-DRIFT rows (makes the queue trustworthy) → A11 Best Bay typo + A18 small cleanups (trivial) → **A2 FH-3 Amortization** (FAST — reuses FH-2 `loan-math.ts`) → A3 FH-4 → A13/A14 finish the PARTIAL crons → A15/A16/A17 finish PARTIAL UI → A4–A6 FH-7/FH-8/FH-6 → A8 1099 → A9/A10 Relay/Mileage → **A7 FH-5 Bankruptcy LAST** (largest) → hardening sweep (Wave-5) interleaved.

**Why this order surfaces the real work:** after the tracker reconcile + the small-fast clears, what remains is unambiguously the heavy money path (Lane B) + FH-5 + the hardening sweep — the blocks that actually carry risk and deserve the human-in-loop attention.

---

## APPENDIX — full reconciled-OPEN row dump (col-6 ≠ DONE, 169 rows)

```
row | phase | task-id | name | reconciled-status
1	A	A3-1 ledger DDL (remaini	—	—
1	A	A3-2 capped recovery ENG	Only live path that can mishandle real money	M
1	A	A3-2 live-path WIRING (f	Wires engine into computeSettlement behind SETTLEMEN	M
1	A	A3-2 GL — FALLBACK paire	Asset draw-down so books reconcile; verify-first pro	M
1	A	A3-3 shadow-run (old vs 	Evidence Jorge flips the flag on	M
2	A	AI-4 — Periods init: TRK	Books-safety foundation; close period gaps	S
3	A	AI-1b/AI-3b — CONFIRM cl	Already shipped; validate, don't rebuild	S
4	B	B1 — /inventory parts 40	Visibly broken live page; trivial; independent	XS
5	B	UNVERIFIED reconcile pas	Make tracker fully trustworthy	S
6	B	Commit tracker → this fi	Living, version-controlled doc	S
7	C	Diesel-code request type	Highest ops value; reuses B4 timeline + B6 inbox	M
8	C	B7 — Driver-inbox report	Preflighted; cross-request analytics; pure read	M
9	C	Repair request type	Net-new; links to maintenance WO	M
10	C	Expense request type	Net-new; links to expense-category map / GL	M
11	C	Load-update + Complaint 	Net-new, no GL; finishes inbox tabs	S
12	D	CA-05 register + CA-06 a	QBO-parity; CA-04 shipped	M
13	D	Bank reconcile-commit wr	Read+scoring exists; enable commit	M
14	D	Opening-balance entries 	Gated financial write	S
15	E	Stubs: ELD / Finance / I	UX honesty	varies
16	E	BLOCK-24 annual 1099 gen	Year-end tax	L
17	E	BLOCK-25 multi-entity co	Consolidated statements	L
18	E	BLOCK-01 depreciation (r	Largest financial gap left	L
19	E	USMCA master-data writes	Deferred until July 2026	M
25	Phase 3 — Screen Rebuild	T6	PC*MILER integration	CANCELLED
32	Phase 4 — Driver PWA	T11.15.7	Real email provider	PENDING
33	Phase 4 — Driver PWA	T11.15.8	Orphan-report office UI (45 driver identities + 5 md	PENDING
36	Phase 4 — Office Polish	T11.16.3	Email cron worker (needs T11.15.7)	PENDING
58	Phase 4 — Catalog	T11.21.6A	Fuel catalogs (7 catalogs)	PENDING
59	Phase 4 — Catalog	T11.21.7A	Accounting catalogs (5+ catalogs)	PENDING
60	Phase 4 — Catalog	T11.21.8A	Fleet catalogs (6 catalogs)	PENDING
65	Phase 4 — Cleanup	Cleanup-hyphen	Table CODE column hyphen rendering CSS fix	PENDING
66	Phase 4 — Cleanup	Cleanup-list-err…	List pages surface 500/error states	PENDING
69	Phase 4 — Cleanup	Cleanup-tests	Backend test infrastructure (0 tests vs 50+ endpoint	PENDING
70	Phase 4 — Cleanup	Cleanup-orphans	Triage 45 + 5 orphan identities/drivers	PENDING
71	Phase 4 — Cleanup	Cleanup-phone	Jorge phone off-by-one	PENDING
72	Phase 4 — Cleanup	Audit Action 1	FMCSA verify with real MC#	PENDING
83	Phase 4 — Cycles	DIR-G / P6-T1117…	DIR-F follow-up: 6 remaining modals + responsive swe	SUPERSEDED
84	Phase 4 — Cycles	DIR-H / P6-T1117…	Work Order PDFs + mandatory validation + R2 photo + 	SUPERSEDED
85	Phase 4 — Cycles	DIR-I	Customer email templates + invoice PDF auto-delivery	ON DECK
86	Phase 4 — Cycles	DIR-J	OCR parsing of rate confirmation PDFs	ON DECK
87	Phase 4 — Cycles	DIR-K	Server-side PDF generation via puppeteer	ON DECK
88	Phase 4 — Cycles	DIR-M	Backup/DR plan doc for Ch.11 DIP	ON DECK
89	Data Sovereignty (P1)	DS-1	Verify QBO mirror (T11.20.6.1) data integrity	SUPERSEDED
90	Data Sovereignty (P1)	DS-2	QBO mirror reconciliation report	SUPERSEDED
91	Data Sovereignty (P1)	DS-3	Insert integrations.samsara_config row for IH 35 Tra	SUPERSEDED
92	Data Sovereignty (P1)	DS-4	Samsara vehicle import (units T120-T177 or T178)	SUPERSEDED
93	Data Sovereignty (P1)	DS-5	Samsara driver import	SUPERSEDED
94	Data Sovereignty (P1)	DS-7	Verify production indicator changes to green	SUPERSEDED
96	Architecture	ARCH-2	Read ih35-db repo for Samsara reference code	NOT STARTED
97	Architecture	ARCH-4	Identify Samsara features in blueprint vs new from 2	NOT STARTED
182	Accounting Backbone C	Block-35	Chart of accounts main	NOT STARTED
184	Accounting Backbone C	Block-42	(Reserved — scope undefined)	NOT STARTED
195	Phase 6	P6-EDI	EDI 204/210/214 broker integration	PENDING
196	Phase 6	P6-Lanes	Load optimizer / lane pairing	PENDING
197	Phase 6	P6-Pricing	Pricing engine (dynamic quoting)	PENDING
198	Phase 6	P6-Recurring	Recurring invoices	PENDING
199	Phase 6	P6-CSA	CSA forecasting	PENDING
262	Phase 7 Mobile Apps	P7-Maint-Mobile	Maintenance mobile (mechanic app)	PENDING
263	Phase 7 Mobile Apps	P7-PWA-v2	Driver PWA v2 (push notifications, photo R2)	PENDING
264	Phase 7 Mobile Apps	P7-Disp-Mobile	Dispatcher mobile board	PENDING
265	Phase 8	P8-IFTA	IFTA quarterly automation	PENDING
266	Phase 8	P8-2290	Form 2290 (Heavy Highway Use Tax)	PENDING
267	Phase 8	P8-Drug	Drug random pool management	PENDING
268	Phase 8	P8-CSA-Inter	CSA intervention workflow	PENDING
279	DS Remediation	DS-REMEDIATE-10	Outbox infrastructure consolidation (post-series cle	DRAFTED
283	DS Remediation	DS-REMEDIATE-14	Fleet-reports-hub removal	DROPPED
332	Phase 8 — Sunday 5/31 Fo	RENDER-PREDEPLOY…	Investigate Render predeploy hook config for permane	PENDING
333	Phase 8 — Sunday 5/31 Fo	CLEANUP-VERIFY-D…	Delete duplicate scripts/verify-no-empty-string-uuid	PENDING
334	Phase 8 — Sunday 5/31 Fo	CURSOR-GH-AUTH-R…	Re-auth Cursor's gh CLI (HTTP 401 after #345 merge)	PENDING
335	Phase 8 — Sunday 5/31 Fo	LIVE-UI-VISUAL-V…	Walk /dispatch /drivers /maintenance to confirm 87 u	PENDING
351	Packet 2 Phase B	#05-Block-U	FUEL sub-nav routing fix (all 8 sub-tabs broken)	PENDING
352	Packet 2 Phase B	#06-Block-V	DISPATCH sub-nav routing fix (all 5 sub-tabs broken)	PENDING
353	Packet 1 Phase C	#07-Block-P	Best Bay Logsitcis customer name typo fix	PENDING
354	Packet 1 Phase C	#08-Block-A	Migration ledger cleanup (187 migrations drift)	PENDING
355	Packet 2 Phase C	#09-Block-AA	Seed-test-driver users archive (4 rows @seed.invalid	PENDING
357	Packet 1 Phase C	#11-Block-C	Trailer Profile page (with TYPE field)	PENDING
358	Packet 1 Phase C	#12-Block-D	Parts Catalog by brand research (Peterbilt/Freightli	PENDING
359	Packet 1 Phase C	#13-Block-E	Services Catalog + ETA engine (Samsara mileage + 12k	PENDING
360	Packet 1 Phase C	#14-Block-F	Reefer Hours tracking (Samsara 15-min polls)	PENDING
364	Packet 2 Phase D	#18-Block-AK	Bank Driver Escrow counter label clarify	PENDING
365	Packet 2 Phase D	#19-Block-X	HOME Record Expense modal consistency	PENDING
366	Packet 1 Phase E	#20-Block-G	Catalog stub purge — replace 34 stubs	PENDING
367	Packet 1 Phase E	#21-Block-H	URL routing normalize (underscore->hyphen 301)	PENDING
368	Packet 1 Phase E	#22-Block-I	LISTS hub header counts fix (6 of 8 wrong)	PENDING
369	Packet 1 Phase E	#23-Block-J	Equipment Types deduplication (DRY-VAN/DRY_VAN)	PENDING
370	Packet 1 Phase E	#24-Block-K	Classes data quality remediation	PENDING
371	Packet 2 Phase E	#25-Block-AL	Classes bulk-edit UI + COA cleanup (expanded K)	PENDING
372	Packet 1 Phase F	#26-Block-L	QBO bidirectional sync drift fix	PENDING
373	Packet 2 Phase F	#27-Block-AM	Loves card sync restore	PENDING
374	Packet 2 Phase F	#28-Block-AN	Plaid sync restore (root cause + display)	PENDING
375	Packet 1 Phase F	#29-Block-O	Customer/vendor default classifications cleanup	PENDING
376	Packet 1 Phase G	#30-Block-Q	DOCS write flow enable (Upload Document)	PENDING
377	Packet 2 Phase G	#31-Block-AP	MAINT Settings write enable (PM intervals + vendor d	PENDING
378	Packet 2 Phase G	#32-Block-AR	Factoring profile edit flow (11 empty fields)	PENDING
379	Packet 2 Phase G	#33-Block-Z	Driver CDL expires + Hire date fields backfill	PENDING
380	Packet 2 Phase G	#34-Block-AG	425C profile completeness guard	PENDING
381	Packet 2 Phase H	#35-Block-AQ	Driver Safety pseudo-user cleanup	PENDING
382	Packet 2 Phase H	#36-Block-AI	User LAST LOGIN populate on session create	PENDING
383	Packet 2 Phase H	#37-Block-AO	MAINT PM Countdown seed (87 units × 4 categories)	PENDING
384	Packet 2 Phase I	#38-Block-AF	Help articles backfill (8 modules missing)	PENDING
385	Packet 2 Phase I	#39-Block-AH	SAFETY dropdown groups verify (8-10 groups × ~21 sub	PENDING
386	Packet 2 Phase I	#40-Block-AS	Generic modal X close audit (all modals)	PENDING
387	Packet 2 Phase J	#41-MD-5-19-RECO…	Master Dispatch 5-19 cross-check vs shipped+Packet 1	PENDING
388	Packet 2 Phase J	#42-Block-AT	Comprehensive audit script + close 2026-06-01 ticket	PENDING
412	Faults Log v1	F6-PLUS	Additional faults to be captured by Jorge after Bloc	PENDING
424	Phase N — Tuesday Night 	#77-A15-WAVE1-GE…	Audit all *Modal.tsx for X close	PENDING
425	Phase N — Tuesday Night 	#78-A16-WAVE1-TE…	Archive TEST-DRIVER/TEST-CUSTOMER/seed-*	PENDING
427	Phase N — Tuesday Night 	#80-B13-WAVE1-FU…	Restore Loves card sync	PENDING
428	Phase N — Tuesday Night 	#81-B14-WAVE1-CU…	Clear Late-pay/Medium auto-applied defaults	PENDING
429	Phase N — Tuesday Night 	#82-B15-WAVE1-BA…	Restore Amex + Wells Fargo Plaid sync	PENDING
430	Phase N+ — Wave 2 (Wed P	#83-A17-WAVE2-DR…	Wire 5/5 drivers sub-catalogs	PENDING
431	Phase N+ — Wave 2 (Wed P	#84-A18-WAVE2-NA…	Wire 5/5 Names Master pools	PENDING
432	Phase N+ — Wave 2 (Wed P	#85-A19-WAVE2-RE…	Reefer hours tracking + WO auto-create	PENDING
433	Phase N+ — Wave 2 (Wed P	#86-B16-WAVE2-TR…	Trailer Profile + 5 statuses + TYPE	PENDING
434	Phase N+ — Wave 2 (Wed P	#87-B17-WAVE2-MA…	Parts catalog seeded 50+ by brand	PENDING
435	Phase N+ — Wave 2 (Wed P	#88-B18-WAVE2-SE…	Services catalog + Samsara ETAs + 12k mi/mo	PENDING
593	Tier2	BLOCK-11 Audit-C…	Mutation audit coverage	PENDING
597	Tier1.5	BLOCK-01 Depreci…	Fixed-asset depreciation schedule + posting	PENDING
599	Tier3	BLOCK-19 Audit-H…	Tamper-evident audit hash chain	PENDING
600	Tier3.5	BLOCK-24 1099-An…	Annual 1099 generation	PENDING
601	Tier3.5	BLOCK-25 Consoli…	Multi-entity financial consolidation	PENDING
607	AcctIntegrity	AI-1 Period-lock…	Snapshot lock exists (0218); CLOSED-PERIOD LEDGER-WR	PARTIAL
608	AcctIntegrity	AI-2 Recon cron	Recon services exist; scheduled wrapper TBD	PARTIAL
609	AcctIntegrity	AI-3 Daily probe…	Safety cron exists; FINANCIAL probes MISSING	PARTIAL
610	AcctIntegrity	AI-4 Periods ini…	Periods initialization	MISSING
613	QBO Parity	CA-05 Account re…	Per-account register (running balance ledger)	PENDING
614	QBO Parity	CA-06 Audit hist…	Account audit history tab	PENDING
626	Wave 0	BLOCK11 Audit-Co…	Mutation audit coverage	PENDING
634	Wave 1	BLOCK-01 Depreci…	Fixed-asset depreciation schedule + posting	PENDING
635	Wave 1	BLOCK-19 Audit-H…	Tamper-evident audit hash chain	PENDING
636	Wave 1	BLOCK-24 1099-An…	Annual 1099 generation	PENDING
637	Wave 1	BLOCK-25 Consoli…	Multi-entity financial consolidation	PENDING
638	Wave 1	BLOCK-06 Outbox-…	Confirm/add dead-letter recovery for outbox	NEEDS CONFIRM
639	Wave 2	AI-1b Closed-per…	The real gap	PENDING
640	Wave 2	AI-3b Financial …	Unbalanced JE / orphan bill / orphan payment in exis	PENDING
641	Wave 2	AI-4 Periods ini…	Bookkeeper-gated	PENDING
642	Wave 2	AI-2b Recon cron…	Confirm-or-add	PENDING
644	Wave 3	CA-05 Per-accoun…	Running balance ledger	PENDING
645	Wave 3	CA-06 Account au…	Audit history	PENDING
646	Wave 3	Block 8 Cross-Bo…	Customs + compliance gate	PENDING
648	Wave 3	Sidebar-V2 (23-a…	+driver-hub #5, +cash-flow #10, drivers→Driver Profi	PENDING
649	Wave 3	Block 16 Density…	Density + nav correction (preview-gated, last)	PENDING
656	Wave 4	Block E Services…	Samsara mi + 12k/mo — HIGH	PARTIAL
663	Wave 4	Block Q DOCS upl…	P1	PARTIAL
667	Wave 4	Block Z Driver C…	CSV — P2	PARTIAL
669	Wave 4	Block K/AL Class…	P2	PARTIAL
672	Wave 4	Block AO MAINT P…	Needs Block E — P2	PARTIAL
673	Wave 4	Block AF Help ar…	8 modules — P2	PARTIAL
677	Wave 4	Block P 'Best Ba…	P3	NOT-BUILT
680	Wave 4	QBO-INVOICE-BILL-PULL	spun out of Block L — future, NOT scoped	PARKED
681	Wave 5	Block N RLS cros…	Companion to BLOCK-10	PENDING
682	Wave 5	Block M Audit-lo…	Mutation routes — companion to BLOCK-11	PENDING
683	Wave 5	Block R Webhook-…	Outbox-aware (DLQ on fail)	PENDING
684	Wave 5	Block S Idempote…	Top write routes	PENDING
685	Wave 5	Block T Concurre…	(/api/safety/log probe pattern)	PENDING
686	Wave 5	Block W Rate-lim…	Companion to BLOCK-04	PENDING
687	Wave 5	Block X CORS loc…	Pin allowed origins from env	PENDING
688	Wave 5	Block Y Dependen…	Generate SBOM	PENDING
689	Wave 5	Block AD Backup/…	Doc + script — companion to TIER21	PENDING
690	Wave 5	Block AE Index/q…	Top-10 slow routes (analyze)	PENDING
691	Wave 5	Block AB Long-ru…	Cron + alert	PENDING
692	Wave 5	Block AC Worker …	Workers / outbox	PENDING
693	Wave 6	Daily anti-regre…	Loaded modules verify-* lane + financial probes	ONGOING
694	Wave 6	Smoke after each…	Mass-Run-V8 / mini lane	ONGOING
695	Wave 6	Re-snapshot week…	main HEAD + open-PR list + Tier29/Closure17/AI	ONGOING
835	Finance	#972	docs(finance): VOID-EVERYWHERE — cash\	
876	Insurance	INS-COVERAGE-ASSETS-VS-U	coverage-gap reads mdata.assets with mdata.units ids	PENDING (design-first)
877	Accounting	COA-ACCOUNTS-UNAUDITED	catalogs.accounts has no audit.row_changes capture; 	PENDING (design-first)
878	Security	SEC-PROD-APP-ROLE-BYPASS	prod app pool connects as neondb_owner, which bypass	PENDING (design-first)
```
