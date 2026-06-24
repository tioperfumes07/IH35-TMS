# PENDING BUILD INVENTORY — 2026-06-24 (live, reconciled)

> **How to read this.** The `.block-ready/*.json` folder holds **294 files**, but that is NOT the
> pending count — most are already-shipped blocks whose JSON status was never flipped ("DONE-DRIFT").
> The numbers below come from the **human-curated trackers** (MASTER_TRACKER_2026-06-24,
> PENDING-INVENTORY-2026-06-15), cross-checked against open PRs and specs. Exact built-vs-pending per
> block still requires the PR cross-check (the open `CHORE-UNVERIFIED-ROWS-RECONCILE` chore).
>
> **Reconciled true-actionable backlog ≈ 60–75 blocks**, of which **~12–15 are Tier-1 (financial/security, gated).**
> (06-15 read it at 55–65; net growth since = audit-spine A1–A9 + cash-advance B-blocks + #1438/#1440 in flight.)

---

## 1. OPEN PRs (6)
| PR | Type | Status |
|----|------|--------|
| #1440 | **Tier-1 financial** — Book-Load cash advance → driver advance (load_id link) | [HOLD-FOR-JORGE] harness B1/B2 proven 5/5 local; B3/B4 pending; audit-spine drift found |
| #1438 | **Tier-1 financial** — Load-create persistence gap (design proposal) | [HOLD-FOR-JORGE] docs |
| #1313 | deps — production-dependencies group (32 updates) | dependency bump (Tier-1 = runtime dep, needs OK) |
| #1312 | deps — development-dependencies group (15 updates) | ship-on-green eligible |
| #1311 | CI — actions/checkout 6→7 | ship-on-green eligible |
| #852 | deps — npm_and_yarn group (3 dirs) | needs review |

## 2. PHASE-TRACKER PENDING (carry-overs)
- **P3** — `P3-T-COMMUNICATION-LOG` deferred (Driver Detail missing Communication Log tab).
- **P5** — `P5-G-COMBINED` (driver-vendor merges + Faro daily import + equipment-loan attribution) — IN REVIEW, awaiting merge OK.
- **P6** — `P6-WF041-PRESETTLEMENT-SYSTEM` DEFERRED — `dispatch.presettlements` table/service does not exist; lifecycle documented, unbuilt.
- **P7 hardening (~11–15 tickets)** — seed fixtures (loads/banks/bank-txns), RLS-verify fixture, office/driver iPhone smoke, prod health smoke, stale-QBO pill, lint:fastify-routes + lint:deps CI wiring, WhatsApp templates, email-queue smoke, scheduled-report e2e, P7-AUDIT-P0-2-HOTFIX-2 (15 boot-env offenders), P7-SAFETY-EVENTS Block 02.

## 3. TIER-1 FINANCIAL / SECURITY (gated — NEVER self-merge, ~12–15)
| Item | Status |
|------|--------|
| EscrowForfeit backend route `/driver-finance/escrow/{driverId}/forfeit` | **UNIMPLEMENTED** — M-1 tracked debt; Forfeit button 404s |
| COA dual-dataset repoint (QBO-parity B5 / 7.2) | GATED — Task-0 data-source audit first (page ~50-row seed vs posting ~199 QBO-mirror) |
| EXPENSE_GL_POSTING_ENABLED flip (B2, #1021 verified) | READY, gated |
| GAP-EXPENSES Phase 2 Step 3 — expense→GL posting + reversing-JE void | GATED (EXPENSE_GL_POSTING_ENABLED) |
| COA #6999 partial-unique guard (Design-C, B1) | HELD-FOR-GO (staged) |
| GAP-EXPENSES Phase 3 — QBO purchase sync | design exists, needs row |
| EXPENSE-VOID-IF-LINKED (Gate-3/Gate-4) + void-enforcement live | design-first |
| Period-close × expense postings | partial |
| **SEC-PROD-APP-ROLE-BYPASSES-RLS (#878)** | design-first — **highest blast radius** |
| Settlement posting + driver-loan auto-deduct (QBO-parity Block F) | 5 open design Qs for Jorge |
| Opening balances / USMCA master-data writes | owner-entered only, gated |
| Open finance PRs: #814 periods seed · #816 CoA role-bindings+period-lock · #803 audit-log · #124 QBO indexes · #801 RLS gate | awaiting per-PR Jorge OK |
| 🚨 **Audit-spine `events.log_event` drift** (found 2026-06-24) | committed 13-arg fn inserts text into uuid actor/subject cols; prod runs an out-of-band patched fn; every spine emitter affected — GUARD to confirm prod fn body + events grants |

## 4. DESIGN-DOC / SPEC QUEUE — built-from-spec, mostly NOT built
- **Finance Hub:** FH-1 Fixed Assets+Depreciation, FH-2 Loan Wizard (in flight #1023), FH-3 Amortization, FH-4 Calculator, FH-5 Bankruptcy Modeler (largest, POST-TO-BOOKS locked), FH-6 Tax Manager (+6a property-tax), FH-7 Unit Allocation, FH-8 Lease Contract.
- **VOID-EVERYWHERE:** PR-1 (Invoices+JEs), PR-2 (Bills), PR-3 (Expenses+Settlements) — gated, default OFF.
- **QBO-Parity v2/v3 Blocks A–H:** A2 inline +Add, B1–B3 catalog restructure, B4 Reclassify, B5 CoA repoint, B6/B7 bank-match+reconcile-commit, B8 (11 transaction editors), B9 Bank Register inline-edit. A1 merged, A3 in review (#825).
- **Visuals-First V0–V4:** V0 sidebar nav BLOCKED on guard conflict (cash-flow adjacency); V1 Cash Flow page, V2 Driver Hub, V3 Dispatch Planner, V4 grammar — not built.
- **Relay internal-bank + diesel-code**, **Mileage model**, **Account-type/detail-type catalog**, **AP-aging**, **QBO-bills migration**.

## 5. TIER-3 SHIP-ON-GREEN FEATURE BLOCKS (genuinely pending subset)
- **Dispatch:** DISP-OVERVIEW (Block 1), DISP-KANBAN-STATES (Block 3), DISP-ROUNDTRIPS (Block 4), DISP-LIST-TABLE-ASSIGN (Block 5), DISP-DRAWER-WIRE (Block 12), DISP-FINES-DEDUCT (Block 13), DISPATCH-LIVE-ETA, planners split-nav.
- **Audit spine A1–A9** (A1 link-columns → A9 CI emit-guard) — note §3 drift blocks the emit path.
- **Workflow waves:** W1B Tasks module, W2A Profitability engine, W2B Alert profiles, W2P Planner redesign, W3A Geofence engine, W3B Forced-ack, W4A Signed safety docs, W4B Broker auto-update, W5 Time-utilization.
- **Settlement recovery A3** (capped-payroll engine + wiring + GL JE + shadow-run), **driver sub-account provisioning** (asset + escrow + bulk backfill), settlement deduction ledger DDL.
- **Safe-additive queue:** docs-upload UI, help-article stubs, hide-stub-nav, classes bulk-edit, driver-inbox reporting, reefer 15-min poller, create-task UI.
- **Catalogs:** account-register D5, account-type catalog backend, services-catalog Samsara ingest finish.
- **Cross-border/scale tiers:** TIER14 Mexico Ops, TIER15 Mechanic Shop, TIER20 secrets-rotation, TIER21 DR-drill, TIER23 degradation matrix, TIER26 partition, TIER27 canary, TIER28 vendor-lockin, TIER29 known-limitations.
- **UI cleanup:** navy page banner standard, OB1 nav-header unify, SIDEBAR-V2-REORG-25, settlements sidebar rename/move.
- **Bugfixes w/ blocks:** insurance policy_unit is_active 500, inventory parts 404, Samsara webhooks restore, audit nested-modals, prod-stub strings, test-data-leak archive, GUARD M2 FK detection, ci.yml conflict markers.

## 6. GAP SPECS (Phase 4–7) — spec written, ~55 NOT built
- **P4 telemetry/PWA/ELD:** gap-23/25 Samsara cache+active-set, gap-34/36 driver-PWA dispatch+incident, gap-55 CAP-1 live GPS, gap-56 CAP-4 auto-status, gap-57 CAP-5 tri-signal, gap-58 CAP-8 engine-fault auto-WO, gap-59 CAP-9 pairing, gap-62 CAP-12 tire, gap-63 CAP-13 brake, gap-83 ELD audit trail, gap-54 WF-051 250ft, gap-39 geofence state-machine.
- **P5 banking/settlement:** gap-45 cash-flow CPM, gap-64 CAP-14 cargo sensors, gap-53 bank multi-company drift.
- **P6 reports/scoring/home:** gap-41 reports hub (9 cats), gap-42 IFTA, gap-43 scheduled reports, gap-46 anomaly, gap-50 AI photo-compare, gap-60 CAP-10 driver-scoring, gap-61 CAP-11 fuel-fraud, gap-65–69 home views (owner/dispatcher/accounting/safety/driver-mgr), gap-71 driver-retention, gap-72 customer-relationship, gap-76 deadhead optimizer, gap-87 audit-log viewer, gap-89 Cmd+K.
- **Unphased:** gap-7 severe-repair OOS, gap-8 assignments quicksave, gap-19 detention invoice, gap-20 recurring bills, gap-26 border crossings, gap-27 geofence recon, gap-28 layover, gap-29 booking-gap analytics, gap-30 late-arrival, gap-31 multi-stop extra-rate, gap-32 free-time detention, gap-37 equipment dual-confirm, gap-38 damage-insurance continuity, gap-40 damage-photo EXIF, gap-48 driver-ops depth, gap-49 DVIR severity, gap-52 driver-vendor mapping, gap-70 EDI foundation, gap-82 cert-expiry, gap-91 mobile-audit (ongoing), gap-92 feature-flags (ongoing).
- **Partial (schema shipped, UI pending):** gap-44 Form-425C exhibits, gap-81 drug/alcohol UI, gap-85 permits/toll-tags UI.

## 7. NO INSTRUCTIONS YET (spec-only or capture-incomplete)
- Forensic-audit follow-up (`IH35-TRANSPORTATION-FORENSIC-AUDIT-2026-06-08.md`) — 10 findings, 199-account chart; owner/CPA capture required.
- QBO-parity **11 transaction editors** not yet captured (Bill·Check·Bill-Payment·Vendor-Credit·PO·Invoice·Sales-Receipt·Receive-Payment·Deposit·JE·Transfer).
- Outstanding QBO design captures: inline +Add chrome, More-filters panels, per-table gear column-toggle lists, CoA edit-panel chrome.
- `~144` `.block-ready` JSONs with null/unset metadata — need completion or archival (part of DONE-DRIFT reconcile).

## 8. NEW GUARD PACKETS — 2026-06-24 (`~/Downloads/DISPATCH AND TESTS/`)
### 8a. Dispatch Load-Board fixes — 7 blocks (Tier-3 non-financial; ship-on-green, Jorge merges)
- **Block 1 — [CRITICAL · PROD-BLOCKING]** `GET /api/v1/dispatch/loads/{id}` 500s: `column l.trailer_id does not exist`. `mdata.loads` has no `trailer_id` — only `assigned_unit_id` (uuid) + `trailer_type` (string). One bug, many symptoms: cancel-flow loads overview→500→load stays on board; Cancelled column shows count 1 but renders empty. **FIX:** swap `l.trailer_id` for the real column per intent (`trailer_type` or `assigned_unit_id`+join units); do NOT invent a trailer FK. **CI guard:** integration test `GET /dispatch/loads/{seeded}` asserts 200.
- **Block 2** — every Kanban column header + count CLICKABLE → existing List view pre-filtered to that status (reuse filter param, additive).
- **Block 3** — Kanban column-config GEAR (parity w/ List/Table) + fix broken vertical scroll (column body `overflow-y`).
- **Block 4** — pagination correctness: "Showing 1-2 of 2" wrong while 36 rows render; fix count + add page controls (reuse existing pagination component).
- **Block 5** — UNIVERSAL audit: columns NOT user-resizable app-wide; remove any resize handles + add CI guard.
- **Block 6** — column order: move LOAD # to immediately after TRAILER in every list app-wide (additive reorder).
- **Block 7** — Planners: profile+fix slow load; move per-driver Book into its own column; bring all planners to tasks-style layout.
- Sequencing: Block 1 first (deploy, GUARD verifies live 200 + cancel works), then 2→7. One writer per file per cycle; [VERIFY] live/repo before coding; CI guard per fix.

### 8b. Test/demo unit+trailer purge — SAFETY-CRITICAL (gated, prod data removal)
- Production data removal of test/demo vehicles+trailers from Dispatch/Maintenance/Service. **4 steps + hard rails:** (1) IDENTIFY read-only report (id/name/VIN/marker/created_at + linked-record counts), **show Jorge the exact list FIRST**; (2) decide semantics — **GUARD recommends SOFT-DELETE/archive** (reversible, no FK-break), hard-delete only with zero linked rows + explicit OK; (3) build idempotent transaction-wrapped purge with **DRY-RUN**, coder proves on Neon branch only; (4) verify boards clean + reversibility. **NOTHING deleted until Jorge confirms the exact set.** GUARD does not run prod deletes. Confirm whether the demo LOADS on the board (T139 + 36 awaiting) also go. Separate lane — does NOT block Block 1.

---

### Trustworthy headline numbers
- **Open PRs:** 6 (2 Tier-1 HOLD, 4 deps/CI).
- **Tier-1 financial/security gated:** ~12–15.
- **Reconciled true-actionable backlog:** ~60–75 blocks.
- **Raw `.block-ready` JSONs:** 294 (≈148 marked BUILD/READY) — inflated by DONE-DRIFT; not a pending count.
- **Gap specs not built:** ~55 (Phase 4–7).
- **Single source of truth for built-vs-pending = merged PRs**, not block JSONs. Exact split needs the `CHORE-UNVERIFIED-ROWS-RECONCILE` PR cross-check.
