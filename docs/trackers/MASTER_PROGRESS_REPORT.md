# IH35-TMS — Master Progress Report (Reconciled, v26)

> **SOURCE OF TRUTH.** This Markdown file is the living tracker. The Excel export in [`exports/`](exports/) is generated from it — do not hand-edit the xlsx as the master.
> Generated **2026-06-13 13:01:33 CDT** by read-only repo + GitHub reconciliation.

## 🔒 UPDATE PROTOCOL (locked)

**Every future block's PR MUST update its own row's `Reconciled Status` (+ `Reconcile Note`) in this file, in the SAME PR.** The tracker therefore never drifts from `main`. No separate tracker-only commits; no self-merge — Jorge merges. When a block ships, flip its row to `DONE`, add the PR# + merge SHA to the note, and (if it was in §Next Blocks) drop it from that queue.

## Reconciliation snapshot

| Metric | v24 snapshot (2026-06-08) | LIVE now (2026-06-13) |
|---|---|---|
| main HEAD | `7490803c3` (#794) | `49638a7a` |
| Highest merged PR | #813 | #923 |
| Total merged PRs (GitHub) | 749 | 871 |
| Merged since #813 | — | 92 (#814→#923 range; 18 nums closed-unmerged/open) |

**Repo facts (what's in the tree now):** 448 migrations · 591 verify scripts · 455 backend route files · 426 frontend routes · 234 block-ready manifests.

**Old tracker got these wrong (listed pending — actually DONE):** AI-1b closed-period ledger write-lock (`posting-engine.service.ts:169-176`→`PERIOD_LOCKED`); BLOCK-19 audit hash-chain (`202606111051_w1a_event_log_immutable.sql`, #869); AI-3b financial probes (`verify-accounting-*`+`verify-bank-recon-*`, #816); P0 FUEL/DISPATCH sub-nav (#817/#818/#833); Wave-0 #794–#813 all merged.

**Why PR numbers jump:** GitHub uses one global counter across PRs **and** issues; gaps = closed-unmerged PRs, issues, or still-open PRs. In #814–#923: 92 merged, 18 gaps (#821, #830, #832, #835, #836, #837, #839, #841, #845, #848, #850, #852, #858, #876, #895, #903, #911, #912).

## Status summary (reconciled)

| Status | Count |
|---|---|
| DONE | 614 |
| PENDING | 136 |
| IN FLIGHT | 10 |
| SUPERSEDED | 6 |
| ON DECK | 4 |
| NOT STARTED | 4 |
| PARTIAL | 3 |
| ONGOING | 3 |
| CANCELLED | 1 |
| DISPATCHED | 1 |
| DRAFTED | 1 |
| DROPPED | 1 |
| MISSING | 1 |
| NEEDS CONFIRM | 1 |
| **TOTAL** | **787** |
| **DONE share** | **78%** |

## ▶ Next Blocks — recommended build order

Money-risk first → books-safety → cheap P0 → trust cleanup → features. (AI-1b/3b already shipped → *confirm*, not build.)

| Order | Wave | Block / Item | Why now | Risk | Effort | Depends on | Status |
|---|---|---|---|---|---|---|---|
| 1 | A | A3-1 ledger DDL (remaining_balance_cents + status) | — | — | — | — | ✅ DONE — merged #925 |
| 1 | A | A3-2 capped recovery ENGINE + 6 locked tests (pure) | Only live path that can mishandle real money | HIGH | M | A3-1 (done) | ✅ ENGINE merged #929 |
| 1 | A | A3-2 live-path WIRING (flag-gated, cash-advance only) + override DDL | Wires engine into computeSettlement behind SETTLEMENT_CAPPED_RECOVERY_ENABLED (default OFF) | HIGH | M | #929 | ✅ WIRING merged #930 (flag OFF = byte-identical) |
| 1 | A | A3-2 GL — FALLBACK paired JE at POST (Dr expense / Cr QBO-149) + post-time ledger | Asset draw-down so books reconcile; verify-first proved option-a (bill rewire) not clean | HIGH | M | #930 | ✅ merged #931 — recovery applied at POST (ledger + paired JE atomic); recovery=0→no JE; flag OFF until A3-3 |
| 1 | A | A3-3 shadow-run (old vs new compared, read-only) | Evidence Jorge flips the flag on | HIGH | M | A3-2 (#929/#930/#931) | 🟢 BUILT — PR #932 · GET /api/v1/payroll/settlement-shadow-run compares both paths per settlement, classifies (a)avoids-below-floor / (b)recovers-leaked / (c)unexplained-must-be-0. NO writes. Jorge reviews → flips the flag manually |
| 2 | A | AI-4 — Periods init: TRK + 2025 + H2-2026 + confirm flag in prod | Books-safety foundation; close period gaps | MED | S | none | ✅ SEED SHIPPED — PR #927 (gated; ops must enable PERIODS_INIT_ENABLED in prod) |
| 3 | A | AI-1b/AI-3b — CONFIRM closed-period lock + financial probes enforce | Already shipped; validate, don't rebuild | LOW | S | none | ✅ verify |
| 4 | B | B1 — /inventory parts 404 (repoint to /api/v1/maintenance/parts) | Visibly broken live page; trivial; independent | LOW-MED | XS | none | ✅ DONE — PR #926 |
| 5 | B | UNVERIFIED reconcile pass (DIR-G/H, BLOCK-11, CA-04, GAP-76, F3) | Make tracker fully trustworthy | LOW | S | none | ✅ DONE — PR #928 |
| 6 | B | Commit tracker → this file (Markdown) + xlsx export | Living, version-controlled doc | LOW | S | step 5 | THIS PR |
| 7 | C | Diesel-code request type (request→approve→inbox) | Highest ops value; reuses B4 timeline + B6 inbox | — | M | B4/B6 | ❌ empty tab |
| 8 | C | B7 — Driver-inbox reporting (resume; paused) | Preflighted; cross-request analytics; pure read | — | M | B4/B6 | PAUSED |
| 9 | C | Repair request type | Net-new; links to maintenance WO | — | M | B4/B6+WO | ❌ empty tab |
| 10 | C | Expense request type | Net-new; links to expense-category map / GL | — | M | B4/B6+Block-21 | ❌ empty tab |
| 11 | C | Load-update + Complaint request types | Net-new, no GL; finishes inbox tabs | — | S | B4/B6 | ❌ empty tabs |
| 12 | D | CA-05 register + CA-06 account audit history | QBO-parity; CA-04 shipped | LOW | M | CA-04 | PENDING |
| 13 | D | Bank reconcile-commit writes (D2) | Read+scoring exists; enable commit | MED | M | recon engine | 🟡 PARTIAL |
| 14 | D | Opening-balance entries (owner-entered) | Gated financial write | MED | S | AI-4 | PENDING |
| 15 | E | Stubs: ELD / Finance / Inventory pages — build or hide | UX honesty | LOW | varies | none | ❌ STUB |
| 16 | E | BLOCK-24 annual 1099 generation | Year-end tax | MED | L | vendor pmts | PENDING |
| 17 | E | BLOCK-25 multi-entity consolidation | Consolidated statements | MED | L | periods+entities | PENDING |
| 18 | E | BLOCK-01 depreciation (register+schedule+posting) | Largest financial gap left | MED | L | CoA | ❌ NOT BUILT |
| 19 | E | USMCA master-data writes / activation | Deferred until July 2026 | LOW | M | — | DEFERRED |
| — | F | DRIVER-ESCROW-LIABILITY-SUBACCOUNTS (research + design first) | Truth-in-leasing per-driver escrow accounting | MED | L | A3 series | ⏸ PARKED — auto-create a LIABILITY sub-account (driver's name) under the escrow control parent (verify exact parent name in LIVE QBO — 'Escrow' or 'Escrow 2026', do NOT guess). Escrow = driver's money (refundable on separation if no fines/damage). SEPARATE from A3 (liability vs QBO-149 asset). Preview-gated if it touches a locked page. |
| — | F | DRIVER-SUBACCOUNT-AUTO-PROVISION — ASSET side | Per-driver advance sub-account on hire | MED | M | A3 series | ✅ merged #933 · on driver create, auto-create "Driver Cash Advance- <Name>" under the canonical parent (resolved by NAME, never UUID); idempotent; best-effort. Live-CoA verified: catalogs.accounts is global=TRANSP chart; TRK has no parents; USMCA excluded. |
| — | F | DRIVER-SUBACCOUNT-AUTO-PROVISION — ESCROW side (STOP #1 resolved) | Per-driver escrow liability sub-account on hire | MED | M | #933 | 🟢 BUILT — PR #934 · DECISION #1 LOCKED: nest under UNPREFIXED "Damage Claim Escrow" (QBO-1150040187, Liability), NOT year-prefixed. Auto-create "Damage Claim Escrow- <Name>" in the SAME hire hook as the asset side; resolved by NAME+Liability (never UUID); idempotent; best-effort/non-fatal; TRANSP-scoped. BULK backfill still gated on STOP-DECISION #2. |

## Pending Queue (live, grouped)

| # | Item | Section | True Status | Why pending | What it needs |
|---|---|---|---|---|---|
| A1 | AI-4 periods init | Accounting/Periods | ✅ SEED SHIPPED (PR #927) | Seed extended to full coverage | DONE: TRANSP Jul–Dec 2026 + all 2025, TRK all 2025+2026 (portable code-resolved, generate_series, gated). Remaining ops step: enable PERIODS_INIT_ENABLED in prod (read-only prod flag check still pending) |
| A2 | BLOCK-01 depreciation | Accounting/Fixed Assets | NOT BUILT | No fixed-asset accounting | Asset register + schedule + monthly posting |
| A3 | Block-F settlement auto-deduct (capped ledger) | Driver-Finance | 🟢 ENGINE BUILT (PR #929) | A3-1 DDL merged (#925); A3-2 pure engine + 6 locked tests built | Live-path wiring (delete blunt), postSettlement GL draw-down to QBO-149, escrow floor policy, override DDL, and cutover are GATED — see A3-2 preflight-of-record for the 4 GUARD decisions; no real paycheck changes until A3-3 shadow-run |
| B1 | /inventory parts → 404 | Inventory | ✅ DONE (PR #926) | Page called a missing endpoint | FIXED: repointed Parts & Stock page + create drawer to the real /api/v1/maintenance/parts (single source of truth, frontend-only, field-mapped) |
| C1 | QBO prod credentials | QBO | ENV-BLOCKED | Intuit approval (P7-T4) | prod creds |
| C2 | Twilio/WhatsApp | Notifications | ENV-BLOCKED | Meta verification (P7-T3) | external approval |
| D2 | Bank reconcile-commit writes | Accounting | PARTIAL | Read done; commit gated | enable commit; confirm advance→bank-txn match |
| D5 | CA-05/CA-06 | QBO-Parity | PENDING | After CA-04 | per-account ledger + audit tab |
| E1 | /eld + 5 tabs | ELD | STUB | No integration | wire Samsara ELD or remove |
| E2 | /finance ×3 | Finance | STUB | Prose placeholders | build or hide |
| E5 | /admin/integrity | Admin | STUB | Backend unshipped | register checks endpoint |

## Net-new driver-request types (reuse B4/B6)

| Candidate | Today | Reuses | Net-new needed | GL? |
|---|---|---|---|---|
| diesel-code | empty tab | B4 spine + B6 inbox + cascade-preview | table, submit endpoint, approve handler, PWA form | Yes |
| repair | empty tab | same | + links to maintenance WO | Yes |
| expense | empty tab | same | + expense-category map | Yes |
| load-update | empty tab | B4/B6 | table + approve | No |
| complaint | empty tab | B4/B6 | table + routing | No |

## Duplicate task clusters

| Cluster | Rows (in All Tasks) | Note |
|---|---|---|
| A17 | #482, #484, #485, #492 | 4 occurrences — keep #482 |
| B21 | #491, #496, #500 | 3 occurrences — keep #491 |
| P5T11 | #118, #127 | 2 occurrences — keep #118 |
| P5T13 | #119, #129 | 2 occurrences — keep #119 |
| A15 | #477, #516 | 2 occurrences — keep #477 |
| P8AUDITBACKENDVERSION | #343, #540 | 2 occurrences — keep #343 |
| P8AUDITNESTEDMODALS | #337, #541 | 2 occurrences — keep #337 |
| P8AUDITELDREDIRECT | #340, #543 | 2 occurrences — keep #340 |
| P8AUDITDOCSREDIRECT | #341, #546 | 2 occurrences — keep #341 |
| P8AUDITQBOARCHIVE | #342, #547 | 2 occurrences — keep #342 |
| P8AUDITTESTDATA | #339, #548 | 2 occurrences — keep #339 |
| P8AUDITUNDEFINEDLEGEND | #344, #549 | 2 occurrences — keep #344 |
| P8AUDITPRODSTUBS | #338, #550 | 2 occurrences — keep #338 |
| P8AUDITKPIDRIFTS | #345, #558 | 2 occurrences — keep #345 |
| P5T5 | #122, #561 | 2 occurrences — keep #122 |
| P5T8 | #125, #562 | 2 occurrences — keep #125 |
| BLOCK09E2EPATHS | #585, #622 | 2 occurrences — keep #585 |
| BLOCK05CIRCUITBREAKERS | #584, #623 | 2 occurrences — keep #584 |
| BLOCK11AUDITCOVERAGE | #593, #626 | 2 occurrences — keep #593 |
| BLOCK10RLSTESTGATE | #592, #627 | 2 occurrences — keep #592 |
| CLOSURE13USMCAACTIVATION | #605, #628 | 2 occurrences — keep #605 |
| GAP76DEADHEADOPTIMIZER | #615, #633 | 2 occurrences — keep #615 |
| BLOCK01DEPRECIATION | #597, #634 | 2 occurrences — keep #597 |
| BLOCK19AUDITHASH | #599, #635 | 2 occurrences — keep #599 |
| BLOCK241099ANNUAL | #600, #636 | 2 occurrences — keep #600 |
| BLOCK25CONSOLIDATION | #601, #637 | 2 occurrences — keep #601 |
| AI4PERIODSINITJANJUN2026 | #610, #641 | 2 occurrences — keep #610 |
| CA04NEWEDITDRAWER | #612, #643 | 2 occurrences — keep #612 |

## All Tasks — complete reconciled record

Originals preserved; 92 new PRs folded in; `#` sequential; duplicates flagged.

| # | Phase/Section | Task ID/PR | Task Name | Orig Status | Reconciled | Merged | Dup? | Notes / Evidence |
|---|---|---|---|---|---|---|---|---|
| | **▼ Phase 1 — Foundation** | | | | | | | |
| 1 | Phase 1 — Foundation | P1-ALL | Identity + auth + 2FA, audit log, outbox, multi-tenant org, … | DONE | DONE |  |  | Closed pre-May 8 at commit 999a114 |
| | **▼ Phase 2 — Core Operations** | | | | | | | |
| 2 | Phase 2 — Core Operations | P2-ALL | Catalogs, maint v1, fuel v1, banking shell, factoring views,… | DONE | DONE |  |  | Closed pre-May 8 |
| | **▼ Phase 3 — Screen Rebuilds** | | | | | | | |
| 3 | Phase 3 — Screen Rebuilds | T11.5 | Dispatch rebuild + gates | DONE | DONE |  |  | List-table, Driver Status column, Book Load modal |
| 4 | Phase 3 — Screen Rebuilds | T11.5.1 | Dispatch follow-up (authorization gates) | DONE | DONE |  |  | WF-044 advisory, WF-050 hard block, WF-038 HOS |
| 5 | Phase 3 — Screen Rebuilds | T11.6 | Maintenance rebuild | DONE | DONE |  |  | 5-button action row + 8 sub-tabs |
| 6 | Phase 3 — Screen Rebuilds | T11.6.1 | Maintenance follow-up A (WO Format V2) | DONE | DONE |  |  | V5 vendor invoice suffix, parts inventory |
| 7 | Phase 3 — Screen Rebuilds | T11.6.2 | Maintenance follow-up B (Arriving Soon) | DONE | DONE |  |  | PM due priority queue |
| 8 | Phase 3 — Screen Rebuilds | T11.7 | Settlement screen | DONE | DONE |  |  | Presettlement → final → voided; void requires Owner |
| 9 | Phase 3 — Screen Rebuilds | T11.8 | Fuel planner | DONE | DONE |  |  | Loves daily price upload, recommendation vs actual |
| 10 | Phase 3 — Screen Rebuilds | T11.9 | Banking rebuild | DONE | DONE |  |  | 6 account tiles, BOA/IBC/Faro/escrow |
| 11 | Phase 3 — Screen Rebuilds | T11.10 | Safety + liabilities | DONE | DONE |  |  |  |
| 12 | Phase 3 — Screen Rebuilds | T11.11 | Cash advance | DONE | DONE |  |  |  |
| 13 | Phase 3 — Screen Rebuilds | T11.12 | Factoring detail | DONE | DONE |  |  |  |
| 14 | Phase 3 — Screen Rebuilds | T11.13 | Form 425C | DONE | DONE |  |  | Monthly Operating Report for Ch.11 |
| 15 | Phase 3 — Screen Rebuilds | T11.14 | Lists hub | DONE | DONE |  |  |  |
| 16 | Phase 3 — Screen Rebuilds | T11.16 | Reports module foundation | DONE | DONE |  |  |  |
| 17 | Phase 3 — Screen Rebuilds | T11.17 | Universal cost box base | DONE | DONE |  |  |  |
| 18 | Phase 3 — Screen Rebuilds | T11.17.1A | Cost box variant A | DONE | DONE |  |  |  |
| 19 | Phase 3 — Screen Rebuilds | T11.17.1B | Cost box variant B | DONE | DONE |  |  |  |
| 20 | Phase 3 — Screen Rebuilds | T11.17.2 | Cost box rollup | DONE | DONE |  |  |  |
| 21 | Phase 3 — Screen Rebuilds | T11.17.3 | Drivers detail expansion | DONE | DONE |  |  |  |
| 22 | Phase 3 — Screen Rebuilds | T11.17.5 | Customers detail expansion | DONE | DONE |  |  |  |
| 23 | Phase 3 — Screen Rebuilds | T11.17.6 | Final detail polish | DONE | DONE |  |  |  |
| 24 | Phase 3 — Screen Rebuilds | T11.18 | Forms standardization | DONE | DONE |  |  | Closed at ac31b3a |
| 25 | Phase 3 — Screen Rebuilds | T6 | PC*MILER integration | CANCELLED | CANCELLED |  |  | Cancelled. Routing engine decision pending |
| | **▼ Phase 4 — Driver PWA** | | | | | | | |
| 26 | Phase 4 — Driver PWA | T11.15.1 | PWA shell (4-tab nav, i18n EN+ES, icons, PendingSyncBar) | DONE | DONE |  |  | commit ddb228e |
| 27 | Phase 4 — Driver PWA | T11.15.2 | Today/LoadDetail/StopAction/Acceptance + WF-051 geofence + s… | DONE | DONE |  |  | commit 0415e3d (WF-051 shipped at 25-mile; spec is 250 FEET — corrected via CAP-3 PR #213) |
| 28 | Phase 4 — Driver PWA | T11.15.3 | DVIR (49 CFR §392.7), HOS, Earnings G23, IncidentReport WF-0… | DONE | DONE |  |  | commit 34c5f4b |
| 29 | Phase 4 — Driver PWA | T11.15.4 | Backend reapply (REVERTED) | DONE | DONE |  |  | 37c78a7 → REVERTED 8d6b7f0 |
| 30 | Phase 4 — Driver PWA | T11.15.5 | Backend reapply + PWA cleanup | DONE | DONE |  |  | commit a067a40 |
| 31 | Phase 4 — Driver PWA | T11.15.6 | Drivers-only role gate + multi-credential login | DONE | DONE |  |  | commit 8e8959f |
| 32 | Phase 4 — Driver PWA | T11.15.7 | Real email provider | PENDING | PENDING |  |  | BLOCKS T11.16.3 |
| 33 | Phase 4 — Driver PWA | T11.15.8 | Orphan-report office UI (45 driver identities + 5 mdata.driv… | PENDING | PENDING |  |  |  |
| | **▼ Phase 4 — Office Polish** | | | | | | | |
| 34 | Phase 4 — Office Polish | T11.16.1 | Reports backend wiring (5 real + 3 stub + 18 cadences) | DONE | DONE |  |  | commit ed05dd9 |
| 35 | Phase 4 — Office Polish | T11.16.2 | Report runner UI + CSV export | DONE | DONE |  |  | commit 6ffbdb7 |
| 36 | Phase 4 — Office Polish | T11.16.3 | Email cron worker (needs T11.15.7) | PENDING | PENDING |  |  |  |
| 37 | Phase 4 — Office Polish | T11.17.7 | Customer detail backend (Contacts/Billing/Lanes + 0059) | DONE | DONE |  |  | commit 77d00d7 |
| 38 | Phase 4 — Office Polish | T11.18-HOME | Office HOME page real data | DONE | DONE |  |  |  |
| 39 | Phase 4 — Office Polish | T11.19 | HOME page polish (after T11.18) | PENDING | DONE |  |  | / matched merged PR by Task-ID |
| | **▼ Phase 4 — Accounting (T11.20)** | | | | | | | |
| 40 | Phase 4 — Accounting (T11.… | T11.20.1 | Schema (5 tables + view + 2 triggers + RLS) | DONE | DONE |  |  | commit 49ed8d1 / migration 0060 |
| 41 | Phase 4 — Accounting (T11.… | T11.20.2 | Invoice generation flow | DONE | DONE |  |  | commit 4bf9e57 |
| 42 | Phase 4 — Accounting (T11.… | T11.20.3 | Payment recording | DONE | DONE |  |  | commit 4cc8721 |
| 43 | Phase 4 — Accounting (T11.… | T11.20.4 | AR aging real numbers | DONE | DONE |  |  | commit e009196 |
| 44 | Phase 4 — Accounting (T11.… | T11.20.5 | Factoring tracking | DONE | DONE |  |  | commit 2fcb3eb / migration 0061 |
| 45 | Phase 4 — Accounting (T11.… | T11.20.6.1 | QBO master-data read-only mirror Phase 1 | DONE | DONE |  |  | DIR-B 2026-05-13, migration 0142 |
| 46 | Phase 4 — Accounting (T11.… | T11.20.6.2 | QBO write-back umbrella (all 6 cuts CLOSED) | DONE | DONE |  |  | All 6 cuts merged: customers/vendors/items/accounts/invoices/bills |
| 47 | Phase 4 — Accounting (T11.… | T11.20.6.2.1 | QBO write-back customers | DONE | DONE |  |  | PR #192 (merge 9013268). Cut 1 |
| 48 | Phase 4 — Accounting (T11.… | T11.20.6.2.2 | QBO write-back vendors | DONE | DONE |  |  | PR #194 (merge a54dac3). Cut 2 |
| 49 | Phase 4 — Accounting (T11.… | T11.20.6.2.3 | QBO write-back items/products | DONE | DONE |  |  | PR #195 (merge 08c3d10). Cut 3 |
| 50 | Phase 4 — Accounting (T11.… | T11.20.6.2.4 | QBO write-back accounts (chart of accounts) | DONE | DONE |  |  | PR #197 (merge baca2f4). Cut 4 |
| 51 | Phase 4 — Accounting (T11.… | T11.20.6.2.5 | QBO write-back invoices | DONE | DONE |  |  | PR #199. Cut 5 with mdata.qbo_invoices migration |
| 52 | Phase 4 — Accounting (T11.… | T11.20.6.2.6 | QBO write-back bills | DONE | DONE |  |  | PR #201 (merge b006f01). Cut 6 — closes T11.20.6.2 with mdata.qbo_bills migration |
| | **▼ Phase 4 — Catalog** | | | | | | | |
| 53 | Phase 4 — Catalog | T11.21.0 | Catalog seed data migration 0062 (~555 rows) | DONE | DONE |  |  | commit 6b6abe6 |
| 54 | Phase 4 — Catalog | T11.21.2A | Safety catalogs (3 catalogs, legacy schemas) | DONE | DONE |  |  | commit 264b24e |
| 55 | Phase 4 — Catalog | T11.21.3A | Dispatch catalogs (4 catalogs, factory pattern) | DONE | DONE |  |  | commit c2ff851 |
| 56 | Phase 4 — Catalog | T11.21.4A | Driver catalogs (4 catalogs) | PENDING | DONE |  |  | Next up  / matched merged PR by Task-ID |
| 57 | Phase 4 — Catalog | T11.21.5A | Maintenance catalogs (8 catalogs) | DONE | DONE |  |  |  |
| 58 | Phase 4 — Catalog | T11.21.6A | Fuel catalogs (7 catalogs) | PENDING | PENDING |  |  |  |
| 59 | Phase 4 — Catalog | T11.21.7A | Accounting catalogs (5+ catalogs) | PENDING | PENDING |  |  |  |
| 60 | Phase 4 — Catalog | T11.21.8A | Fleet catalogs (6 catalogs) | PENDING | PENDING |  |  |  |
| | **▼ Phase 4 — Cleanup** | | | | | | | |
| 61 | Phase 4 — Cleanup | Cleanup-1 | 0041 idempotency + render preDeployCommand + 0051/0052 view … | DONE | DONE |  |  | commit d811d88 |
| 62 | Phase 4 — Cleanup | Cleanup-2 | 5 UX bug fixes | DONE | DONE |  |  | commit 351136e (distinct from Dispatch-4 CLEANUP-2 PR #321) |
| 63 | Phase 4 — Cleanup | Cleanup-3 | Permanent grants migration 0065 + developer doc | IN FLIGHT | DONE |  |  | / matched merged PR by Task-ID |
| 64 | Phase 4 — Cleanup | Cleanup-hub | Lists hub domain map regression fix + wire new catalogs | DONE | DONE |  |  |  |
| 65 | Phase 4 — Cleanup | Cleanup-hyphen | Table CODE column hyphen rendering CSS fix | PENDING | PENDING |  |  |  |
| 66 | Phase 4 — Cleanup | Cleanup-list-err… | List pages surface 500/error states | PENDING | PENDING |  |  |  |
| 67 | Phase 4 — Cleanup | Cleanup-attentio… | Today's Attention List → real data | DONE | DONE |  |  | PR #179 (A2-1). verify-home-attention-tenant-scope.mjs CI guard |
| 68 | Phase 4 — Cleanup | Cleanup-fleet-sn… | Fleet Snapshot card scope to operating company | DONE | DONE |  | samePR#179→#67 | PR #179 (A2-1). verify-fleet-snapshot-tenant-scope.mjs CI guard |
| 69 | Phase 4 — Cleanup | Cleanup-tests | Backend test infrastructure (0 tests vs 50+ endpoints) | PENDING | PENDING |  |  | Pre-existing failing suites surfaced 2026-05-23 |
| 70 | Phase 4 — Cleanup | Cleanup-orphans | Triage 45 + 5 orphan identities/drivers | PENDING | PENDING |  |  |  |
| 71 | Phase 4 — Cleanup | Cleanup-phone | Jorge phone off-by-one | PENDING | PENDING |  |  |  |
| 72 | Phase 4 — Cleanup | Audit Action 1 | FMCSA verify with real MC# | PENDING | PENDING |  |  |  |
| 73 | Phase 4 — Cleanup | Cleanup-legal-do… | Legal + Docs + Users tenant-scope; Help confirmed frontend-o… | DONE | DONE |  |  | PR #184 (A1-3). 3 CI guards |
| | **▼ Phase 4 — Hotfixes** | | | | | | | |
| 74 | Phase 4 — Hotfixes | P4-HOTFIX-156 | QBO sync health column-mismatch fix (Bug A read + Bug B writ… | DONE | DONE |  |  | PR #156 (merge 1dc50a9). Both bugs fixed. Diagnosis doc at 42fd172 |
| | **▼ Phase 4 — Cycles** | | | | | | | |
| 75 | Phase 4 — Cycles | Cycle3-Wizard | Book Load V4 wizard | DONE | DONE |  |  | commit eaf4403, migration 0140 |
| 76 | Phase 4 — Cycles | Cycle3-PDFs | 3 monochrome PDF rendering routes | DONE | DONE |  |  | commits 2e2112f + 7f425207 |
| 77 | Phase 4 — Cycles | DIR-A / P6-T1117… | driver_finance.driver_bills proper table separation + RLS | DONE | DONE |  |  | commit 6af0eae, migration 0141 |
| 78 | Phase 4 — Cycles | DIR-B / P6-T1117… | QBO master-data mirror Phase 1 (read-only) | DONE | DONE |  |  | PR #26, migration 0142 |
| 79 | Phase 4 — Cycles | DIR-C / P6-T1117… | Form validation pattern sweep | DONE | DONE |  |  | commits 5e73c64 + b2c0d72 |
| 80 | Phase 4 — Cycles | DIR-D / P6-T1117… | Lists routing + 40 concrete catalog routes + segment tabs | DONE | DONE |  |  | commit 90b6bdd |
| 81 | Phase 4 — Cycles | DIR-E / P6-T1117… | Load-bookended settlement + expense-to-load + QBO sync obser… | DONE | DONE |  | samePR#26→#78 | PR #26, migrations 0143+0144 |
| 82 | Phase 4 — Cycles | DIR-F / P6-T1117… | Responsive shell + ESC modal + SaveDropdown + Users invite (… | DONE | DONE |  |  | PR #25 → 7b54bd2 |
| 83 | Phase 4 — Cycles | DIR-G / P6-T1117… | DIR-F follow-up: 6 remaining modals + responsive sweep + tes… | IN FLIGHT | SUPERSEDED |  |  | DIR-G modals/responsive delivered via #462 (nested-modal), #398/#437 (A15 modal audit) — no standalone DIR-G PR |
| 84 | Phase 4 — Cycles | DIR-H / P6-T1117… | Work Order PDFs + mandatory validation + R2 photo + vendor b… | DISPATCHED | SUPERSEDED |  |  | DIR-H WO-PDF/validation/AP-bill delivered via #262 (WO PDF path), #272 (WO modal), #312 (WO→AP) — no standalone DIR-H PR |
| 85 | Phase 4 — Cycles | DIR-I | Customer email templates + invoice PDF auto-delivery | ON DECK | ON DECK |  |  | still pending — no merged PR (DIR-I) |
| 86 | Phase 4 — Cycles | DIR-J | OCR parsing of rate confirmation PDFs | ON DECK | ON DECK |  |  | still pending — no merged PR (DIR-J) |
| 87 | Phase 4 — Cycles | DIR-K | Server-side PDF generation via puppeteer | ON DECK | ON DECK |  |  | still pending — no merged PR (DIR-K) |
| 88 | Phase 4 — Cycles | DIR-M | Backup/DR plan doc for Ch.11 DIP | ON DECK | ON DECK |  |  | still pending — no merged PR (DIR-M) |
| | **▼ Data Sovereignty (P1)** | | | | | | | |
| 89 | Data Sovereignty (P1) | DS-1 | Verify QBO mirror (T11.20.6.1) data integrity | SUPERSEDED | SUPERSEDED |  |  | Superseded 2026-05-21. See DS Remediation |
| 90 | Data Sovereignty (P1) | DS-2 | QBO mirror reconciliation report | SUPERSEDED | SUPERSEDED |  |  | Superseded 2026-05-21 |
| 91 | Data Sovereignty (P1) | DS-3 | Insert integrations.samsara_config row for IH 35 Transportat… | SUPERSEDED | SUPERSEDED |  |  | Superseded 2026-05-21 |
| 92 | Data Sovereignty (P1) | DS-4 | Samsara vehicle import (units T120-T177 or T178) | SUPERSEDED | SUPERSEDED |  |  | Done via DS-REM-17 (PR #187) |
| 93 | Data Sovereignty (P1) | DS-5 | Samsara driver import | SUPERSEDED | SUPERSEDED |  | samePR#187→#92 | Done via DS-REM-17 (PR #187) |
| 94 | Data Sovereignty (P1) | DS-7 | Verify production indicator changes to green | SUPERSEDED | SUPERSEDED |  |  | Superseded 2026-05-21 |
| | **▼ Architecture** | | | | | | | |
| 95 | Architecture | ARCH-1 | ih35-db (old software) reactivation | DONE | DONE |  |  | Service srv-d7chi5rbc2fs73euhivg. Resumed 2026-05-20 |
| 96 | Architecture | ARCH-2 | Read ih35-db repo for Samsara reference code | NOT STARTED | NOT STARTED |  |  | Document what to port vs redesign |
| 97 | Architecture | ARCH-4 | Identify Samsara features in blueprint vs new from 2026-05-2… | NOT STARTED | NOT STARTED |  |  | Read docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md |
| | **▼ Samsara Capabilities** | | | | | | | |
| 98 | Samsara Capabilities | CAP-1 | Real-time GPS tracking on every active load | DONE | DONE |  |  | PR #234 |
| 99 | Samsara Capabilities | CAP-2 | Auto-create geofences on dispatch (pickup + delivery + fuel) | DONE | DONE |  |  | PR #218. Consumes CAP-GEOFENCE-FOUNDATION (#207) |
| 100 | Samsara Capabilities | CAP-3 | 250-foot arrival prompt (driver alert to check in) | DONE | DONE |  | samePR#213→#27 | PR #213. Consumes CAP-9 pairing |
| 101 | Samsara Capabilities | CAP-4 | Auto-status switching on vehicle movement | DONE | DONE |  |  | PR #223. Suggest-only |
| 102 | Samsara Capabilities | CAP-5 | Dispatch board on-track / behind / delayed pills | DONE | DONE |  |  | PR #215 |
| 103 | Samsara Capabilities | CAP-6 | HOS-driven fuel stop calculation in fuel planner | DONE | DONE |  |  | PR #220 |
| 104 | Samsara Capabilities | CAP-7 | Maintenance prediction from live odometer | DONE | DONE |  |  | PR #221 |
| 105 | Samsara Capabilities | CAP-8 | Engine diagnostic fault → auto work order creation | DONE | DONE |  |  | PR #229. 7-day dedup |
| 106 | Samsara Capabilities | CAP-9 | Vehicle-driver pairing-at-time-of-event tracking | DONE | DONE |  |  | PR #210. Foundation for CAP-3/5/13 |
| 107 | Samsara Capabilities | CAP-10 | Driver scoring page in safety module | DONE | DONE |  |  | PR #230 |
| 108 | Samsara Capabilities | CAP-11 | Dashcam integration (in-cab + road-facing) | DONE | DONE |  |  | PR #231. RBAC-restricted |
| 109 | Samsara Capabilities | CAP-12 | DVIR integrated into safety (49 CFR §392.7) | DONE | DONE |  |  | T11.15.3 at 34c5f4b |
| 110 | Samsara Capabilities | CAP-13 | DOT inspection station geofence dwell tracking | DONE | DONE |  |  | PR #224 + #207 foundation |
| 111 | Samsara Capabilities | CAP-15 | Samsara driver ↔ QBO vendor mapping integrity | DONE | DONE |  |  | PR #189 (detection) + #193 (resolution, e5d01c0) |
| 112 | Samsara Capabilities | CAP-HOS-FOUNDATI… | HOS duty status events + FMCSA clock service | DONE | DONE |  |  | PR #204 |
| 113 | Samsara Capabilities | CAP-GEOFENCE-FOU… | Generic geofencing infrastructure | DONE | DONE |  |  | PR #207 |
| 114 | Samsara Capabilities | CAP-16 | Geofence breach alerts | DONE | DONE |  |  | PR #243 |
| 115 | Samsara Capabilities | CAP-AGGREGATE | Driver day-summary card | DONE | DONE |  |  | PR #235 |
| 116 | Samsara Capabilities | CAP-HEATMAP | Position heatmap layer on dispatch map | DONE | DONE |  |  | PR #236 |
| 117 | Samsara Capabilities | CAP-FUEL-CARD | Match fuel-card transactions to GPS at fuel stop | DONE | DONE |  |  | PR #237 |
| | **▼ Phase 5A** | | | | | | | |
| 118 | Phase 5A | P5-T1.1 | Banking Schema (4 tables + RLS) | DONE | DONE |  |  | commit 071b245 |
| | **▼ Phase 5B** | | | | | | | |
| 119 | Phase 5B | P5-T1.3 | Plaid Frontend Link + Daily Cron | PENDING | DONE |  |  | / matched merged PR by Task-ID |
| | **▼ Phase 5C** | | | | | | | |
| 120 | Phase 5C | P5-T2 | Reconciliation Workspace UI | PENDING | DONE |  |  | / matched merged PR by Task-ID |
| 121 | Phase 5C | P5-T3 | QBO Sync state machine (queue + retry + Class auto-derive) | DONE | DONE |  |  | PR #191 (4002c41) |
| 122 | Phase 5C | P5-T5 | Driver settlement auto-pay | DONE | DONE |  |  | DIR-E foundation done · PR #483 · merged + LIVE 2026-06-04 |
| | **▼ Phase 5D** | | | | | | | |
| 123 | Phase 5D | P5-T6 | Banking Transfer between accounts | PENDING | DONE |  |  | Jorge G11  / matched merged PR by Task-ID |
| 124 | Phase 5D | P5-T7 | Record Credit Card Payment | PENDING | DONE |  |  | Jorge G11  / matched merged PR by Task-ID |
| 125 | Phase 5D | P5-T8 | Bills-with-balance dropdown for AP payment | DONE | DONE |  |  | Jorge G12 · PR #484 · merged + LIVE 2026-06-04 |
| 126 | Phase 5D | P5-T9 | Bill payment sub-rows for partial payments | PENDING | DONE |  |  | Jorge G12  / matched merged PR by Task-ID |
| 127 | Phase 5D | P5-T11 | Manual JE 2-step modal | PENDING | DONE |  | DUP→#118 | / matched merged PR by Task-ID |
| | **▼ Phase 5E** | | | | | | | |
| 128 | Phase 5E | P5-T12 | Auto-deduct on load abandonment | PENDING | DONE |  |  | Jorge G8  / matched merged PR by Task-ID |
| 129 | Phase 5E | P5-T13 | Settlement disputes workflow | PENDING | DONE |  | DUP→#119 | Jorge G38  / matched merged PR by Task-ID |
| 130 | Phase 5E | P5-T14 | Team drivers + 50/50 split | PENDING | DONE |  |  | Jorge G40  / matched merged PR by Task-ID |
| 131 | Phase 5E | P5-T16 | Severe Repair / OOS estimate generation | PENDING | DONE |  |  | Jorge G20  / matched merged PR by Task-ID |
| | **▼ Phase 5F** | | | | | | | |
| 132 | Phase 5F | P5-T17 | Roadservice as 3rd R&M bucket | PENDING | DONE |  |  | Jorge G10  / matched merged PR by Task-ID |
| 133 | Phase 5F | P5-T18 | Safety dashboard 7-10 day active filter | PENDING | DONE |  |  | Jorge G25  / matched merged PR by Task-ID |
| 134 | Phase 5F | P5-T19 | Assignments quicksave on truck/trailer click | PENDING | DONE |  |  | Jorge G26  / matched merged PR by Task-ID |
| 135 | Phase 5F | P5-T21 | Equipment dual-confirmation transfer (WF-047) | PENDING | DONE |  |  | Jorge G14  / matched merged PR by Task-ID |
| | **▼ Phase 5G** | | | | | | | |
| 136 | Phase 5G | P5-T22 | Faro factoring CSV import | PENDING | DONE |  |  | / matched merged PR by Task-ID |
| 137 | Phase 5G | P5-T24 | TRK QBO migration runbook execution | PENDING | DONE |  |  | Date passed, needs reschedule  / matched merged PR by Task-ID |
| | **▼ Phase 5H** | | | | | | | |
| 138 | Phase 5H | P5-T25 | TMS↔QBO Payroll integration (Option B locked) | ON DECK | DONE |  |  | Cycle 5 post-MVP  / matched merged PR by Task-ID |
| | **▼ Accounting Backbone A** | | | | | | | |
| 139 | Accounting Backbone A | Block-1 | Accounting sub-nav route parity | DONE | DONE |  |  | A Backbone |
| 140 | Accounting Backbone A | Block-2 | Accounting backbone spec document | DONE | DONE |  |  | A Backbone |
| 141 | Accounting Backbone A | Block-3 | JE line contract decision | DONE | DONE |  |  | A Backbone |
| 142 | Accounting Backbone A | Block-4 | Posting backbone schema — migration 0195 | DONE | DONE |  |  | A Backbone |
| 143 | Accounting Backbone A | Block-5 | Posting engine MVP design document | DONE | DONE |  |  | A Backbone |
| 144 | Accounting Backbone A | Block-6 | Posting engine MVP deferred-decisions document | DONE | DONE |  |  | A Backbone |
| 145 | Accounting Backbone A | Block-7 | Posting engine MVP code | DONE | DONE |  |  | A Backbone |
| 146 | Accounting Backbone A | Block-8 | Backlog backfill | DONE | DONE |  |  | No-op: ledger empty |
| 147 | Accounting Backbone A | Block-9 | First live posting verification | DONE | DONE |  |  | PR #136 docs |
| 148 | Accounting Backbone A | Block-9-FIX-1 | Units-create INSERT arity | DONE | DONE |  |  | commit debd5cd |
| 149 | Accounting Backbone A | Block-9-FIX-2 | Driver-create preferred_language | DONE | DONE |  |  | PR #134, migration 0197 |
| 150 | Accounting Backbone A | Block-9-FIX-3 | Applied 0197 + seeded drivers/customers/vendors | DONE | DONE |  |  |  |
| 151 | Accounting Backbone A | Block-9-FIX-4 | Driver company scope | DONE | DONE |  |  | PR #135 (17d98f5) |
| 152 | Accounting Backbone A | Block-9-FIX-5 | Pre-flight A-F audit (77 findings) | DONE | DONE |  |  |  |
| 153 | Accounting Backbone A | Block-10 | Trial balance ledger balance proof | DONE | DONE |  |  | PR #141 |
| 154 | Accounting Backbone A | Block-11 | Accounting period management | DONE | DONE |  |  | PR #142 |
| | **▼ Accounting Backbone B** | | | | | | | |
| 155 | Accounting Backbone B | Block-12 | Profit & Loss statement | DONE | DONE |  |  | PR #143 |
| 156 | Accounting Backbone B | Block-13 | Balance Sheet | DONE | DONE |  |  | PR #144 |
| 157 | Accounting Backbone B | Block-14 | Cash Flow statement | DONE | DONE |  |  | PR #145 |
| 158 | Accounting Backbone B | Block-15 | Accounts Receivable aging | DONE | DONE |  |  | PR #147 |
| 159 | Accounting Backbone B | Block-16 | Accounts Payable aging | DONE | DONE |  |  | PR #148 |
| 160 | Accounting Backbone B | Block-17 | Period selector / date-range engine | DONE | DONE |  |  | PR #149 |
| 161 | Accounting Backbone B | Block-18 | Statement export | DONE | DONE |  |  | PR #150 + #151 + #152 |
| 162 | Accounting Backbone B | Block-19 | Accounting reports UI | DONE | DONE |  |  | PR #155 (49c7059) |
| | **▼ Accounting Backbone C** | | | | | | | |
| 163 | Accounting Backbone C | Block-20 | Expense posting engine — trilogy | DONE | DONE |  |  | Trilogy: 20.1+20.2+20.3 ALL DONE. CPA/bookkeeper-approved 2026-05-23 |
| 164 | Accounting Backbone C | Block-20.1 | Cash-basis transformation engine foundation | DONE | DONE |  |  | PR #196 (b87ff46). Engine + migration 0217 + workbook |
| 165 | Accounting Backbone C | Block-20.2 | Frontend basis selector + report wire-up | DONE | DONE |  |  | PR #198. Default Accrual, no per-user memory |
| 166 | Accounting Backbone C | Block-20.3 | Period close lock + recompute guard | DONE | DONE |  |  | PR #200. Trigger migration locks cash-basis |
| 167 | Accounting Backbone C | Block-21 | Expense category to account map + resolver service | DONE | DONE |  |  | PR #202 (c026c10). Foundation for Block-22..28 + 32/33 |
| 168 | Accounting Backbone C | Block-22 | Driver settlement posting | DONE | DONE |  |  | PR #241 |
| 169 | Accounting Backbone C | Block-23 | Escrow posting | DONE | DONE |  |  | PR #233 |
| 170 | Accounting Backbone C | Block-24 | Factoring posting — VQ1 Option A locked | DONE | DONE |  |  | PR #214 |
| 171 | Accounting Backbone C | Block-25 | Factoring fees and reserves | DONE | DONE |  |  | PR #216 |
| 172 | Accounting Backbone C | Block-26 | Factor reconciliation — Q11 tolerance | DONE | DONE |  |  | PR #217 |
| 173 | Accounting Backbone C | Block-27 | Fuel expense posting via Block-21 | DONE | DONE |  |  | PR #203 (3ce6162). Driver-advance + company-direct |
| 174 | Accounting Backbone C | Block-28 | Maintenance AP posting on WO close | DONE | DONE |  |  | PR #205 (7d15948). Wires Block-21 resolver |
| 175 | Accounting Backbone C | Block-29 | Bank reconciliation engine | DONE | DONE |  |  | PR #206. Q8 + Q11 tolerance |
| 176 | Accounting Backbone C | Block-30 | Bank reconciliation UI | DONE | DONE |  |  | PR #219. Two-pane UI on Block-29 |
| 177 | Accounting Backbone C | Block-31 | Sales tax handling | DONE | DONE |  |  | PR #222. Authorities + rates + codes |
| 178 | Accounting Backbone C | Block-32 | Bill line account_id resolution via Block-21 | DONE | DONE |  |  | PR #208 |
| 179 | Accounting Backbone C | Block-33 | Invoice line revenue mapping via Block-21 | DONE | DONE |  |  | PR #209 |
| 180 | Accounting Backbone C | Block-34 | Payment application + overpay → credit/vendor memo | DONE | DONE |  |  | PR #211 |
| 181 | Accounting Backbone C | Block-35-A | Formalize chart of accounts roles per company | DONE | DONE |  |  | PR #212 |
| 182 | Accounting Backbone C | Block-35 | Chart of accounts main | NOT STARTED | NOT STARTED |  |  | Block-35-A done; main Block-35 ahead — Jorge to confirm scope |
| 183 | Accounting Backbone C | Block-36 | Multi-entity accounting (3 companies: TRK + TRANSP + USMCA) | DONE | DONE |  |  | PR #225. Claude hotfix for TS1131/TS1005 + verify-ts-brace-balance.mjs |
| 184 | Accounting Backbone C | Block-42 | (Reserved — scope undefined) | NOT STARTED | NOT STARTED |  |  | No PR. Jorge to confirm what Block-42 is |
| 185 | Accounting Backbone C | Block-CMC | Month-close wizard | DONE | DONE |  |  | PR #238 |
| 186 | Accounting Backbone C | Block-CF | 13-week cash forecast | DONE | DONE |  |  | PR #239 |
| 187 | Accounting Backbone C | Block-PPC | Period comparison report | DONE | DONE |  |  | PR #240 |
| 188 | Accounting Backbone C | Block-44 | AR collections workflow | DONE | DONE |  |  | PR #242 + #251 rework |
| | **▼ Accounting Backbone D** | | | | | | | |
| 189 | Accounting Backbone D | Block-37 | Fix QBO sync — repair pipeline | DONE | DONE |  |  | PR #226. Closes long-standing PARTIAL umbrella |
| 190 | Accounting Backbone D | Block-38 | Sync conflict detection + ConflictsTab | DONE | DONE |  |  | PR #190 (954ec5a) |
| 191 | Accounting Backbone D | Block-39 | QBO Sync event log detail page | DONE | DONE |  |  | PR #188 (c6d0672) |
| 192 | Accounting Backbone D | Block-40 | Accounting audit trail | DONE | DONE |  |  | PR #227. Universal emission + CI guard verify-accounting-writes-emit-audit |
| 193 | Accounting Backbone D | Block-41 | Posting lineage UI | DONE | DONE |  |  | PR #228. Read-only graph on Block-40 data |
| 194 | Accounting Backbone D | Block-43 | Live-DB schema verification | DONE | DONE |  |  | PR #232. Nightly drift detector cron + CI guard |
| | **▼ Phase 6** | | | | | | | |
| 195 | Phase 6 | P6-EDI | EDI 204/210/214 broker integration | PENDING | PENDING |  |  |  |
| 196 | Phase 6 | P6-Lanes | Load optimizer / lane pairing | PENDING | PENDING |  |  |  |
| 197 | Phase 6 | P6-Pricing | Pricing engine (dynamic quoting) | PENDING | PENDING |  |  |  |
| 198 | Phase 6 | P6-Recurring | Recurring invoices | PENDING | PENDING |  |  |  |
| 199 | Phase 6 | P6-CSA | CSA forecasting | PENDING | PENDING |  |  |  |
| | **▼ Phase 7 Stabilization** | | | | | | | |
| 200 | Phase 7 Stabilization | P7-MAINT-FOUNDAT… | Maintenance go-live foundation | DONE | DONE |  |  | PR #261 |
| 201 | Phase 7 Stabilization | P7-MAINT-PM-INSP… | PM inspection records | DONE | DONE |  |  | PR #263 |
| 202 | Phase 7 Stabilization | P7-MAINT-MASTER-… | Maintenance master data | DONE | DONE |  |  | PR #266 |
| 203 | Phase 7 Stabilization | P7-MAINT-WO-PDF | Wire WO PDF path + block guards | DONE | DONE |  |  | PR #262 |
| 204 | Phase 7 Stabilization | P7-MAINT-WO-MODA… | WO modal: catalog pickers + 7 source types + vendor + 2 guar… | DONE | DONE |  |  | PR #272 |
| 205 | Phase 7 Stabilization | P7-SAFETY-FOUNDA… | Safety foundation KPI coverage guard + endpoints | DONE | DONE |  |  | PR #264 |
| 206 | Phase 7 Stabilization | P7-SAFETY-DRIVER… | Driver profile records + coverage guards | DONE | DONE |  |  | PR #265 |
| 207 | Phase 7 Stabilization | P7-SAFETY-TRAINI… | Training programs + drug pool + safety reports guards | DONE | DONE |  |  | PR #267 |
| 208 | Phase 7 Stabilization | P7-SAFETY-EVENTS | Safety events module + migration 0261 + frontend + 2 guards | DONE | DONE |  |  | PR #269 |
| 209 | Phase 7 Stabilization | P7-INFRA-BRANCH-… | Branch tooling: rebuild-linear + precheck-push + safe-switch | DONE | DONE |  |  | PR #268 |
| 210 | Phase 7 Stabilization | P7-INFRA-SYNC-OR… | Sync orchestrator + block:ship + verify-branch-fresh | DONE | DONE |  |  | PR #270 |
| 211 | Phase 7 Stabilization | P7-HOTFIX-3-AUDI… | 1 P0 + 6 P1s from 2026-05-25 audit + 3 guards | DONE | DONE |  |  | PR #271 |
| 212 | Phase 7 Stabilization | P7-SAF-DRIVER-DQ… | Safety DQF lane kickoff | DONE | DONE |  |  | PR #297 |
| | **▼ Phase 7 Dispatch 4 — Asset** | | | | | | | |
| 213 | Phase 7 Dispatch 4 — Asset | ASSET-01 | Asset registry foundation (mdata.units) | DONE | DONE |  |  | PR #281. Migration 0262 |
| 214 | Phase 7 Dispatch 4 — Asset | ASSET-02 | Damage status + repair estimate | DONE | DONE |  |  | PR #283. Migration 0263 |
| 215 | Phase 7 Dispatch 4 — Asset | ASSET-04 | Assets UI (list + detail) | DONE | DONE |  |  | PR #282 |
| | **▼ Phase 7 Dispatch 4 — Accounting** | | | | | | | |
| 216 | Phase 7 Dispatch 4 — Accou… | ACCT-03 | Multi-unit cost allocation engine | DONE | DONE |  |  | PR #285. Migration 0264 |
| 217 | Phase 7 Dispatch 4 — Accou… | ACCT-05 | Vendor bill form layout fix (structured Item + Account) | DONE | DONE |  |  | PR #286 |
| 218 | Phase 7 Dispatch 4 — Accou… | ACCT-06 | Bill unit allocation UI | DONE | DONE |  |  | PR #284 + #287 |
| 219 | Phase 7 Dispatch 4 — Accou… | ACCT-08 | PSE mirror endpoints + sync guard | DONE | DONE |  |  | PR #289. 26 cats + items + CoA mirror |
| 220 | Phase 7 Dispatch 4 — Accou… | ACCT-09 | Bill-payment batches → single QBO payment | DONE | DONE |  |  | PR #293 |
| 221 | Phase 7 Dispatch 4 — Accou… | ACCT-10 | Multi-bill UI flow (Create Multiple Bills) | DONE | DONE |  |  | PR #294. Jorge priority feature |
| 222 | Phase 7 Dispatch 4 — Accou… | ACCT-11 | PSE posting enforcement (Category+Item required) | DONE | DONE |  |  | PR #295. Corrective addendum |
| 223 | Phase 7 Dispatch 4 — Accou… | ACCT-12 | Per-truck CPM dashboard | DONE | DONE |  |  | PR #296. vs $2.26 industry benchmark |
| 224 | Phase 7 Dispatch 4 — Accou… | ACCT-TB-HUB | Trial balance hub snapshot | DONE | DONE |  |  | PR #288. Bonus accounting hub |
| 225 | Phase 7 Dispatch 4 — Accou… | ACCT-PL-HUB | Profit and loss hub snapshot | DONE | DONE |  |  | PR #290. Bonus accounting hub |
| | **▼ Phase 7 Dispatch 4 — Banking** | | | | | | | |
| 226 | Phase 7 Dispatch 4 — Banki… | BANK-07 | Bulk categorize + post-as-bills flows | DONE | DONE |  |  | PR #292 |
| | **▼ Phase 7 Dispatch 4 — Safety** | | | | | | | |
| 227 | Phase 7 Dispatch 4 — Safet… | SAF-01 | Driver Qualification File API + migration 0267 driver_dqf | DONE | DONE |  |  | PR #298 |
| 228 | Phase 7 Dispatch 4 — Safet… | SAF-02 | Driver DQF list + profile | DONE | DONE |  |  | PR #300 |
| 229 | Phase 7 Dispatch 4 — Safet… | SAF DQF UI | DQF UI Driver Files tab | DONE | DONE |  |  | PR #299 |
| 230 | Phase 7 Dispatch 4 — Safet… | SAF-03 | Medical Examiner Cert 24-mo tracking + migration 0268 | DONE | DONE |  |  | PR #301 |
| 231 | Phase 7 Dispatch 4 — Safet… | SAF-05 | Compliance expiry reminders + migration 0269 | DONE | DONE |  |  | PR #303. T-60/30/7/expired for DQF/CDL/medical |
| 232 | Phase 7 Dispatch 4 — Safet… | SAF-06 | Drug program + dispatch gate | DONE | DONE |  |  | PR #304. Dup 0267 resolved by CLEANUP-1 (#309) |
| 233 | Phase 7 Dispatch 4 — Safet… | SAF-07 | Return-to-duty workflow | DONE | DONE |  |  | PR #305 |
| 234 | Phase 7 Dispatch 4 — Safet… | SAF-08 | Driver dispatch gate | DONE | DONE |  |  | PR #306 |
| 235 | Phase 7 Dispatch 4 — Safet… | SAF-09 | Drug program + RTD + gate UI | DONE | DONE |  |  | PR #307 |
| 236 | Phase 7 Dispatch 4 — Safet… | SAF-KPI | Compliance dashboard (per-driver + fleet KPI) | DONE | DONE |  |  | PR #302 |
| 237 | Phase 7 Dispatch 4 — Safet… | SAF-13 | Reminders + DOT reference panel UI | DONE | DONE |  |  | PR #311 (#308 v1 closed → rebuilt) |
| | **▼ Phase 7 Dispatch 4 — Infra** | | | | | | | |
| 238 | Phase 7 Dispatch 4 — Infra | INF-1 | Per-agent block-ready manifest split | DONE | DONE |  |  | PR #291 |
| | **▼ Phase 7 Dispatch 4 — Maint** | | | | | | | |
| 239 | Phase 7 Dispatch 4 — Maint | MAINT-10 | Parts catalog + PM schedules + migration 0272 | DONE | DONE |  |  | PR #310 |
| 240 | Phase 7 Dispatch 4 — Maint | MAINT-11 | Clean WO → AP bill posting lane + migration 0273 | DONE | DONE |  |  | PR #312 |
| 241 | Phase 7 Dispatch 4 — Maint | MAINT-12 | WO detail + receipt upload + PM inventory UX | DONE | DONE |  |  | PR #313. Closed Maintenance go-live |
| | **▼ Phase 7 Dispatch 4 — Insurance** | | | | | | | |
| 242 | Phase 7 Dispatch 4 — Insur… | INS-01 | Policies + covered units schema + migration 0274 + correctiv… | DONE | DONE |  |  | PR #314 + #315 |
| 243 | Phase 7 Dispatch 4 — Insur… | INS-02 | Dispersal engine → Create-Multiple-Bills | DONE | DONE |  |  | PR #319 |
| 244 | Phase 7 Dispatch 4 — Insur… | INS-03 | Coverage-gap detector (safety gate) | DONE | DONE |  |  | PR #324 merged 2026-05-30 |
| 245 | Phase 7 Dispatch 4 — Insur… | INS-04 | Certificate request workflow + insurer email | DONE | DONE |  |  | PR #332 merged 2026-05-30; Sunday 5/31 PR #345 wired COI tab into Customers.tsx |
| 246 | Phase 7 Dispatch 4 — Insur… | INS-05 | Payment reminders + late-fee split | DONE | DONE |  |  | PR #333 merged 2026-05-30. principal + late_fee + wire_fee bill lines |
| 247 | Phase 7 Dispatch 4 — Insur… | INS-06 | Insurance ↔ accidents / legal / lawsuits link | DONE | DONE |  |  | PR #334 merged 2026-05-30 |
| 248 | Phase 7 Dispatch 4 — Insur… | INS-07 | Insurance module frontend (policies, dispersal, COI, claims) | DONE | DONE |  |  | PR #335 merged 2026-05-30 |
| | **▼ Phase 7 Dispatch 4 — Integrity** | | | | | | | |
| 249 | Phase 7 Dispatch 4 — Integ… | INT-1 | Audit trigger infrastructure (audit.row_changes + tg_audit_r… | DONE | DONE |  |  | PR #316. Migration 0276 |
| 250 | Phase 7 Dispatch 4 — Integ… | INT-2 | Per-driver behavior metrics + peer benchmarks | DONE | DONE |  |  | PR #320. 1.5× peer-median threshold |
| 251 | Phase 7 Dispatch 4 — Integ… | INT-3 | Anomaly detection + status workflow | DONE | DONE |  |  | PR #328 merged 2026-05-30 |
| 252 | Phase 7 Dispatch 4 — Integ… | INT-4 | Mandatory cancellation reason on dispatch load cancel | DONE | DONE |  |  | PR #330 merged 2026-05-30 |
| 253 | Phase 7 Dispatch 4 — Integ… | INT-5 | Driver-on-repair required link + Safety profile surface | DONE | DONE |  |  | PR #331 merged 2026-05-30 |
| | **▼ Phase 7 Dispatch 4 — Maint Extras** | | | | | | | |
| 254 | Phase 7 Dispatch 4 — Maint… | MNT-4 | Position/location selector on WO line items | DONE | DONE |  |  | PR #323 merged 2026-05-30 |
| 255 | Phase 7 Dispatch 4 — Maint… | MNT-5 | Real fleet parts catalog research (Samsara T120-T177 + Peter… | DONE | DONE |  |  | PR #317 + #321 (126 parts + 15 PM types calibrated 12k mi/month); Sunday 5/31 PR #347 MNT-5-MIGRATE migrated 144 parts maint.part→maintenance.parts_inventory |
| | **▼ Phase 7 Dispatch 4 — Cleanup** | | | | | | | |
| 256 | Phase 7 Dispatch 4 — Clean… | D4-CLEANUP-1 | Renumber duplicate 0267 migration → 0270 | DONE | DONE |  |  | PR #309 |
| 257 | Phase 7 Dispatch 4 — Clean… | D4-CLEANUP-2 | Renumber duplicate 0275 migration → 0277 | DONE | DONE |  | samePR#321→#62 | PR #321 |
| 258 | Phase 7 Dispatch 4 — Clean… | D4-CLEANUP-3 | Review SKIP_MIGRATION_VERIFICATION=true env var | DONE | DONE |  |  | PR #326 merged 2026-05-30 |
| 259 | Phase 7 Dispatch 4 — Clean… | D4-CLEANUP-4 | Delete 2 orphan migration ledger entries | DONE | DONE |  |  | PR #327 merged 2026-05-30 |
| 260 | Phase 7 Dispatch 4 — Clean… | D4-CLEANUP-5 | Convert Render API key from temporary to permanent | DONE | DONE |  |  | Done during infra cleanup 2026-05-30 |
| | **▼ Phase 7 Dispatch 4 — Recovery** | | | | | | | |
| 261 | Phase 7 Dispatch 4 — Recov… | REVERT-322 | Revert hotfix #322 (broken pm_type CHECK constraint) | DONE | DONE |  |  | PR #325 (commit c589ac3). Claude opened via GitHub web UI direct |
| | **▼ Phase 7 Mobile Apps** | | | | | | | |
| 262 | Phase 7 Mobile Apps | P7-Maint-Mobile | Maintenance mobile (mechanic app) | PENDING | PENDING |  |  | Future |
| 263 | Phase 7 Mobile Apps | P7-PWA-v2 | Driver PWA v2 (push notifications, photo R2) | PENDING | PENDING |  |  | Future |
| 264 | Phase 7 Mobile Apps | P7-Disp-Mobile | Dispatcher mobile board | PENDING | PENDING |  |  | Future |
| | **▼ Phase 8** | | | | | | | |
| 265 | Phase 8 | P8-IFTA | IFTA quarterly automation | PENDING | PENDING |  |  |  |
| 266 | Phase 8 | P8-2290 | Form 2290 (Heavy Highway Use Tax) | PENDING | PENDING |  |  |  |
| 267 | Phase 8 | P8-Drug | Drug random pool management | PENDING | PENDING |  |  |  |
| 268 | Phase 8 | P8-CSA-Inter | CSA intervention workflow | PENDING | PENDING |  |  |  |
| | **▼ DS Remediation** | | | | | | | |
| 269 | DS Remediation | DS-REMEDIATE-1 | Admin queue + Data Sovereignty route boundary CI guard | DONE | DONE |  |  | PR #161 + #162 refactor (6f462cb) |
| 270 | DS Remediation | DS-REMEDIATE-2 | Canonical accounting.qbo_remote_counts + collector + outbox … | DONE | DONE |  |  | PR #164 (641802f). Migration 0201 |
| 271 | DS Remediation | DS-REMEDIATE-3 | _system.reconciliation_findings table + lifecycle | DONE | DONE |  |  | PR #163 (d2324c0) |
| 272 | DS Remediation | DS-REMEDIATE-4 | Reconciliation worker tick (MUST-DS-3 + MUST-DS-4 live) | DONE | DONE |  |  | PR #165 (7792ea4). Detects 6 finding types |
| 273 | DS Remediation | DS-REMEDIATE-5 | Alert routing for Critical findings (Twilio via outbox.event… | DONE | DONE |  |  | PR #170 + #172 re-merge after DS-8.1 |
| 274 | DS Remediation | DS-REMEDIATE-6 | B-017 empty-UUID scheduler context guard + 9-cron retrofit | DONE | DONE |  |  | PR #167 (88432d7) |
| 275 | DS Remediation | DS-REMEDIATE-7 | Samsara webhook-event projection worker | DONE | DONE |  |  | PR #166 (009f165) |
| 276 | DS Remediation | DS-REMEDIATE-8 | DS-5 mirror metadata contract alignment | DONE | DONE |  |  | PR #168 (33a3a41). Migrations 0204-0210 |
| 277 | DS Remediation | DS-REMEDIATE-8.1 | Replace GENERATED columns with real columns (fix) | DONE | DONE |  |  | PR #171. Fix on top of DS-REM-8 |
| 278 | DS Remediation | DS-REMEDIATE-9 | Samsara remote count helper | DONE | DONE |  |  | PR #169. Closed all DS-REM-4 finding categories |
| 279 | DS Remediation | DS-REMEDIATE-10 | Outbox infrastructure consolidation (post-series cleanup) | DRAFTED | DRAFTED |  |  | still pending — no merged PR (DS-REMEDIATE-10) |
| 280 | DS Remediation | DS-REMEDIATE-11 | Samsara TRANSP config canonicalization + 94-live counter ten… | DONE | DONE |  |  | PR #176 (2906b603). Migration 0215 + 3 CI guards |
| 281 | DS Remediation | DS-REMEDIATE-12 | Backend startup migration-drift guard + CI assertion | DONE | DONE |  |  | PR #177 (94af33e). Caught 136 unledgered migrations on first prod boot |
| 282 | DS Remediation | DS-REMEDIATE-13 | Audit table canonical-name fix (audit.audit_events) | DONE | DONE |  |  | PR #181 (e3aa7c2). Migration 0216 |
| 283 | DS Remediation | DS-REMEDIATE-14 | Fleet-reports-hub removal | DROPPED | DROPPED |  |  | Owner dropped from queue 2026-05-23 |
| 284 | DS Remediation | DS-REMEDIATE-15 | BATCH-8 generator + guard use OR semantics for missing-from-… | DONE | DONE |  |  | PR #182 (08027f3). Vitest assertion |
| 285 | DS Remediation | DS-REMEDIATE-17 | Samsara → mdata.units full ingestion: replace TEST data with… | DONE | DONE |  | samePR#187→#92 | PR #187 (00d8ca7). Live on prod |
| 286 | DS Remediation | DS-REMEDIATE-PRO… | Verification infrastructure (branch protection + verify:pre-… | DONE | DONE |  |  | PR #173. Process improvement |
| | **▼ Migration Debt** | | | | | | | |
| 287 | Migration Debt | BATCH-1 | INSERT arity fixes + arity guard | DONE | DONE |  |  | PR #137 |
| 288 | Migration Debt | BATCH-3 | Maintenance work_order schema drift + guard | DONE | DONE |  |  | PR #138 |
| 289 | Migration Debt | BATCH-3-2C | Forward repair migration — work_order_lines | DONE | DONE |  |  | PR #139 |
| 290 | Migration Debt | BATCH-6 | Customer autocomplete centralized on canonical | DONE | DONE |  |  | PR #140 |
| 291 | Migration Debt | BATCH-8 | Forensic backfill of 136 pre-0067 unledgered migrations | DONE | DONE |  |  | PR #178 (3e3b8ce). Final: sys=204, app=204, drift=0 |
| 292 | Migration Debt | 0199-0214-drift-… | Replay 0199-0214 drift gap + CI guard | DONE | DONE |  |  | PR #175 |
| 293 | Migration Debt | dead-outbox-reco… | Reconcile dead outbox emitters + orphan cleanup + parity gua… | DONE | DONE |  |  | PR #174 |
| 294 | Migration Debt | 0240-seed-purge-… | Use real mdata columns in 0240 seed purge | DONE | DONE |  |  | PR #256 |
| 295 | Migration Debt | 0240-restore-pro… | Restore 0240 to applied-on-prod content; unblock Render | DONE | DONE |  |  | PR #258 |
| 296 | Migration Debt | 0242-drift-recon… | Resolve verify-content drift with 0242 reconciliation | DONE | DONE |  |  | PR #260 |
| 297 | Migration Debt | P7-MIG-IMMUTABIL… | Applied-migrations-immutable static guard | DONE | DONE |  |  | PR #259 |
| 298 | Migration Debt | DS-PROJECTION-AL… | Align data-sovereignty projections with local mdata routes a… | DONE | DONE |  |  | PR #257 |
| 299 | Migration Debt | MAGNET-1 | Glob-loader verify-pre-commit | DONE | DONE |  |  | PR #244 |
| 300 | Migration Debt | MAGNET-2 | Glob-loader EXTRA_GUARDS | DONE | DONE |  |  | PR #245 |
| 301 | Migration Debt | MAGNET-3 | Per-schema known-prod-table-grants | DONE | DONE |  |  | PR #246 |
| 302 | Migration Debt | MAGNET-4 | Autoload accounting route plugins | DONE | DONE |  |  | PR #247 |
| 303 | Migration Debt | MAGNET-5 | Frontend routes manifest | DONE | DONE |  |  | PR #248 |
| 304 | Migration Debt | MAGNET-6 | CI branch-fresh gate + AccountingSubNav manifest | DONE | DONE |  |  | PR #250 |
| 305 | Migration Debt | Block-ready-gate | Tooling: block-ready 10-check gate | DONE | DONE |  |  | PR #249 |
| 306 | Migration Debt | AUDIT-P0-2-fail-… | Audit P0-2 honest fail-closed | DONE | DONE |  |  | PR #254 |
| 307 | Migration Debt | AUDIT-VISUAL-P1 | Audit visual P1 fixes | DONE | DONE |  |  | PR #255 |
| 308 | Migration Debt | SEC-tenant-scope | Enforce tenant-scope membership on accounting + banking | DONE | DONE |  |  | PR #252 |
| 309 | Migration Debt | SEC-qbo-webhook | QBO webhook fail-closed signature verification | DONE | DONE |  |  | PR #253 |
| 310 | Migration Debt | Samsara-VIN-link | VIN linkage to mdata.units + 94-live counter CI guard | DONE | DONE |  |  | PR #183 |
| 311 | Migration Debt | Tenant-scope-cus… | Customers + Vendors tenant-scope sweep + CI guards | DONE | DONE |  |  | PR #180 |
| | **▼ QBO Sync Track** | | | | | | | |
| 312 | QBO Sync Track | QBO-Sync-Health-… | QBO Sync Health Dashboard Card on Office HOME | DONE | DONE |  |  | PR #185 (A1-4). GET /api/v1/qbo/sync-health. Status pill + 3 counters |
| 313 | QBO Sync Track | QBO-Customers-Sy… | QBO Customers Sync E2E Tenant-scope Audit + CI Guard | DONE | DONE |  |  | PR #186 (A2-5) |
| 314 | QBO Sync Track | Accounting-Block… | Fix QBO sync (master umbrella block) | DONE | DONE |  | samePR#226→#18… | PR #226 |
| 315 | QBO Sync Track | Accounting-Block… | QBO Sync Conflict Detection + ConflictsTab UI | DONE | DONE |  | samePR#190→#19… | PR #190 (954ec5a) |
| 316 | QBO Sync Track | Accounting-Block… | QBO Sync Event Log (detail page linked from HOME card) | DONE | DONE |  | samePR#188→#19… | PR #188 (c6d0672) |
| | **▼ Phase 7 Dispatch 5 — Factoring** | | | | | | | |
| 317 | Phase 7 Dispatch 5 — Facto… | FACT-1 | Factoring batch wizard (Step 1-4) | DONE | DONE |  |  | PR #336 merged 2026-05-30 |
| 318 | Phase 7 Dispatch 5 — Facto… | FACT-2 | Extra-to-reserves automation (reserve_movement table) | DONE | DONE |  |  | PR #337 merged 2026-05-30 |
| 319 | Phase 7 Dispatch 5 — Facto… | FACT-3 | Match factoring in banking (deposit reconciliation) | DONE | DONE |  |  | PR #338 |
| 320 | Phase 7 Dispatch 5 — Facto… | FACT-4 | Multi-factor support (multiple factoring companies) | DONE | DONE |  |  | PR #339 |
| 321 | Phase 7 Dispatch 5 — Facto… | FACT-5 | Reserve visibility (dashboard card + drawer) | DONE | DONE |  |  | PR #340 |
| | **▼ Phase 8 — Sunday 5/31 P0 Backend** | | | | | | | |
| 322 | Phase 8 — Sunday 5/31 P0 B… | P8-P0-LOADS | Empty-string UUID coercion fix in /mdata/loads (was 500) | DONE | DONE |  |  | PR #341 merged + deployed Sunday 2026-05-31 |
| 323 | Phase 8 — Sunday 5/31 P0 B… | P8-P0-TELEMETRY | Column-name fix in /telematics/positions/latest (was 500) | DONE | DONE |  |  | PR #342 merged + deployed Sunday 2026-05-31 |
| 324 | Phase 8 — Sunday 5/31 P0 B… | P8-P0-CUSTOMER-D… | Register /customers/:id/detail route (was 404) | DONE | DONE |  |  | PR #343 merged + deployed Sunday 2026-05-31 |
| | **▼ Phase 8 — Sunday 5/31 UI Wire-Up** | | | | | | | |
| 325 | Phase 8 — Sunday 5/31 UI W… | FACT-WIRE-UI | Factoring routes FACT-1/2/4/5 wired into frontend | DONE | DONE |  |  | PR #344 merged + deployed Sunday 2026-05-31 |
| 326 | Phase 8 — Sunday 5/31 UI W… | INS-04-WIRE-UI | COI tab wired into Customers.tsx (INS-04 follow-up) | DONE | DONE |  |  | PR #345 merged + deployed Sunday 2026-05-31. Force-with-lease push after CustomerCOITab.tsx fix |
| | **▼ Phase 8 — Sunday 5/31 Samsara Data** | | | | | | | |
| 327 | Phase 8 — Sunday 5/31 Sams… | SMS-FIX-1 | Samsara projection seed: staging vehicles+drivers → canonica… | DONE | DONE |  |  | PR #346 merged + deployed Sunday 2026-05-31. Migration 0291 had dup-VIN bug — manual SQL fix via Neon: 4→87 units, 4→82 drivers, 100/100 vehicles + 78/78 drivers mapped. 0291 marked applied in ledger. |
| | **▼ Phase 8 — Sunday 5/31 Schema Migrate** | | | | | | | |
| 328 | Phase 8 — Sunday 5/31 Sche… | MNT-5-MIGRATE | 144 parts migrated maint.part→maintenance.parts_inventory (m… | DONE | DONE |  |  | PR #347 merged + deployed Sunday 2026-05-31 |
| 329 | Phase 8 — Sunday 5/31 Sche… | MAINT-10-MIGRATE | 24 PM types migrated maint.pm_schedule→maintenance.pm_schedu… | DONE | DONE |  |  | PR #348 merged + deployed Sunday 2026-05-31 |
| | **▼ Phase 8 — Sunday 5/31 P0 Backend** | | | | | | | |
| 330 | Phase 8 — Sunday 5/31 P0 B… | P8-P0-CUSTOMER-D… | Re-do customer/:id/detail route registration + CI guard | DONE | DONE |  |  | PR #349 merged + deployed Sunday 2026-05-31 (SHA 22d1b3a) |
| | **▼ Phase 8 — Sunday 5/31 Follow-up** | | | | | | | |
| 331 | Phase 8 — Sunday 5/31 Foll… | SMS-FIX-1-DEDUP | Fix canonical migration 0291 source with DISTINCT ON (vin) +… | PENDING | DONE |  |  | Manual SQL applied to prod 5/31; canonical source still broken for fresh CI DBs  / matched merged PR by Task-ID |
| 332 | Phase 8 — Sunday 5/31 Foll… | RENDER-PREDEPLOY… | Investigate Render predeploy hook config for permanence + ad… | PENDING | PENDING |  |  | Jorge's explicit ask 5/31 |
| 333 | Phase 8 — Sunday 5/31 Foll… | CLEANUP-VERIFY-D… | Delete duplicate scripts/verify-no-empty-string-uuid-bind 3.… | PENDING | PENDING |  |  | macOS Finder duplicate naming pattern |
| 334 | Phase 8 — Sunday 5/31 Foll… | CURSOR-GH-AUTH-R… | Re-auth Cursor's gh CLI (HTTP 401 after #345 merge) | PENDING | PENDING |  |  | gh auth refresh -h github.com -s repo,workflow,read:org |
| 335 | Phase 8 — Sunday 5/31 Foll… | LIVE-UI-VISUAL-V… | Walk /dispatch /drivers /maintenance to confirm 87 units / 8… | PENDING | PENDING |  |  | Verify Sunday 5/31 data lands in UI |
| | **▼ Phase 8 Audit Findings** | | | | | | | |
| 336 | Phase 8 Audit Findings | P8-AUDIT-CUST-BI… | Fix /customers/{id}/billing-summary 500 error | IN FLIGHT | DONE |  |  | DONE — merged #386 (A8 customers billing-summary fix) |
| 337 | Phase 8 Audit Findings | P8-AUDIT-NESTED-… | Fix nested-box modal pattern (WO Details header ×2, Customer… | DONE | DONE |  |  | From 2026-05-24 audit P1 · PR #462 · merged + LIVE 2026-06-04 |
| 338 | Phase 8 Audit Findings | P8-AUDIT-PROD-ST… | Remove 13+ stub strings rendering in production | DONE | DONE |  |  | From 2026-05-24 audit P2 · PR #471 · merged + LIVE 2026-06-04 |
| 339 | Phase 8 Audit Findings | P8-AUDIT-TEST-DA… | Remove TEST-DRIVER/TEST-CUSTOMER/seed-test-driver leak from … | DONE | DONE |  |  | From 2026-05-24 audit P2 · PR #469 · merged + LIVE 2026-06-04 |
| 340 | Phase 8 Audit Findings | P8-AUDIT-ELD-RED… | Fix /eld redirect-to-/home bug | DONE | DONE |  |  | From 2026-05-24 audit P3 · PR #464 · merged + LIVE 2026-06-04 |
| 341 | Phase 8 Audit Findings | P8-AUDIT-DOCS-RE… | Fix /docs redirect-to-/home bug | DONE | DONE |  |  | From 2026-05-24 audit P3 · PR #467 · merged + LIVE 2026-06-04 |
| 342 | Phase 8 Audit Findings | P8-AUDIT-QBO-ARC… | Fix qbo_archive notes leak to user-facing UI | DONE | DONE |  |  | From 2026-05-24 audit P3 · PR #468 · merged + LIVE 2026-06-04 |
| 343 | Phase 8 Audit Findings | P8-AUDIT-BACKEND… | Backend version displays 'dev' instead of release tag | DONE | DONE |  |  | From 2026-05-24 audit P3 · PR #461 · merged + LIVE 2026-06-04 |
| 344 | Phase 8 Audit Findings | P8-AUDIT-UNDEFIN… | Fix 'undefined' rendering in legend (chart/KPI) | DONE | DONE |  |  | From 2026-05-24 audit P3 · PR #470 · merged + LIVE 2026-06-04 |
| 345 | Phase 8 Audit Findings | P8-AUDIT-KPI-DRI… | Reconcile 8 KPI drifts (production KPIs don't match approved… | DONE | DONE |  |  | From 2026-05-24 audit P3 · PR #480 · merged + LIVE 2026-06-04 |
| 346 | Phase 8 Audit Findings | SMS-FIX-2-WEBHOO… | Investigate why 0 Samsara webhooks ever received in prod | DONE | DONE |  |  | Real-time GPS feed empty. Separate from SMS-FIX-1 · PR #475 · merged + LIVE 2026-06-04 |
| | **▼ Packet 2 Phase A — FE-Only Quick Wins** | | | | | | | |
| 347 | Packet 2 Phase A | #01-Block-W | HOME Book Load modal X close button fix | DONE | DONE |  |  | PR #354 merged + deployed. fix/home-book-load-modal-x-close. |
| 348 | Packet 2 Phase A | #02-Block-AD | MAINT Jump to tab dropdown remove (redundant) | DONE | DONE |  |  | PR #355 merged + deployed. fix/maint-jump-to-tab-remove. |
| 349 | Packet 2 Phase A | #03-Block-AE | ELD tab style normalize to underline | DONE | DONE |  |  | PR #356 merged + deployed. fix/eld-tab-style-normalize. |
| 350 | Packet 2 Phase A | #04-Block-AB | Internal language comprehensive scrub (9 locations) | DONE | DONE |  |  | PR #357 merged + deployed. fix/internal-language-comprehensive-scrub. |
| | **▼ Packet 2 Phase B — P0 Sub-Nav Fixes** | | | | | | | |
| 351 | Packet 2 Phase B | #05-Block-U | FUEL sub-nav routing fix (all 8 sub-tabs broken) | PENDING | PENDING |  |  | P0. Branch: fix/fuel-subnav-routing. |
| 352 | Packet 2 Phase B | #06-Block-V | DISPATCH sub-nav routing fix (all 5 sub-tabs broken) | PENDING | PENDING |  |  | P0. Branch: fix/dispatch-subnav-routing. |
| | **▼ Packet 1 Phase C — Vehicle/Trailer/Parts/Services/Reefer** | | | | | | | |
| 353 | Packet 1 Phase C | #07-Block-P | Best Bay Logsitcis customer name typo fix | PENDING | PENDING |  |  | P3. Branch: fix/customer-typo-best-bay-logistics. 1 migration row UPDATE. |
| 354 | Packet 1 Phase C | #08-Block-A | Migration ledger cleanup (187 migrations drift) | PENDING | PENDING |  |  | Foundation. Branch: chore/migration-ledger-cleanup. |
| 355 | Packet 2 Phase C | #09-Block-AA | Seed-test-driver users archive (4 rows @seed.invalid) | PENDING | PENDING |  |  | P1. Branch: fix/users-seed-test-purge-v2. Supersedes Block S. |
| 356 | Packet 1 Phase C | #10-Block-B | Vehicle Profile page (Fleet rows clickable) | DONE | DONE |  |  | SUPERSEDED-AND-SHIPPED by Block-11 PR #362 (SHA 5eefda5) + Block-12 PR #363 (SHA bbc13fc) + hotfixes PR #364 (a1ddfba) + PR #365 (da0d12e). Full vehicle profile live 2026-06-02. |
| 357 | Packet 1 Phase C | #11-Block-C | Trailer Profile page (with TYPE field) | PENDING | PENDING |  |  | HIGH VALUE. Branch: feat/trailer-profile-page. |
| 358 | Packet 1 Phase C | #12-Block-D | Parts Catalog by brand research (Peterbilt/Freightliner/Mack… | PENDING | PENDING |  |  | HIGH VALUE. Branch: feat/parts-catalog-by-brand. |
| 359 | Packet 1 Phase C | #13-Block-E | Services Catalog + ETA engine (Samsara mileage + 12k mi/mo d… | PENDING | PENDING |  |  | HIGH VALUE. Branch: feat/services-catalog-eta-engine. |
| 360 | Packet 1 Phase C | #14-Block-F | Reefer Hours tracking (Samsara 15-min polls) | PENDING | PENDING |  |  | HIGH VALUE. Branch: feat/reefer-hours-tracking. |
| | **▼ Packet 2 Phase D — P1 Bug Cleanup + KPI Consistency** | | | | | | | |
| 361 | Packet 2 Phase D | #15-Block-Y | HOME Driver day-summaries red error fix | DONE | DONE |  |  | PR #379 SHA 5c9a9e1 merged + deployed 8:22 PM CST 6/2. Rebased onto f94d54a → d06722f → merged at 5c9a9e1. A7. |
| 362 | Packet 2 Phase D | #16-Block-AJ | Samsara live positions on dispatch map fix | DONE | DONE |  |  | PR #378 SHA f94d54a merged + deployed 8:02 PM CST 6/2. Migration 0315 cron-not-running fix. B6. Stale rebase a0945fb force-pushed. |
| 363 | Packet 2 Phase D | #17-Block-AC | KPI consistency reconciliation (3 contradictions) | DONE | DONE |  |  | PR #383 SHA 585ad74 merged + deployed 9:32 PM CST 6/2. B7 = #17-Block-AC. |
| 364 | Packet 2 Phase D | #18-Block-AK | Bank Driver Escrow counter label clarify | PENDING | PENDING |  |  | P3. Branch: fix/bank-driver-escrow-counter-clarify. |
| 365 | Packet 2 Phase D | #19-Block-X | HOME Record Expense modal consistency | PENDING | PENDING |  |  | P2. Branch: fix/home-record-expense-modal-consistency. |
| | **▼ Packet 1 Phase E — Catalog Purge + URL/Header Normalize** | | | | | | | |
| 366 | Packet 1 Phase E | #20-Block-G | Catalog stub purge — replace 34 stubs | PENDING | PENDING |  |  | P1. Branch: feat/lists-catalog-stub-purge. |
| 367 | Packet 1 Phase E | #21-Block-H | URL routing normalize (underscore->hyphen 301) | PENDING | PENDING |  |  | P0. Branch: fix/lists-url-routing-normalize. |
| 368 | Packet 1 Phase E | #22-Block-I | LISTS hub header counts fix (6 of 8 wrong) | PENDING | PENDING |  |  | P1. Branch: fix/lists-header-counts-from-source. |
| 369 | Packet 1 Phase E | #23-Block-J | Equipment Types deduplication (DRY-VAN/DRY_VAN) | PENDING | PENDING |  |  | P0. Branch: fix/equipment-types-dedup. |
| 370 | Packet 1 Phase E | #24-Block-K | Classes data quality remediation | PENDING | PENDING |  |  | P2. Branch: fix/acct-classes-data-quality. |
| 371 | Packet 2 Phase E | #25-Block-AL | Classes bulk-edit UI + COA cleanup (expanded K) | PENDING | PENDING |  |  | P2. Branch: fix/acct-classes-map-visible-cleanup. |
| | **▼ Packet 1+2 Phase F — Integration Sync Restoration** | | | | | | | |
| 372 | Packet 1 Phase F | #26-Block-L | QBO bidirectional sync drift fix | PENDING | PENDING |  |  | P1. Branch: fix/qbo-sync-bidirectional-drift-fix. |
| 373 | Packet 2 Phase F | #27-Block-AM | Loves card sync restore | PENDING | PENDING |  |  | P1. Branch: fix/fuel-loves-sync-restore-v2. Supersedes Block M. |
| 374 | Packet 2 Phase F | #28-Block-AN | Plaid sync restore (root cause + display) | PENDING | PENDING |  |  | P1. Branch: fix/bank-plaid-sync-restore. Supersedes Block R. |
| 375 | Packet 1 Phase F | #29-Block-O | Customer/vendor default classifications cleanup | PENDING | PENDING |  |  | P2. Branch: fix/customer-vendor-default-classifications. |
| | **▼ Packet 1+2 Phase G — Write Flow Enables** | | | | | | | |
| 376 | Packet 1 Phase G | #30-Block-Q | DOCS write flow enable (Upload Document) | PENDING | PENDING |  |  | P1. Branch: feat/docs-write-flow-enable. |
| 377 | Packet 2 Phase G | #31-Block-AP | MAINT Settings write enable (PM intervals + vendor defaults) | PENDING | PENDING |  |  | P2. Branch: feat/maint-settings-write-enable. |
| 378 | Packet 2 Phase G | #32-Block-AR | Factoring profile edit flow (11 empty fields) | PENDING | PENDING |  |  | P2. Branch: feat/fact-profile-edit-flow. |
| 379 | Packet 2 Phase G | #33-Block-Z | Driver CDL expires + Hire date fields backfill | PENDING | PENDING |  |  | P2. Branch: feat/driver-fields-backfill. |
| 380 | Packet 2 Phase G | #34-Block-AG | 425C profile completeness guard | PENDING | PENDING |  |  | P2. Branch: feat/425c-profile-completeness-guard. |
| | **▼ Packet 2 Phase H — Data Cleanup** | | | | | | | |
| 381 | Packet 2 Phase H | #35-Block-AQ | Driver Safety pseudo-user cleanup | PENDING | PENDING |  |  | P2. Branch: fix/driver-safety-pseudo-user-cleanup. |
| 382 | Packet 2 Phase H | #36-Block-AI | User LAST LOGIN populate on session create | PENDING | PENDING |  |  | P3. Branch: fix/user-last-login-populate. |
| 383 | Packet 2 Phase H | #37-Block-AO | MAINT PM Countdown seed (87 units × 4 categories) | PENDING | PENDING |  |  | P2. Branch: feat/maint-pm-countdown-seed. Requires Block E. |
| | **▼ Packet 2 Phase I — Help / SAFETY Verify / Modal Audit** | | | | | | | |
| 384 | Packet 2 Phase I | #38-Block-AF | Help articles backfill (8 modules missing) | PENDING | PENDING |  |  | P2. Branch: feat/help-articles-backfill. |
| 385 | Packet 2 Phase I | #39-Block-AH | SAFETY dropdown groups verify (8-10 groups × ~21 sub-tabs) | PENDING | PENDING |  |  | P2. Branch: docs/safety-dropdown-groups-inventory. |
| 386 | Packet 2 Phase I | #40-Block-AS | Generic modal X close audit (all modals) | PENDING | PENDING |  |  | P2. Branch: chore/generic-modal-x-close-audit. |
| | **▼ Packet 2 Phase J — Master Dispatch 5-19 Reconcile + Audit Close** | | | | | | | |
| 387 | Packet 2 Phase J | #41-MD-5-19-RECO… | Master Dispatch 5-19 cross-check vs shipped+Packet 1+2 | PENDING | PENDING |  |  | Likely 30-40% redundant. Drop redundant, queue valid remainder. |
| 388 | Packet 2 Phase J | #42-Block-AT | Comprehensive audit script + close 2026-06-01 ticket | PENDING | PENDING |  |  | P2. Branch: chore/comprehensive-audit-final-v2. Supersedes Block T. |
| | **▼ Monday 2026-06-02 — Phase K — Vehicle Profile Capability Wave + P0 Hotfixes** | | | | | | | |
| 389 | Monday 6-2 — Capability Ca… | #43-Block-7-FLEE… | Fleet row click → /fleet/units/:uuid + counter binding | DONE | DONE |  |  | PR #358 SHA 7d4ec90 merged + deployed. |
| 390 | Monday 6-2 — Capability Ca… | #44-Block-8-SERV… | Widened status filter + COALESCE bucket fallback + CI guard | DONE | DONE |  |  | PR #359 SHA da2d3b2 merged + deployed. |
| 391 | Monday 6-2 — Capability Ca… | #45-Block-9-NAV-… | 4 dead bill paths wired + Settlements/Master Data subnavs + … | DONE | DONE |  |  | PR #360 SHA 6d5783c merged + deployed. |
| 392 | Monday 6-2 — Capability Ca… | #46-Block-10-TOO… | block-ready skip duplicate verify (702s→487s) | DONE | DONE |  |  | PR #361 SHA 290f840 merged + deployed. |
| 393 | Monday 6-2 — Vehicle Profi… | #47-Block-11-VEH… | Identity header / Status / Plates / Live telemetry / Driver … | DONE | DONE |  | samePR#362→#35… | PR #362 SHA 5eefda5 merged + deployed. |
| 394 | Monday 6-2 — Vehicle Profi… | #48-Block-12-VEH… | Maintenance snapshot / Compliance / Reefer / Financial P&L /… | DONE | DONE |  |  | PR #363 SHA bbc13fc merged + deployed. |
| 395 | Monday 6-2 — P0 Hotfix | #49-HOTFIX-VEHIC… | Migration 0291 ledger drift + 0298 samsara dedup + spurious … | DONE | DONE |  |  | PR #364 SHA a1ddfba merged + deployed. Unblocked Render preDeploy db:migrate. |
| 396 | Monday 6-2 — P0 Hotfix | #50-HOTFIX-UNIT-… | Fix 3 bugs: (A) SAVEPOINT wrap optional queries in withCurre… | DONE | DONE |  |  | PR #365 SHA da0d12e merged + deployed. Aggregate envelope now returns 20 top-level keys. |
| 397 | Monday 6-2 — Driver Profil… | #51-Block-13-dri… | Driver profile foundation (5 sections + 2 recs + migration 0… | DONE | DONE |  |  | SHA 9313033 merged + Render all 3 services live. Merge→prod ~20m. |
| 398 | Monday 6-2 — Driver Profil… | #52-Block-14-dri… | Driver profile completion (6 UI sections + training records … | DONE | DONE |  |  | PR #367 SHA 30bc2fb merged + deployed 1:10 PM CST 6/2. Migration 0302. |
| 399 | Monday 6-2 — Queue | #53-Block-15-tra… | Trailer profile foundation (mdata.equipment) + TYPE field (R… | DONE | DONE |  |  | PR #368 SHA 19ddf58 merged + deployed 1:51 PM CST 6/2. Migration 0303. |
| 400 | Monday 6-2 — Queue | #54-Block-16-com… | Compliance dashboard (DOT/IFTA/PITA/SCT/IRP/insurance tile a… | DONE | DONE |  |  | PR #369 SHA 729d283 merged + deployed 3:32 PM CST 6/2. Migration 0304. |
| 401 | Monday 6-2 — Queue | #55-Block-17-not… | Notification center (in-app notifications + email digest) | DONE | DONE |  |  | PR #373 SHA 5b9d4c3 merged + deployed 6:01 PM CST 6/2. Migration 0309. |
| 402 | Monday 6-2 — Queue | #56-Block-18-shi… | Shipper portal MVP (public-facing surface for customer load … | DONE | DONE |  |  | PR #370 SHA 4dfe61b merged + deployed 4:34 PM CST 6/2. Migrations 0306+0307. |
| 403 | Monday 6-2 — Queue | #57-Block-19-lan… | Lane profitability heatmap (route × month × revenue / mile ×… | DONE | DONE |  |  | PR #375 SHA a8c9ca1 merged + deployed 6:37 PM CST 6/2. Migration 0311. |
| 404 | Monday 6-2 — Queue | #58-Block-20-dea… | Deadhead optimization (suggest backhauls / multi-stop combin… | DONE | DONE |  |  | PR #372 SHA 3827e09 merged + deployed 5:40 PM CST 6/2. Migration 0308. |
| 405 | Monday 6-2 — Queue | #59-Block-21-bor… | Border crossing wizard (USMCA documents, broker handoff, MX … | DONE | DONE |  |  | PR #376 SHA 9702e22 merged + deployed 7:06 PM CST 6/2. Migration 0313. |
| 406 | Monday 6-2 — Queue | #60-Block-22-pre… | Predictive auto-WO from Samsara fault webhook (DTC severity … | DONE | DONE |  |  | PR #374 SHA b0762d9 merged + deployed 7:20 PM CST 6/2. Migration 0310. 4 rebases during ship. |
| | **▼ Faults Log v1 — 2026-06-02 (Jorge captured; defer until Block-22 ships)** | | | | | | | |
| 407 | Faults Log v1 | #61-F1-FLEET-BUL… | Fleet table missing QB-style bulk-select checkbox column (mu… | DONE | DONE |  |  | PR #377 SHA dff2bdd merged + deployed 7:45 PM CST 6/2. A5 = #61-F1. No migration. |
| 408 | Faults Log v1 | #62-F2-FLEET-TRA… | Fleet table only shows mdata.units (trucks); trailers in mda… | DONE | DONE |  |  | PR #380 SHA b531b89 merged + deployed 8:45 PM CST 6/2. B4 = #62-F2. No migration. Stale dup #382 closed. |
| 409 | Faults Log v1 | #63-F3-FLEET-TYP… | Fleet table missing unified view OR clickable type filters (… | IN FLIGHT | DONE | 2026-05-14 |  | CURSOR-B agent2 on feat/fleet-type-filters. B5 = #63-F3 dispatched 9:25 PM CST 6/2.  / merged #63(d7b603f18) |
| 410 | Faults Log v1 | #64-F4-EDIT-VEHI… | Edit vehicle modal surfaces only 22 of 67 mdata.units column… | DONE | DONE |  |  | PR #381 SHA fe3ee15 merged + deployed 9:22 PM CST 6/2. A6 = #64-F4. TS error at units.routes.ts:336 fixed at c745211. |
| 411 | Faults Log v1 | #65-F5-RENDER-AU… | Render backend service auto-deploy not firing — every PR req… | DONE | DONE |  |  | RESOLVED 2026-06-02 10:30 PM CST. Render IH35-TMS Settings → Auto-Deploy = On Commit. F5 fault closed without code change. |
| 412 | Faults Log v1 | F6-PLUS | Additional faults to be captured by Jorge after Block 14-22 … | PENDING | PENDING |  |  | Placeholder. |
| | **▼ Phase N — Tuesday Night Wave 2026-06-02 EVENING (after 16-block monster session)** | | | | | | | |
| 413 | Phase N — Tuesday Night Wa… | #66-A8-CUSTOMER-… | Fix /customers/{id}/detail 404 + billing-summary 500 | DONE | DONE |  |  | PR #386 SHA 33187c4 merged + deployed LIVE ~9:50 PM CST |
| 414 | Phase N — Tuesday Night Wa… | #67-A9-MODAL-DOU… | Modal doubling pattern fix (WO Details + Customer Edit) | DONE | DONE |  |  | PR #387 SHA dc26c49 merged + deployed LIVE ~10:50 PM CST |
| 415 | Phase N — Tuesday Night Wa… | #68-A10-URL-ROUT… | URL routing normalize: underscore → 301 → hyphen | DONE | DONE |  |  | PR #389 SHA 59474f8 merged + deployed LIVE 11:08 PM CST |
| 416 | Phase N — Tuesday Night Wa… | #69-A11-EQUIPMEN… | Equipment types canonical dedup (DRY-VAN/DRY_VAN unified) | DONE | DONE |  |  | PR #391 SHA 63d5a49 merged + deployed LIVE 11:35 PM CST · migration 0318 |
| 417 | Phase N — Tuesday Night Wa… | #70-A12-LISTS-HU… | LISTS hub header counts via useModuleCount() live endpoints | DONE | DONE |  |  | PR #393 SHA 73cc7fb merged + deployed LIVE ~12:00 AM CST |
| 418 | Phase N — Tuesday Night Wa… | #71-B8-QBO-CUSTO… | QBO customers sync push (2,655 records, 60s scheduler) | DONE | DONE |  |  | PR #388 SHA e158f57 merged + deployed LIVE ~10:50 PM CST · migration 0319 |
| 419 | Phase N — Tuesday Night Wa… | #72-B9-QBO-VENDO… | QBO vendors sync push (2,744 records, shared rate-limit) | DONE | DONE |  |  | PR #390 SHA 54f5860 merged + deployed LIVE 11:29 PM CST · migration 0321 |
| 420 | Phase N — Tuesday Night Wa… | #73-B10-QBO-COA-… | QBO chart of accounts sync push (1,282 records, parent-first… | DONE | DONE |  |  | PR #392 SHA b38ba2c merged + deployed LIVE ~12:00 AM CST · migration 0323 |
| 421 | Phase N — Tuesday Night Wa… | #74-B11-USER-LAS… | User last_login_at populate on session create | DONE | DONE |  |  | PR #394 SHA f370ad2 merged + deployed LIVE ~12:20 AM CST |
| | **▼ Phase N — Tuesday Night Wave (continued)** | | | | | | | |
| 422 | Phase N — Tuesday Night Wa… | #75-A13-BANKING-… | Banking driver escrow counter label clarify | DONE | DONE |  |  | PR #395 SHA fa22868 merged + deployed LIVE 12:27 AM CST |
| | **▼ Wave 1 Queued (paste-ready in /mnt/user-data/outputs/)** | | | | | | | |
| 423 | Phase N — Tuesday Night Wa… | #76-A14-WAVE1-HO… | Home Record Expense → modal (not navigate) | IN FLIGHT | DONE |  |  | DONE — merged #396 (A14 Record Expense modal) |
| 424 | Phase N — Tuesday Night Wa… | #77-A15-WAVE1-GE… | Audit all *Modal.tsx for X close | PENDING | PENDING |  |  | P2 · branch chore/generic-modal-x-close-audit |
| 425 | Phase N — Tuesday Night Wa… | #78-A16-WAVE1-TE… | Archive TEST-DRIVER/TEST-CUSTOMER/seed-* | PENDING | PENDING |  |  | P2 · branch fix/test-seed-data-archive · mig 0320 |
| 426 | Phase N — Tuesday Night Wa… | #79-B12-WAVE1-DR… | Filter Safety Safety pseudo-user | IN FLIGHT | DONE |  |  | DONE — merged #397 (B12 exclude pseudo-users) |
| 427 | Phase N — Tuesday Night Wa… | #80-B13-WAVE1-FU… | Restore Loves card sync | PENDING | PENDING |  |  | P1 · branch fix/fuel-loves-sync-restore-v2 |
| 428 | Phase N — Tuesday Night Wa… | #81-B14-WAVE1-CU… | Clear Late-pay/Medium auto-applied defaults | PENDING | PENDING |  |  | P2 · branch fix/customer-vendor-default-classifications · mig 0325 |
| 429 | Phase N — Tuesday Night Wa… | #82-B15-WAVE1-BA… | Restore Amex + Wells Fargo Plaid sync | PENDING | PENDING |  |  | P1 · branch fix/bank-plaid-sync-restore |
| | **▼ Wave 2 Queued (Wed Pre-Dawn — files in outputs/)** | | | | | | | |
| 430 | Phase N+ — Wave 2 (Wed Pre… | #83-A17-WAVE2-DR… | Wire 5/5 drivers sub-catalogs | PENDING | PENDING |  |  | P1 · branch feat/drivers-catalog-real-data-wire |
| 431 | Phase N+ — Wave 2 (Wed Pre… | #84-A18-WAVE2-NA… | Wire 5/5 Names Master pools | PENDING | PENDING |  |  | P1 · branch feat/names-master-catalog-real-data-wire |
| 432 | Phase N+ — Wave 2 (Wed Pre… | #85-A19-WAVE2-RE… | Reefer hours tracking + WO auto-create | PENDING | PENDING |  |  | P1 · branch feat/reefer-hours-separate-tracking · mig 0327 |
| 433 | Phase N+ — Wave 2 (Wed Pre… | #86-B16-WAVE2-TR… | Trailer Profile + 5 statuses + TYPE | PENDING | PENDING |  |  | P1 · branch feat/trailer-profile-page-statuses-type · mig 0329 |
| 434 | Phase N+ — Wave 2 (Wed Pre… | #87-B17-WAVE2-MA… | Parts catalog seeded 50+ by brand | PENDING | PENDING |  |  | P1 · branch feat/maint-parts-research-by-brand · mig 0331 |
| 435 | Phase N+ — Wave 2 (Wed Pre… | #88-B18-WAVE2-SE… | Services catalog + Samsara ETAs + 12k mi/mo | PENDING | PENDING |  |  | P1 · branch feat/services-catalog-real-etas · mig 0333 |
| | **▼ v23 ADDENDUM — ALL 126 PRs SHIPPED 2026-06-02 evening → 2026-06-04 evening** | | | | | | | |
| 436 |  |  |  |  |  |  |  |  |
| 437 | Phase 7 | — | fix(ui): IH35-LANGUAGE-SCRUB comprehensive internal language… | DONE | DONE |  | samePR#357→#35… | #357 |
| 438 | Phase 7 | — | fix(maint): FLEET-CLICKABLE-COUNTERS wire row click navigati… | DONE | DONE |  | samePR#358→#38… | #358 |
| 439 | Phase 7 | — | fix(maint): SERVICE-LOCATION-ALIGNMENT widen status filter +… | DONE | DONE |  | samePR#359→#39… | #359 |
| 440 | Phase 7 | — | feat(nav): NAV-INTEGRITY-3-MODULES wire dead bill subnav + q… | DONE | DONE |  | samePR#360→#39… | #360 |
| 441 | Phase 7 | — | fix(tooling): C5 dedupe arch-design + slim pre-push to block… | DONE | DONE |  | samePR#361→#39… | #361 |
| 442 | Phase 7 | — | feat(fleet): VEHICLE-PROFILE-PART-1 Sections 1-6 + border op… | DONE | DONE |  | samePR#362→#35… | #362 |
| 443 | Phase 7 | — | feat(fleet): VEHICLE-PROFILE-PART-2 Sections 7-11 + recs 1/2… | DONE | DONE |  | samePR#363→#39… | #363 |
| 444 | Phase 7 | — | hotfix(migrations): vehicle-profile prod ledger repair + 029… | DONE | DONE |  | samePR#364→#39… | #364 |
| 445 | Phase 7 | — | hotfix(mdata): unit aggregate stability — fix all 3 P0 bugs | DONE | DONE |  | samePR#365→#39… | #365 |
| 446 | Phase 7 — Drivers | — | feat(drivers): DRIVER-PROFILE-PART-1 Sections 1-6 + default … | DONE | DONE |  |  | #366 |
| 447 | Phase 7 — Drivers | — | feat(drivers): DRIVER-PROFILE-PART-2 Sections 7-12 + border … | DONE | DONE |  | samePR#367→#39… | #367 |
| 448 | Phase 7 | — | feat(fleet): Trailer Profile Part 1 — 8 sections, aggregate … | DONE | DONE |  | samePR#368→#39… | #368 |
| 449 | Phase 7 | — | Feat/compliance dashboard | DONE | DONE |  | samePR#369→#40… | #369 |
| 450 | Phase 7 | — | Feat/shipper portal mvp | DONE | DONE |  | samePR#370→#40… | #370 |
| 451 | Phase 7 | — | feat: wire maintenance position selector to catalog | DONE | DONE |  |  | #371 |
| 452 | Phase 7 | — | feat(reports): DEADHEAD-OPTIMIZATION per-truck deadhead trac… | DONE | DONE |  | samePR#372→#40… | #372 |
| 453 | Phase 7 | — | feat(notifications): Block 17 notification center MVP | DONE | DONE |  | samePR#373→#40… | #373 |
| 454 | Phase 7 | — | feat(maintenance): predictive auto-WO from Samsara fault cod… | DONE | DONE |  | samePR#374→#40… | #374 |
| 455 | Phase 7 | — | feat(reports): add lane profitability heatmap with nightly c… | DONE | DONE |  | samePR#375→#40… | #375 |
| 456 | Phase 7 | — | Feat/border crossing wizard | DONE | DONE |  | samePR#376→#40… | #376 |
| 457 | Phase 7 | A5 | feat(fleet): A5 bulk-select checkbox column + bulk-update ro… | DONE | DONE |  | samePR#377→#40… | #377 |
| 458 | Phase 7 — Samsara | B6 | fix(samsara): B6 live positions feed restored | DONE | DONE |  | samePR#378→#36… | #378 |
| 459 | Phase 7 | A7 | fix(home): A7 driver day-summary widget — empty state + endp… | DONE | DONE |  | samePR#379→#36… | #379 |
| 460 | Phase 7 | — | Feat/fleet trailers joined into fleet table | DONE | DONE |  | samePR#380→#40… | #380 |
| 461 | Phase 7 | A6 | feat(fleet): A6 edit vehicle modal expanded to 67 columns | DONE | DONE |  | samePR#381→#41… | #381 |
| 462 | Phase 7 | — | Feat/kpi consistency reconcile | DONE | DONE |  | samePR#383→#36… | #383 |
| 463 | Phase 7 | — | Feat/kpi consistency reconcile | DONE | DONE |  |  | #384 |
| 464 | Phase 7 | — | Feat/fleet type filters | DONE | DONE |  |  | #385 |
| 465 | Phase 7 | A8 | fix(customers): repair billing-summary SQL and harden detail… | DONE | DONE |  | samePR#386→#41… | #386 |
| 466 | Phase 7 | A9 | fix(frontend): A9 modal doubling pattern — single header + n… | DONE | DONE |  | samePR#387→#41… | #387 |
| 467 | Phase 7 | B8 | feat(B8): push local QBO customers on 60s scheduler with syn… | DONE | DONE |  | samePR#388→#41… | #388 |
| 468 | Phase 7 | — | Feat/url routing normalize underscore hyphen | DONE | DONE |  | samePR#389→#41… | #389 |
| 469 | Phase 7 | — | Feat/qbo vendors sync push | DONE | DONE |  | samePR#390→#41… | #390 |
| 470 | Phase 7 | A11 | fix(catalogs): equipment types canonical dedup (A11 Block-J) | DONE | DONE |  | samePR#391→#41… | #391 |
| 471 | Phase 7 | B10 | Feat/qbo coa sync push (B10) | DONE | DONE |  | samePR#392→#42… | #392 |
| 472 | Phase 7 | A12 | fix(lists): derive hub header counts from live catalog sourc… | DONE | DONE |  | samePR#393→#41… | #393 |
| 473 | Phase 7 | B11 | Populate user last_login_at on session create (B11) | DONE | DONE |  | samePR#394→#42… | #394 |
| 474 | Phase 7 | A13 | fix(banking): clarify driver escrow counter label (A13) | DONE | DONE |  | samePR#395→#42… | #395 |
| 475 | Phase 7 | A14 | fix(home): Record Expense opens modal on HOME (A14) | DONE | DONE |  |  | #396 |
| 476 | Phase 7 | B12 | fix(driver-safety): exclude pseudo-users from driver listing… | DONE | DONE |  |  | #397 |
| 477 | Phase 7 — Chore | A15 | chore(frontend): modal X-close audit (A15) | DONE | DONE |  |  | #398 |
| 478 | Phase 7 | B13 | fix(fuel): restore Loves card sync cron and KPI status (B13) | DONE | DONE |  |  | #399 |
| 479 | Phase 7 — Audit Findings | A16 | fix(audit): archive TEST/seed rows from prod listings (A16) | DONE | DONE |  |  | #400 |
| 480 | Phase 7 | B14 | fix(mdata): archive seed-default customer/vendor classificat… | DONE | DONE |  |  | #401 |
| 481 | Phase 7 | B15 | fix(banking): restore Plaid sync timestamps and status (B15) | DONE | DONE |  |  | #402 |
| 482 | Phase 7 | A17 | feat(catalogs): wire drivers sub-catalogs to existing factor… | DONE | DONE |  |  | #403 |
| 483 | Phase 7 | B16 | feat(fleet): trailer profile part 2 gap-fill (B16) | DONE | DONE |  |  | #404 |
| 484 | Phase 7 | A17 | feat(lists): drivers catalogs canonical reference.* + archiv… | DONE | DONE |  | DUP→#482 | #405 |
| 485 | Phase 7 — Chore | A17 | chore(catalogs): deprecate redundant driver catalogs (A17.2) | DONE | DONE |  | DUP→#482 | #406 |
| 486 | Phase 7 | B17 | feat(lists): OEM parts templates reference.* (B17) | DONE | DONE |  |  | #407 |
| 487 | Phase 7 | A18 | feat(lists): names master cross-module navigator (A18) | DONE | DONE |  |  | #408 |
| 488 | Phase 7 — Safety | A23-1 | feat(safety): mount 11 unmounted route modules (A23-1) | DONE | DONE |  |  | #409 |
| 489 | Phase 7 — Safety | A23-3 | feat(safety): accidents page wire-up (A23-3) | DONE | DONE |  |  | #410 |
| 490 | Phase 7 — Safety | A23-2 | feat(safety): count and nav integrity 27/9 canonical (A23-2) | DONE | DONE |  |  | #411 |
| 491 | Phase 7 — Dispatch | B21 | feat(dispatch): triage ComingSoon legacy routes (B21-D1) | DONE | DONE |  |  | #412 |
| 492 | Phase 7 — Drivers | A17 | feat(drivers): wire mdata.drivers inline enums to reference.… | DONE | DONE |  | DUP→#482 | #413 |
| 493 | Phase 7 — Drivers | A24-2 | feat(drivers): tab/nav parity to 9-subtab canonical (A24-2) | DONE | DONE |  |  | #414 |
| 494 | Phase 7 | B24 | feat(maintenance): reconcile nav counts and remove dead CTAs… | DONE | DONE |  |  | #415 |
| 495 | Phase 7 — Drivers | A24-3 | feat(drivers): profile action bar wiring (A24-3) | DONE | DONE |  |  | #416 |
| 496 | Phase 7 — Dispatch | B21 | feat(dispatch): arch tab parity phase 1 — 3 new tabs (B21-D2… | DONE | DONE |  | DUP→#491 | #417 |
| 497 | Phase 7 — Drivers | A24-4 | feat(drivers): + Create Driver vocabulary (A24-4) | DONE | DONE |  |  | #418 |
| 498 | Phase 7 — Maintenance | B23 | feat(maint): parts unification + deprecation (B23) | DONE | DONE |  |  | #419 |
| 499 | Phase 7 — Safety | A23-4 | feat(safety): DVIR foundation — schema + PWA + office list (… | DONE | DONE |  |  | #420 |
| 500 | Phase 7 — Dispatch | B21 | feat(dispatch): book load accessorial UX (B21-D3) | DONE | DONE |  | DUP→#491 | #421 |
| 501 | Phase 7 — Maintenance | B25 | feat(maint): WO vocabulary standardize (B25) | DONE | DONE |  |  | #422 |
| 502 | Phase 7 — Safety | A23-5 | feat(safety): meetings + training wire-up (A23-5) | DONE | DONE |  |  | #423 |
| 503 | Phase 7 — Maintenance | B26 | feat(maint): trailer WO history by equipment_id (B26) | DONE | DONE |  |  | #424 |
| 504 | Phase 7 — Drivers | A24-5 | feat(drivers): Earnings & Debt tab live (A24-5) | DONE | DONE |  |  | #425 |
| 505 | Phase 7 — Dispatch | D6 | feat(dispatch): late arrivals alert fix (D6) | DONE | DONE |  |  | #426 |
| 506 | Phase 7 — Safety | A23-6 | feat(safety): canonical HOS dashboard (A23-6) | DONE | DONE |  |  | #427 |
| 507 | Phase 7 — Dispatch | D4 | feat(dispatch): planner calendar week view (D4) | DONE | DONE |  |  | #428 |
| 508 | Phase 7 — Dispatch | D5 | feat(dispatch): detention board + billing bridge (D5) | DONE | DONE |  |  | #429 |
| 509 | Phase 7 — Infra | INFRA-2 | fix(infra): defensive NULLIF wrap on RLS UUID casts (INFRA-2… | DONE | DONE |  |  | #430 |
| 510 | Phase 7 — Safety | A23-7 | feat(safety): incidents cluster — damage/interchange/cargo (… | DONE | DONE |  |  | #431 |
| 511 | Phase 7 — Infra | INFRA-1 | fix(infra): redis resilient ioredis config (INFRA-1) | DONE | DONE |  |  | #432 |
| 512 | Phase 7 — Dispatch | D7 | feat(dispatch): OCR queue page (D7) | DONE | DONE |  |  | #433 |
| 513 | Phase 7 — Safety | A23-8 | feat(safety): escrow record wire (A23-8) | DONE | DONE |  |  | #434 |
| 514 | Phase 7 — Dispatch | D8 | feat(dispatch): driver assignment optimizer (D8) | DONE | DONE |  |  | #435 |
| 515 | Phase 7 — Safety | A23-9 | feat(safety): company violations surfacing (A23-9) | DONE | DONE |  |  | #436 |
| 516 | Phase 7 — Safety | A15 | feat(safety): A15 modal compliance migration (A23-10) | DONE | DONE |  | DUP→#477 | #437 |
| 517 | Phase 7 — Dispatch | D9 | feat(dispatch): customer ETA notify (D9) | DONE | DONE |  |  | #438 |
| 518 | Phase 7 — Dispatch | D10 | feat(dispatch): POD capture + BOL generation (D10) | DONE | DONE |  |  | #439 |
| 519 | Phase 7 — Safety | A23-12 | feat(safety): integrity alert engine (A23-12) | DONE | DONE |  |  | #440 |
| 520 | Phase 7 — Safety | A23-13 | feat(safety): permits tab tracking (A23-13) | DONE | DONE |  |  | #441 |
| 521 | Phase 7 — Dispatch | D11 | feat(dispatch): settings tab (D11) | DONE | DONE |  |  | #442 |
| 522 | Phase 7 — Dispatch | D12 | feat(dispatch): secondary nav depth (D12) | DONE | DONE |  |  | #443 |
| 523 | Phase 7 — Drivers | A24-10 | feat(drivers): communication center (A24-10) | DONE | DONE |  |  | #444 |
| 524 | Phase 7 — Drivers | A24-6 | feat(drivers): audit history tab (A24-6) | DONE | DONE |  |  | #445 |
| 525 | Phase 7 — Maintenance | B27 | feat(maint): DVIR defect intake — maintenance side (B27) | DONE | DONE |  |  | #446 |
| 526 | Phase 7 — Drivers | A24-7 | feat(drivers): training records CRUD on profile (A24-7) | DONE | DONE |  |  | #447 |
| 527 | Phase 7 — Maintenance | B28 | feat(maint): PM auto-WO engine (B28) | DONE | DONE |  |  | #448 |
| 528 | Phase 7 — Drivers | A24-8 | feat(drivers): onboarding wizard multi-step (A24-8) | DONE | DONE |  |  | #449 |
| 529 | Phase 7 — Maintenance | B29 | feat(maint): vendor master unify CRUD (B29) | DONE | DONE |  |  | #450 |
| 530 | Phase 7 — Drivers | A24-9 | feat(drivers): document expiry alert engine (A24-9) | DONE | DONE |  |  | #451 |
| 531 | Phase 7 — Maintenance | B30 | feat(maint): inspections CRUD + DVIR linkage (B30) | DONE | DONE |  |  | #452 |
| 532 | Phase 7 — Maintenance | B31 | feat(maint): service history timeline (B31) | DONE | DONE |  |  | #453 |
| 533 | Phase 7 — Drivers | A24-11 | feat(drivers): PWA live data parity (A24-11) | DONE | DONE |  |  | #454 |
| 534 | Phase 7 — Drivers | A24-12 | feat(drivers): pre-hire application portal (A24-12) | DONE | DONE |  |  | #455 |
| 535 | Phase 7 — Maintenance | B32 | feat(maint): tire program tracking (B32) | DONE | DONE |  |  | #456 |
| 536 | Phase 7 — Maintenance | B34 | feat(maint): mechanic labor UX (B34) | DONE | DONE |  |  | #457 |
| 537 | Phase 7 — Maintenance | B33 | feat(maint): warranty tracking + claims (B33) | DONE | DONE |  |  | #458 |
| 538 | Phase 7 — Maintenance | B35 | feat(maint): KPI dashboard (B35) | DONE | DONE |  |  | #459 |
| 539 | Phase 7 — Maintenance | A19 | feat(maint): reefer hours tracking (A19) | DONE | DONE |  |  | #460 |
| 540 | Phase 7 — Tier 2 Audit | P8-AUDIT-BACKEND… | fix(audit): backend version tag (P8-AUDIT-BACKEND-VERSION) | DONE | DONE |  | DUP→#343 | #461 |
| 541 | Phase 7 — Tier 2 Audit | P8-AUDIT-NESTED-… | fix(audit): nested-box modal pattern (P8-AUDIT-NESTED-MODALS… | DONE | DONE |  | DUP→#337 | #462 |
| 542 | Phase 7 — Infra | INFRA-3 | fix(infra): Driver PWA StopAction DriverStop.type parity (IN… | DONE | DONE |  |  | #463 |
| 543 | Phase 7 — Tier 2 Audit | P8-AUDIT-ELD-RED… | fix(audit): /eld redirect-to-home bug (P8-AUDIT-ELD-REDIRECT… | DONE | DONE |  | DUP→#340 | #464 |
| 544 | Phase 7 — BULK Cluster | BULK-RBC | rbc: bulk select / multi-edit investigation (BULK-RBC) | DONE | DONE |  |  | #465 |
| 545 | Phase 7 — Chore | — | chore(cursor): dual-lane never-idle coordinator enforcement | DONE | DONE |  |  | #466 |
| 546 | Phase 7 — Tier 2 Audit | P8-AUDIT-DOCS-RE… | fix(audit): /docs redirect-to-home bug (P8-AUDIT-DOCS-REDIRE… | DONE | DONE |  | DUP→#341 | #467 |
| 547 | Phase 7 — Tier 2 Audit | P8-AUDIT-QBO-ARC… | fix(audit): qbo_archive notes leak to user UI (P8-AUDIT-QBO-… | DONE | DONE |  | DUP→#342 | #468 |
| 548 | Phase 7 — Tier 2 Audit | P8-AUDIT-TEST-DA… | fix(audit): archive mdata.customers test/seed rows (P8-AUDIT… | DONE | DONE |  | DUP→#339 | #469 |
| 549 | Phase 7 — Tier 2 Audit | P8-AUDIT-UNDEFIN… | fix(audit): 'undefined' in chart legend (P8-AUDIT-UNDEFINED-… | DONE | DONE |  | DUP→#344 | #470 |
| 550 | Phase 7 — Tier 2 Audit | P8-AUDIT-PROD-ST… | fix(audit): remove production stub strings (P8-AUDIT-PROD-ST… | DONE | DONE |  | DUP→#338 | #471 |
| 551 | Phase 7 — BULK Cluster | BULK-1 | feat(bulk): BULK-1 shared bulk UI components | DONE | DONE |  |  | #472 |
| 552 | Phase 7 — P0 Hotfix | P0-USERS-500 | fix(identity): P0-USERS-500 users.last_login_at column + gua… | DONE | DONE |  |  | #473 |
| 553 | Phase 7 — BULK Cluster | BULK-2 | feat(bulk): BULK-2 backend bulk-update framework | DONE | DONE |  |  | #474 |
| 554 | Phase 7 — Samsara | — | fix(samsara): webhook investigation + restoration (SMS-FIX-2… | DONE | DONE |  | samePR#475→#34… | #475 |
| 555 | Phase 7 — P0 Hotfix | P0-USERS-FIX | fix(identity): P0-USERS-FIX Users checklist + archive debug … | DONE | DONE |  |  | #477 |
| 556 | Phase 7 — BULK Cluster | BULK-3 | feat(bulk): BULK-3 vendor and customer bulk-update routes | DONE | DONE |  |  | #478 |
| 557 | Phase 7 — BULK Cluster | BULK-4 | feat(bulk): BULK-4 drivers and fleet bulk-update wiring | DONE | DONE |  |  | #479 |
| 558 | Phase 7 — Tier 2 Audit | P8-AUDIT-KPI-DRI… | fix(audit): reconcile 8 KPI drifts production vs app (P8-AUD… | DONE | DONE |  | DUP→#345 | #480 |
| 559 | Phase 7 — BULK Cluster | BULK-5 | feat(bulk): loads + invoices + bills bulk wire-up (BULK-5) | DONE | DONE |  |  | #481 |
| 560 | Phase 7 — BULK Cluster | BULK-6 | feat(bulk): BULK-6 audit filter, permission gate, CI coverag… | DONE | DONE |  |  | #482 |
| 561 | Phase 5 — Closure | P5-T5 | feat(driver-finance): settlement auto-pay (P5-T5) | DONE | DONE |  | DUP→#122 | #483 |
| 562 | Phase 5 — Closure | P5-T8 | feat(accounting): bills-with-balance dropdown (P5-T8) | DONE | DONE |  | DUP→#125 | #484 |
| | **▼ v24 ADDENDUM — VERIFIED SNAPSHOT 2026-06-08 (main HEAD 7490803c3 · 749 merged PR…** | | | | | | | |
| | **▼ ADD — Shipped after v23 cutoff (verified merged + LIVE)** | | | | | | | |
| 563 | Phase B QBO/New | Insurance Wizard | Atomic policy+bills wizard; /insurance LIVE | DONE | DONE |  |  | PR #737 merged f6600f9 |
| 564 | Phase C New Modules | Cash Flow MODULE | /cash-flow LIVE — Daily Prediction + Actual-vs-Projected | DONE | DONE |  |  | PR #757 merged 162e2735 |
| 565 | Phase 0 Platform | Anti-regression … | verify-cashflow-module + insurance-financial-writes guards | DONE | DONE |  |  | PR #755 |
| 566 | Phase A Dispatch | Block 12 DRAWER-… | Dispatch drawer wire | DONE | DONE |  |  | PR #746 |
| 567 | Phase A Dispatch | Block 1 OVERVIEW | Dispatch overview | DONE | DONE |  |  | PR #752 |
| 568 | Phase A Dispatch | Block 2 QUEUES-N… | Dispatch queues nav | DONE | DONE |  |  | PR #753 caeda1d2 |
| 569 | Phase A Dispatch | Block 3 KANBAN | Dispatch kanban | DONE | DONE |  |  | PR #751 |
| 570 | Phase A Dispatch | Block 4 ROUNDTRI… | Dispatch roundtrips | DONE | DONE |  |  | PR #756 |
| 571 | Phase A Dispatch | Block 5 LIST-TAB… | Dispatch list-table assign | DONE | DONE |  |  | PR #758 |
| 572 | Phase A Dispatch | Block 13 FINES-D… | Fines deduct | DONE | DONE |  |  | PR #762 |
| | **▼ 29-Tier Program — true status (was mostly unbuilt in v23)** | | | | | | | |
| 573 | Tier1.5 | BLOCK-02 Driver … | Driver escrow tier work | DONE | DONE |  |  | Artifact on main |
| 574 | Tier1.5 | BLOCK-03 IFTA | IFTA tier work | DONE | DONE |  |  | Artifact on main |
| 575 | Tier2 | BLOCK-04 Rate-Li… | Rate limiting | DONE | DONE |  |  | Artifact on main |
| 576 | Tier2 | BLOCK-07 Paginat… | Pagination audit | DONE | DONE |  |  | Artifact on main |
| 577 | Tier2 | BLOCK-08 Load-Te… | Load testing | DONE | DONE |  |  | Test/doc artifact present |
| 578 | Tier2 | BLOCK-12 Destruc… | Destruct preflight | DONE | DONE |  |  | Artifact on main |
| 579 | Tier2 | BLOCK-13 Tuning … | Tuning catalog | DONE | DONE |  |  | PR #794 (main head 7490803c3) |
| 580 | Tier2.5 | BLOCK-16 Fuel-Ca… | Fuel card | DONE | DONE |  |  | Artifact on main |
| 581 | Tier2.5 | BLOCK-17 W2/1099 | W2/1099 | DONE | DONE |  |  | Artifact on main |
| 582 | Tier3 | BLOCK-18 PII Enc… | PII encryption | DONE | DONE |  |  | Artifact on main |
| 583 | Tier3 | BLOCK-22 Ops Run… | Ops runbooks | DONE | DONE |  |  | Doc artifact present |
| 584 | Tier2 | BLOCK-05 Circuit… | Breakers on external calls | IN FLIGHT | DONE | 2026-06-08 |  | PR #800 — CI GREEN, awaiting merge  / merged #800(0fcc12da9) |
| 585 | Tier2 | BLOCK-09 E2E Pat… | Critical-path E2E tests | IN FLIGHT | DONE | 2026-06-09 |  | PR #802 — CI GREEN  / merged #802(1ced9b316) |
| 586 | Tier3 | BLOCK-20 Secrets… | Secret rotation procedure | IN FLIGHT | DONE | 2026-06-08 |  | PR #806 — CI GREEN  / merged #806(259f9c9f8) |
| 587 | Tier3 | BLOCK-21 DR-Dril… | Disaster-recovery drill doc | IN FLIGHT | DONE | 2026-06-08 |  | PR #807 — CI GREEN  / merged #807(3b625f865) |
| 588 | Tier3 | BLOCK-23 Degrada… | Graceful degradation paths | IN FLIGHT | DONE | 2026-06-08 |  | PR #808 — CI GREEN  / merged #808(c39027fca) |
| 589 | Tier4 | BLOCK-27 Canary | Canary deploy hooks | IN FLIGHT | DONE | 2026-06-08 |  | PR #810 — CI GREEN  / merged #810(301d7097e) |
| 590 | Tier4 | BLOCK-28 Vendor-… | Reduce vendor lock-in surface | IN FLIGHT | DONE | 2026-06-08 |  | PR #811 — CI GREEN  / merged #811(a39fa454f) |
| 591 | Tier4 | BLOCK-29 Known-L… | Known limits register | IN FLIGHT | DONE | 2026-06-08 |  | PR #813 — CI GREEN  / merged #813(4223885da) |
| 592 | Tier2 | BLOCK-10 RLS-Tes… | Cross-tenant RLS test gate | IN FLIGHT | DONE | 2026-06-09 |  | PR #801 — CI RED -1, fix before merge  / merged #801(c68b2845e) |
| 593 | Tier2 | BLOCK-11 Audit-C… | Mutation audit coverage | IN FLIGHT | PENDING |  |  | STILL PENDING — PR #803 never merged; mutation-audit-coverage block unshipped (spine emit covered separately via #886/#889/#890/#901) |
| 594 | Tier2.5 | BLOCK-14 Mexico-… | Mexico operations | IN FLIGHT | DONE | 2026-06-08 |  | PR #804 — CI RED -3, fix before merge  / merged #804(1fcd67364) |
| 595 | Tier2.5 | BLOCK-15 Mechani… | Internal mechanic shop | IN FLIGHT | DONE | 2026-06-08 |  | PR #805 — CI RED -3, fix before merge  / merged #805(1007d9c92) |
| 596 | Tier4 | BLOCK-26 Partiti… | Table partitioning | IN FLIGHT | DONE | 2026-06-09 |  | PR #809 — CI RED -2, fix before merge  / merged #809(a67a3ef7e) |
| 597 | Tier1.5 | BLOCK-01 Depreci… | Fixed-asset depreciation schedule + posting | PENDING | PENDING |  |  | No PR yet — NOT dispatched |
| 598 | Tier2 | BLOCK-06 Outbox-… | Dead-letter recovery for outbox | NEEDS CONFIRM | DONE | 2026-05-22 | samePR#174→#29… | Outbox work exists (#174/#49); dedicated DLQ block unclear  / merged #174(20d0833ed), #49(b2898e415) |
| 599 | Tier3 | BLOCK-19 Audit-H… | Tamper-evident audit hash chain | PENDING | PENDING |  |  | No PR yet — NOT dispatched |
| 600 | Tier3.5 | BLOCK-24 1099-An… | Annual 1099 generation | PENDING | PENDING |  |  | No PR yet — NOT dispatched |
| 601 | Tier3.5 | BLOCK-25 Consoli… | Multi-entity financial consolidation | PENDING | PENDING |  |  | No PR yet — NOT dispatched |
| | **▼ Closure V2 — were manifest stubs in v23; now real builds in flight** | | | | | | | |
| 602 | Closure | CLOSURE-10 maint… | Full parts catalog impl | IN FLIGHT | DONE | 2026-06-09 |  | PR #798 — CI RED -3  / merged #798(9dff6b749) |
| 603 | Closure | CLOSURE-11 maint… | Full maintenance services impl | IN FLIGHT | DONE | 2026-06-08 |  | PR #799 — CI GREEN  / merged #799(92dabde3f) |
| 604 | Closure | CLOSURE-12 payro… | Full payroll integration impl | IN FLIGHT | DONE | 2026-06-08 |  | PR #795 — CI GREEN  / merged #795(d6ee890b1) |
| 605 | Closure | CLOSURE-13 USMCA… | 3rd-carrier USMCA | IN FLIGHT | DONE | 2026-06-08 |  | PR #797 — CI RED -1  / merged #797(44bf98543) |
| 606 | Closure | CLOSURE-16 | Real impl | DONE | DONE |  |  | PR #793 |
| | **▼ Accounting Integrity (5) — true status** | | | | | | | |
| 607 | AcctIntegrity | AI-1 Period-lock… | Snapshot lock exists (0218); CLOSED-PERIOD LEDGER-WRITE LOCK… | PARTIAL | PARTIAL |  |  | Snapshot lock exists; ledger-write lock still required |
| 608 | AcctIntegrity | AI-2 Recon cron | Recon services exist; scheduled wrapper TBD | PARTIAL | PARTIAL |  |  | Scheduled wrapper TBD |
| 609 | AcctIntegrity | AI-3 Daily probe… | Safety cron exists; FINANCIAL probes MISSING | PARTIAL | PARTIAL |  |  | Financial probes still missing |
| 610 | AcctIntegrity | AI-4 Periods ini… | Periods initialization | MISSING | MISSING |  |  | Bookkeeper-gated |
| 611 | AcctIntegrity | AI-5 Role bindin… | Routes + UI + 0223 exist (seed TBD) | DONE | DONE |  |  | Seed TBD |
| | **▼ CA Series — QBO Parity** | | | | | | | |
| 612 | QBO Parity | CA-04 New/Edit d… | New/Edit account drawer (number optional, is_locked, opening… | IN FLIGHT | DONE |  |  | DONE — merged #815 (acct-ca04 Account Drawer; was the recorded gate-violation self-merge) |
| 613 | QBO Parity | CA-05 Account re… | Per-account register (running balance ledger) | PENDING | PENDING |  |  | After CA-04 |
| 614 | QBO Parity | CA-06 Audit hist… | Account audit history tab | PENDING | PENDING |  |  | After CA-04/05 |
| 615 | GAP | GAP-76 Deadhead … | Deadhead mile optimizer | IN FLIGHT | DONE |  |  | DONE — merged #844 (GAP-76 deadhead optimizer; original #812 was closed/superseded) |
| | **▼ BLOCKS EXECUTION ORDER — WAVE 0 — IN FLIGHT NOW (merge green, fix red)** | | | | | | | |
| 616 | Wave 0 | TIER29 Known-Lim… | Doc: known limits register | IN FLIGHT | DONE | 2026-06-08 | samePR#813→#59… | PR #813 — GREEN — order 1  / merged #813(4223885da) |
| 617 | Wave 0 | TIER28 Vendor-Lo… | Reduce vendor lock-in surface | IN FLIGHT | DONE | 2026-06-08 | samePR#811→#59… | PR #811 — GREEN — order 2  / merged #811(a39fa454f) |
| 618 | Wave 0 | TIER27 Canary | Canary deploy hooks | IN FLIGHT | DONE | 2026-06-08 | samePR#810→#58… | PR #810 — GREEN — order 3  / merged #810(301d7097e) |
| 619 | Wave 0 | TIER23 Degradati… | Graceful degradation paths | IN FLIGHT | DONE | 2026-06-08 | samePR#808→#58… | PR #808 — GREEN — order 4  / merged #808(c39027fca) |
| 620 | Wave 0 | TIER21 DR-Drill | Disaster-recovery drill doc | IN FLIGHT | DONE | 2026-06-08 | samePR#807→#58… | PR #807 — GREEN — order 5  / merged #807(3b625f865) |
| 621 | Wave 0 | TIER20 Secrets-R… | Secret rotation procedure | IN FLIGHT | DONE | 2026-06-08 | samePR#806→#58… | PR #806 — GREEN — order 6  / merged #806(259f9c9f8) |
| 622 | Wave 0 | BLOCK09 E2E Path… | Critical-path E2E tests | IN FLIGHT | DONE | 2026-06-09 | DUP→#585 | PR #802 — GREEN — order 7  / merged #802(1ced9b316) |
| 623 | Wave 0 | BLOCK05 Circuit-… | Breakers on external calls | IN FLIGHT | DONE | 2026-06-08 | DUP→#584 | PR #800 — GREEN — order 8  / merged #800(0fcc12da9) |
| 624 | Wave 0 | CLOSURE-11 maint… | Full maintenance services impl | IN FLIGHT | DONE | 2026-06-08 | samePR#799→#60… | PR #799 — GREEN — order 9  / merged #799(92dabde3f) |
| 625 | Wave 0 | CLOSURE-12 payro… | Full payroll integration impl | IN FLIGHT | DONE | 2026-06-08 | samePR#795→#60… | PR #795 — GREEN — order 10  / merged #795(d6ee890b1) |
| 626 | Wave 0 | BLOCK11 Audit-Co… | Mutation audit coverage | IN FLIGHT | PENDING |  | DUP→#593 | STILL PENDING — #803 unmerged (DUP of #593) |
| 627 | Wave 0 | BLOCK10 RLS-Test… | Cross-tenant RLS test gate — fix CI | IN FLIGHT | DONE | 2026-06-09 | DUP→#592 | PR #801 — RED -1 — order 12  / merged #801(c68b2845e) |
| 628 | Wave 0 | CLOSURE-13 USMCA… | 3rd-carrier USMCA — fix CI | IN FLIGHT | DONE | 2026-06-08 | DUP→#605 | PR #797 — RED -1 — order 13  / merged #797(44bf98543) |
| 629 | Wave 0 | TIER26 Partition | Table partitioning — fix CI | IN FLIGHT | DONE | 2026-06-09 | samePR#809→#59… | PR #809 — RED -2 — order 14  / merged #809(a67a3ef7e) |
| 630 | Wave 0 | TIER14 Mexico-Op… | Mexico operations — fix CI | IN FLIGHT | DONE | 2026-06-08 | samePR#804→#59… | PR #804 — RED -3 — order 15  / merged #804(1fcd67364) |
| 631 | Wave 0 | TIER15 Mechanic-… | Internal mechanic shop — fix CI | IN FLIGHT | DONE | 2026-06-08 | samePR#805→#59… | PR #805 — RED -3 — order 16  / merged #805(1007d9c92) |
| 632 | Wave 0 | CLOSURE-10 maint… | Full parts catalog impl — fix CI | IN FLIGHT | DONE | 2026-06-09 | samePR#798→#60… | PR #798 — RED -3 — order 17  / merged #798(9dff6b749) |
| 633 | Wave 0 | GAP-76 Deadhead … | Deadhead mile optimizer | IN FLIGHT | DONE |  | DUP→#615 | DONE — merged #844 (DUP of #615) |
| | **▼ WAVE 1 — TIER GAPS NOT YET DISPATCHED (financial safety)** | | | | | | | |
| 634 | Wave 1 | BLOCK-01 Depreci… | Fixed-asset depreciation schedule + posting | PENDING | PENDING |  | DUP→#597 | Order 19 |
| 635 | Wave 1 | BLOCK-19 Audit-H… | Tamper-evident audit hash chain | PENDING | PENDING |  | DUP→#599 | Order 20 |
| 636 | Wave 1 | BLOCK-24 1099-An… | Annual 1099 generation | PENDING | PENDING |  | DUP→#600 | Order 21 |
| 637 | Wave 1 | BLOCK-25 Consoli… | Multi-entity financial consolidation | PENDING | PENDING |  | DUP→#601 | Order 22 |
| 638 | Wave 1 | BLOCK-06 Outbox-… | Confirm/add dead-letter recovery for outbox | NEEDS CONFIRM | NEEDS CONFIRM |  |  | still pending — outbox DLQ unconfirmed; #174 did partial outbox work (BLOCK-06) |
| | **▼ WAVE 2 — ACCOUNTING INTEGRITY (make it QuickBooks-safe)** | | | | | | | |
| 639 | Wave 2 | AI-1b Closed-per… | The real gap | PENDING | PENDING |  |  | Order 24 |
| 640 | Wave 2 | AI-3b Financial … | Unbalanced JE / orphan bill / orphan payment in existing cro… | PENDING | PENDING |  |  | Order 25 |
| 641 | Wave 2 | AI-4 Periods ini… | Bookkeeper-gated | PENDING | PENDING |  | DUP→#610 | Order 26 |
| 642 | Wave 2 | AI-2b Recon cron… | Confirm-or-add | PENDING | PENDING |  |  | Order 27 |
| | **▼ WAVE 3 — CA + DISPATCH FRONTIER** | | | | | | | |
| 643 | Wave 3 | CA-04 New/Edit d… | Number optional, is_locked, opening balance | IN FLIGHT | DONE |  | DUP→#612 | DONE — merged #815 (DUP of #612) |
| 644 | Wave 3 | CA-05 Per-accoun… | Running balance ledger | PENDING | PENDING |  |  | Order 29 |
| 645 | Wave 3 | CA-06 Account au… | Audit history | PENDING | PENDING |  |  | Order 30 |
| 646 | Wave 3 | Block 8 Cross-Bo… | Customs + compliance gate | PENDING | PENDING |  |  | Order 31 |
| 647 | Wave 3 | Driver Hub page | Requests / Communications / Live data | PENDING | DONE |  |  | Order 32  / matched merged PR by Task-ID |
| 648 | Wave 3 | Sidebar-V2 (23-a… | +driver-hub #5, +cash-flow #10, drivers→Driver Profile #7 | PENDING | PENDING |  |  | Order 33 |
| 649 | Wave 3 | Block 16 Density… | Density + nav correction (preview-gated, last) | PENDING | PENDING |  |  | Order 34 |
| | **▼ WAVE 4 — v23 FEATURE BACKLOG STILL PENDING (P0 first)** | | | | | | | |
| 650 | Wave 4 | Block U FUEL sub… | 8 tabs all render Planner — P0 | PENDING | PENDING |  |  | Order 35 |
| 651 | Wave 4 | Block V DISPATCH… | 5 tabs render hub — P0 | PENDING | PENDING |  |  | Order 36 |
| 652 | Wave 4 | Block H URL unde… | P0 | PENDING | PENDING |  |  | Order 37 |
| 653 | Wave 4 | Block J Equipmen… | DRY-VAN/DRY_VAN — P0 | PENDING | PENDING |  |  | Order 38 |
| 654 | Wave 4 | Block C Trailer … | HIGH | PENDING | PENDING |  |  | Order 39 |
| 655 | Wave 4 | Block D Parts Ca… | HIGH | PENDING | PENDING |  |  | Order 40 |
| 656 | Wave 4 | Block E Services… | Samsara mi + 12k/mo — HIGH | PENDING | PENDING |  |  | Order 41 |
| 657 | Wave 4 | Block F Reefer H… | 15-min polls — HIGH | PENDING | PENDING |  |  | Order 42 |
| 658 | Wave 4 | Block G Catalog … | 34 stubs — P1 | PENDING | PENDING |  |  | Order 43 |
| 659 | Wave 4 | Block I LISTS he… | 6/8 wrong — P1 | PENDING | PENDING |  |  | Order 44 |
| 660 | Wave 4 | Block L QBO bidi… | COA/cust/vend local-only — P1 | PENDING | PENDING |  |  | Order 45 |
| 661 | Wave 4 | Block AM Loves c… | P1 | PENDING | PENDING |  |  | Order 46 |
| 662 | Wave 4 | Block AN Plaid s… | Amex/Wells — P1 | PENDING | PENDING |  |  | Order 47 |
| 663 | Wave 4 | Block Q DOCS upl… | P1 | PENDING | PENDING |  |  | Order 48 |
| 664 | Wave 4 | Block AA Archive… | P1 | PENDING | PENDING |  |  | Order 49 |
| 665 | Wave 4 | Block AP MAINT s… | P2 | PENDING | PENDING |  |  | Order 50 |
| 666 | Wave 4 | Block AR Factori… | P2 | PENDING | PENDING |  |  | Order 51 |
| 667 | Wave 4 | Block Z Driver C… | CSV — P2 | PENDING | PENDING |  |  | Order 52 |
| 668 | Wave 4 | Block AG 425C pr… | P2 | PENDING | PENDING |  |  | Order 53 |
| 669 | Wave 4 | Block K/AL Class… | P2 | PENDING | PENDING |  |  | Order 54 |
| 670 | Wave 4 | Block O Customer… | P2 | PENDING | PENDING |  |  | Order 55 |
| 671 | Wave 4 | Block AQ 'Safety… | P2 | PENDING | PENDING |  |  | Order 56 |
| 672 | Wave 4 | Block AO MAINT P… | Needs Block E — P2 | PENDING | PENDING |  |  | Order 57 |
| 673 | Wave 4 | Block AF Help ar… | 8 modules — P2 | PENDING | PENDING |  |  | Order 58 |
| 674 | Wave 4 | Block AH SAFETY … | P2 | PENDING | PENDING |  |  | Order 59 |
| 675 | Wave 4 | Block AS Generic… | P2 | PENDING | PENDING |  |  | Order 60 |
| 676 | Wave 4 | Block AK Bank es… | P3 | PENDING | PENDING |  |  | Order 61 |
| 677 | Wave 4 | Block P 'Best Ba… | P3 | PENDING | PENDING |  |  | Order 62 |
| 678 | Wave 4 | Block AI User la… | P3 | PENDING | PENDING |  |  | Order 63 |
| 679 | Wave 4 | Block-A Migratio… | 187 drift — foundation | PENDING | PENDING |  |  | Order 64 |
| 680 | Wave 4 | MD-5-19-RECONCIL… | Audit close | PENDING | PENDING |  |  | Order 65 |
| | **▼ WAVE 5 — HARDENING SWEEPS (interleaved)** | | | | | | | |
| 681 | Wave 5 | Block N RLS cros… | Companion to BLOCK-10 | PENDING | PENDING |  |  | Order 66 |
| 682 | Wave 5 | Block M Audit-lo… | Mutation routes — companion to BLOCK-11 | PENDING | PENDING |  |  | Order 67 |
| 683 | Wave 5 | Block R Webhook-… | Outbox-aware (DLQ on fail) | PENDING | PENDING |  |  | Order 68 |
| 684 | Wave 5 | Block S Idempote… | Top write routes | PENDING | PENDING |  |  | Order 69 |
| 685 | Wave 5 | Block T Concurre… | (/api/safety/log probe pattern) | PENDING | PENDING |  |  | Order 70 |
| 686 | Wave 5 | Block W Rate-lim… | Companion to BLOCK-04 | PENDING | PENDING |  |  | Order 71 |
| 687 | Wave 5 | Block X CORS loc… | Pin allowed origins from env | PENDING | PENDING |  |  | Order 72 |
| 688 | Wave 5 | Block Y Dependen… | Generate SBOM | PENDING | PENDING |  |  | Order 73 |
| 689 | Wave 5 | Block AD Backup/… | Doc + script — companion to TIER21 | PENDING | PENDING |  |  | Order 74 |
| 690 | Wave 5 | Block AE Index/q… | Top-10 slow routes (analyze) | PENDING | PENDING |  |  | Order 75 |
| 691 | Wave 5 | Block AB Long-ru… | Cron + alert | PENDING | PENDING |  |  | Order 76 |
| 692 | Wave 5 | Block AC Worker … | Workers / outbox | PENDING | PENDING |  |  | Order 77 |
| | **▼ WAVE 6 — CONTINUOUS (always running)** | | | | | | | |
| 693 | Wave 6 | Daily anti-regre… | Loaded modules verify-* lane + financial probes | ONGOING | ONGOING |  |  | Order 78 |
| 694 | Wave 6 | Smoke after each… | Mass-Run-V8 / mini lane | ONGOING | ONGOING |  |  | Order 79 |
| 695 | Wave 6 | Re-snapshot week… | main HEAD + open-PR list + Tier29/Closure17/AI | ONGOING | ONGOING |  |  | Order 80 |
| | **▼ NEW SINCE v24 — 92 merged PRs (#814 → #923) folded in from GitHub** | | | | | | | |
| 696 | Accounting | #814 | feat(accounting): seed periods Jan–Jun 2026 for TRANSP (BLOC… |  | DONE | 2026-06-09 |  | merge 6bc364b24  / merged+live |
| 697 | Accounting | #815 | feat(acct-ca04): Account Drawer — lock flag, opening-balance… |  | DONE | 2026-06-08 |  | merge e48ceb59b  / merged+live |
| 698 | Accounting | #816 | feat(accounting-integrity): verify-extend — period lock CI, … |  | DONE | 2026-06-09 |  | merge 61b50b4a1  / merged+live |
| 699 | Nav | #817 | fix(fuel): wire 8 fuel sub-nav tabs to distinct routes (Bloc… |  | DONE | 2026-06-08 |  | merge 47fbf7c85  / merged+live |
| 700 | Dispatch | #818 | fix(dispatch): wire 5 secondary tabs to distinct routes (Blo… |  | DONE | 2026-06-08 |  | merge 0307aa216  / merged+live |
| 701 | Other | #819 | fix(routing): redirect legacy underscore URLs to hyphen path… |  | DONE | 2026-06-08 |  | merge 4e90b9fd8  / merged+live |
| 702 | Dispatch | #820 | fix(dispatch): at-risk-loads 500 — project city/state in sd … |  | DONE | 2026-06-08 |  | merge 3dab85e2a  / merged+live |
| 703 | Driver-Hub | #822 | feat(driver-hub): wire DriverHubPage to /driver-hub route (P… |  | DONE | 2026-06-09 |  | merge aeade7286  / merged+live |
| 704 | QBO | #823 | docs(qbo-parity): QBO-parity UI system spec + architecture/b… |  | DONE | 2026-06-09 |  | merge a5656b2d7  / merged+live |
| 705 | QBO | #824 | feat(qbo-parity): A1 shared ParityTable grammar (UI-only) |  | DONE | 2026-06-09 |  | merge 8f3f42a05  / merged+live |
| 706 | QBO | #825 | feat(qbo-parity): A3 sizing tokens + ParityDrawer (UI-only) |  | DONE | 2026-06-09 |  | merge ae2482583  / merged+live |
| 707 | QBO | #826 | docs(qbo-parity): capture master report + v2/v3 + Visuals-Fi… |  | DONE | 2026-06-09 |  | merge 1a7740d06  / merged+live |
| 708 | Nav | #827 | feat(sidebar): add DRIVER HUB nav entry (V0, additive) |  | DONE | 2026-06-09 |  | merge 4dc2ccef4  / merged+live |
| 709 | QBO | #828 | feat(qbo-parity): A2 ReferenceSelect — inline '+ Add new' ke… |  | DONE | 2026-06-09 |  | merge 6d9cf53b6  / merged+live |
| 710 | Dispatch | #829 | feat(dispatch): surface existing Driver/Truck/Loads planners… |  | DONE | 2026-06-09 |  | merge d0bc5e5fa  / merged+live |
| 711 | Cash-Flow | #831 | fix(cash-flow): repoint read queries to real schema (500 → 2… |  | DONE | 2026-06-09 |  | merge 98235a2da  / merged+live |
| 712 | Dispatch | #833 | feat(dispatch): persistent click-to-open sub-nav + surface p… |  | DONE | 2026-06-09 |  | merge 5a7e8992b  / merged+live |
| 713 | Maintenance | #834 | Feat/closure 10 maint parts catalog |  | DONE | 2026-06-09 |  | merge 40ffcd897  / merged+live |
| 714 | CI/Infra | #838 | fix(ci): handle two-segment display_id regex pattern (e.g. ^… |  | DONE | 2026-06-09 |  | merge 4b06356fb  / merged+live |
| 715 | Banking | #840 | Feat/qbo block a bank transactions |  | DONE | 2026-06-10 |  | merge 05f867c3a  / merged+live |
| 716 | Other | #842 | Feat/fix pr 816 |  | DONE | 2026-06-09 |  | merge e148fa7c1  / merged+live |
| 717 | CI/Infra | #843 | chore(deps): bump the development-dependencies group across … |  | DONE | 2026-06-10 |  | merge 21fa8ae41  / merged+live |
| 718 | Dispatch | #844 | Add GAP-76 deadhead mile optimizer for dispatch book-load. |  | DONE | 2026-06-09 |  | merge 95ab50a90  / merged+live |
| 719 | CI/Infra | #846 | fix(ci): guard 0937 coa role-binding seed on catalogs.accoun… |  | DONE | 2026-06-09 |  | merge 108946ccf  / merged+live |
| 720 | Migrations | #847 | fix(migrate): checksum override for 0937 post-apply EXISTS-g… |  | DONE | 2026-06-09 |  | merge 714e66bec  / merged+live |
| 721 | Other | #849 | Revert "Merge pull request #843 from tioperfumes07/feat/fix-… |  | DONE | 2026-06-10 |  | merge bc5ffaea8  / merged+live |
| 722 | CI/Infra | #851 | fix(ci): add missing verify-closure-21-monitoring-artifacts.… |  | DONE | 2026-06-10 |  | merge 83d983b90  / merged+live |
| 723 | Audit-Spine | #853 | fix(audit): nested-box modal regression tests (P8-AUDIT-NEST… |  | DONE | 2026-06-10 |  | merge 797e7a011  / merged+live |
| 724 | Audit-Spine | #854 | fix(audit): archive TEST/seed rows from prod listings (P8-AU… |  | DONE | 2026-06-10 |  | merge 04b23eba3  / merged+live |
| 725 | Audit-Spine | #855 | fix(audit): remove prod stub strings + CI guard (P8-AUDIT-PR… |  | DONE | 2026-06-10 |  | merge 2ad8532c8  / merged+live |
| 726 | CI/Infra | #856 | fix(samsara): webhook route investigation + CI guard (SMS-FI… |  | DONE | 2026-06-10 |  | merge 2b954f4dd  / merged+live |
| 727 | Audit-Spine | #857 | fix(audit): reconcile 8 KPI drifts production vs app (P8-AUD… |  | DONE | 2026-06-10 |  | merge 87f6ff91e  / merged+live |
| 728 | Nav | #859 | feat(nav): 25-item sidebar rail + Tasks/Finance/Inventory sh… |  | DONE | 2026-06-10 |  | merge ba535ec27  / merged+live |
| 729 | Other | #860 | fix(SMOKE-TOKEN-AUTH): bearer token smoke + disabled PR-prev… |  | DONE | 2026-06-10 |  | merge 038f648c6  / merged+live |
| 730 | Other | #861 | fix(BUG-ADD-USER-INERT): Create user button fires zero reque… |  | DONE | 2026-06-10 |  | merge d832fd3cd  / merged+live |
| 731 | Other | #862 | fix(test): TransferModal.test.tsx — jsdom env + jest-dom mat… |  | DONE | 2026-06-10 |  | merge d9a29499c  / merged+live |
| 732 | Other | #863 | fix(test): missing @vitest-environment jsdom — 64 tests fail… |  | DONE | 2026-06-10 |  | merge 4f7addb35  / merged+live |
| 733 | Other | #864 | fix(smoke): health-only — drop SMOKE_TEST_* secrets (no serv… |  | DONE | 2026-06-10 |  | merge c2fff4946  / merged+live |
| 734 | Accounting | #865 | feat(C7): Accounting sub-nav 12 QBO items + global topbar + … |  | DONE | 2026-06-11 |  | merge 282b9b41c  / merged+live |
| 735 | Audit-Spine | #866 | feat(BK7): stackable inline-create drawer system (Account/Cl… |  | DONE | 2026-06-11 |  | merge df154e5dc  / merged+live |
| 736 | Other | #867 | feat(ITEM1): two-sided item model (sell→income account, buy→… |  | DONE | 2026-06-11 |  | merge dbc0f3adf  / merged+live |
| 737 | QBO | #868 | feat(C6): QBO-style home dashboard at /app/homepage |  | DONE | 2026-06-11 |  | merge 82ca58c8c  / merged+live |
| 738 | Audit-Spine | #869 | feat(W1-A): EVENT-LOG-SPINE |  | DONE | 2026-06-11 |  | merge a5968903a  / merged+live |
| 739 | Other | #870 | Fix/w1a append only |  | DONE | 2026-06-11 |  | merge 44fbdae34  / merged+live |
| 740 | Analytics | #871 | feat(W2A): PROFITABILITY-ENGINE — one engine, three grouping… |  | DONE | 2026-06-11 |  | merge 8a55af829  / merged+live |
| 741 | Tasks | #872 | Feat/w1b tasks module |  | DONE | 2026-06-11 |  | merge 3e2f9c251  / merged+live |
| 742 | Analytics | #873 | feat(W2-B): alert rules + profiles |  | DONE | 2026-06-11 |  | merge 5dde7c69c  / merged+live |
| 743 | Analytics | #874 | feat(W2-P): universal planner grid + FilterBar |  | DONE | 2026-06-11 |  | merge 59924c8b9  / merged+live |
| 744 | CI/Infra | #875 | fix(ci): remove conflict markers + dedup verify lines in ci.… |  | DONE | 2026-06-11 |  | merge cdfc79757  / merged+live |
| 745 | Geofence | #877 | feat(W3-A): geofence engine — fences, enter/exit, spine even… |  | DONE | 2026-06-11 |  | merge 8797a1590  / merged+live |
| 746 | Migrations | #878 | fix(deploy): re-home wave migrations to db/migrations (fixes… |  | DONE | 2026-06-11 |  | merge c8aff7027  / merged+live |
| 747 | Geofence | #879 | feat(W3-B): forced driver acknowledgment |  | DONE | 2026-06-11 |  | merge 58552c090  / merged+live |
| 748 | Safety | #880 | feat(W4-A): signed safety docs |  | DONE | 2026-06-11 |  | merge f45ef8f40  / merged+live |
| 749 | Safety-Wave | #881 | feat(W4-B): broker auto-update (gated) |  | DONE | 2026-06-11 |  | merge a3f2546df  / merged+live |
| 750 | Audit-Spine | #882 | docs: audit linkage phase specs (A1–A9 + Settlements) |  | DONE | 2026-06-11 |  | merge b74543114  / merged+live |
| 751 | Utilization | #883 | feat(W5): time utilization — minute ledger, $/hr, unaccounte… |  | DONE | 2026-06-11 |  | merge 7f88ba023  / merged+live |
| 752 | Audit-Spine | #884 | feat(A1): audit spine link columns (source_table, source_ref… |  | DONE | 2026-06-11 |  | merge 41923b31c  / merged+live |
| 753 | Dispatch | #885 | fix(gap-e): /dispatch/planners index redirect + remove stale… |  | DONE | 2026-06-12 |  | merge 9e71c14ff  / merged+live |
| 754 | Dispatch | #886 | feat(A2): dispatch spine emit coverage — 7 mutation events w… |  | DONE | 2026-06-12 |  | merge bebf534d6  / merged+live |
| 755 | Other | #887 | fix(shadow-routes): redirect 5 alias-shadow paths to real pa… |  | DONE | 2026-06-12 |  | merge b55104994  / merged+live |
| 756 | Maintenance | #888 | feat(A3): maintenance WO lifecycle spine emit coverage (5 ev… |  | DONE | 2026-06-12 |  | merge 5ad736508  / merged+live |
| 757 | Accounting | #889 | feat(A4): accounting transaction mutations emit spine events… |  | DONE | 2026-06-12 |  | merge 4f06a45bc  / merged+live |
| 758 | Banking | #890 | feat(A5): banking mutations emit spine events (9 event types… |  | DONE | 2026-06-12 |  | merge d1bf73015  / merged+live |
| 759 | Audit-Spine | #891 | feat(A6): universal audit trail — spine read API + AuditTrai… |  | DONE | 2026-06-12 |  | merge fae8ab3df  / merged+live |
| 760 | Tasks | #892 | feat(TASKS-PLANNER-V3): employee×day planner grid — progress… |  | DONE | 2026-06-12 |  | merge 16a70eab8  / merged+live |
| 761 | Accounting | #893 | feat(SETTLEMENTS-SIDEBAR): rename Payroll→Settlements, repos… |  | DONE | 2026-06-12 |  | merge 3f3582cdb  / merged+live |
| 762 | Accounting | #894 | feat(OB1): unify accounting nav — replace legacy 38-item hov… |  | DONE | 2026-06-12 |  | merge eb89ec0a9  / merged+live |
| 763 | Accounting | #896 | hotfix: restore AccountingSubNav HoverDropdownNav broken by … |  | DONE | 2026-06-12 |  | merge aadf2aab1  / merged+live |
| 764 | CI/Infra | #897 | feat(GAP-CI-WIRE-PREPUSH-GUARDS): wire 36 static pre-push lo… |  | DONE | 2026-06-12 |  | merge 3ccd25535  / merged+live |
| 765 | Nav | #898 | feat(DESIGN-STD-NAVY-PAGE-BANNER): shared NavyPageSubNav com… |  | DONE | 2026-06-12 |  | merge 25dcf5cb3  / merged+live |
| 766 | Audit-Spine | #899 | feat(A8-AUDIT-REPORTS-SECTION): 7 audit report pages under R… |  | DONE | 2026-06-12 |  | merge 14872ca94  / merged+live |
| 767 | Settlements | #900 | feat(C1-PRE-SETTLEMENTS): settlement schema + read model + R… |  | DONE | 2026-06-12 |  | merge dd25eefdd  / merged+live |
| 768 | Audit-Spine | #901 | feat(A9-AUDIT-CI-EMIT-GUARD): CI gate for audit spine emit c… |  | DONE | 2026-06-12 |  | merge 19f421ac4  / merged+live |
| 769 | Contracts | #902 | feat(C3-CUSTOMER-CONTRACT-UPLOAD): append-only contract tabl… |  | DONE | 2026-06-12 |  | merge c48adb438  / merged+live |
| 770 | Factoring | #904 | feat(C2-FACTORING-PROFILE): tiered fee+reserve schedules + s… |  | DONE | 2026-06-12 |  | merge a47befa75  / merged+live |
| 771 | Other | #905 | feat(C4-CUST-VEND-REBUILD-RECLASSIFY): reclassify + flag-dup… |  | DONE | 2026-06-12 |  | merge fae490c2b  / merged+live |
| 772 | Other | #906 | feat(E1-SMOKE-SERVICE-TOKEN-AUTH): service-token middleware … |  | DONE | 2026-06-12 |  | merge 4b7a7da92  / merged+live |
| 773 | Audit | #907 | fix(P8-AUDIT-NESTED-MODALS): add jsdom env directive to moda… |  | DONE | 2026-06-12 |  | merge 060e4e025  / merged+live |
| 774 | Audit-Spine | #908 | fix(audit): test-seed archive guard + 3rd vitest — P8-AUDIT-… |  | DONE | 2026-06-12 |  | merge bd530293b  / merged+live |
| 775 | QBO | #909 | feat(A7-AUDIT-PER-ENTITY-TABS): audit tabs with QBO-style fi… |  | DONE | 2026-06-12 |  | merge 193c71c74  / merged+live |
| 776 | Audit-Spine | #910 | fix(audit): test-seed archive guard + 3rd vitest — P8-AUDIT-… |  | DONE | 2026-06-12 |  | merge 8974f8d20  / merged+live |
| 777 | Positioned-Parts | #913 | M1: Positioned-Parts Picker |  | DONE | 2026-06-12 |  | merge 0f40e6b14  / merged+live |
| 778 | Migrations | #914 | MIGRATION-RUNNER-HARDEN: fail loud on unrecognized migration… |  | DONE | 2026-06-13 |  | merge 94c75c519  / merged+live |
| 779 | Position-History | #915 | M2: Position History for Integrity/Positioned-Parts |  | DONE | 2026-06-13 |  | merge fc51c7e55  / merged+live |
| 780 | Audit-Spine | #916 | fix(audit): P8-AUDIT-NESTED-MODALS - fix modal test environm… |  | DONE | 2026-06-13 |  | merge 8e52bcee1  / merged+live |
| 781 | CI/Infra | #917 | fix(ci): M2 position-history FK guard uses pg_constraint (ro… |  | DONE | 2026-06-13 |  | merge 9b92a30ae  / merged+live |
| 782 | Accounting | #918 | feat(accounting): B1 expense category map seed + cash_advanc… |  | DONE | 2026-06-13 |  | merge 367748b2d  / merged+live |
| 783 | Accounting | #919 | feat(accounting): B2 posting engine cash_advance source type |  | DONE | 2026-06-13 |  | merge 06d0a7b3b  / merged+live |
| 784 | Driver-Finance | #920 | feat(driver-finance): B3 employee-loan ledger GL posting + p… |  | DONE | 2026-06-13 |  | merge 2a50a8971  / merged+live |
| 785 | Driver-Finance | #921 | feat(driver-finance): B4 driver-request accountability timel… |  | DONE | 2026-06-13 |  | merge 318ca7392  / merged+live |
| 786 | Driver-Finance | #922 | feat(driver-finance): B5 cash-advance approve cascade (capst… |  | DONE | 2026-06-13 |  | merge 1866e0753  / merged+live |
| 787 | Other | #923 | B6 — Driver Inbox UI (cascade-preview + timeline endpoints) |  | DONE | 2026-06-13 |  | merge 49638a7a4  / merged+live |

---
*Reconciled 2026-06-13 13:01:33 CDT. Full merged-PR record (871 PRs) and per-sheet detail in the [xlsx export](exports/).*