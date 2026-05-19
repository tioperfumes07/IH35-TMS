# IH35-TMS Architecture + Blueprint Comparison (As of 2026-05-18)

Purpose: compare the committed architecture/blueprint baseline against current implementation, identify what is still missing, and define concrete TODOs to prevent further drift.

## Sources audited

- `docs/IH35-TMS-BLUEPRINT.md`
- `docs/IH35-TMS-ARCHITECTURE.md`
- `docs/specs/CURSOR-PERMANENT-RULES.md`
- `docs/approved-screens/DESIGN-DECISIONS-LOCKED.md`
- `docs/locked-ui-surface.json`
- `scripts/verify-architectural-design.ts`
- `docs/launch-readiness.md`
- `docs/mockup-fidelity-audit.md`
- `docs/trackers/phase-3.md`
- `docs/trackers/phase-6.md`
- `docs/trackers/phase-7.md`

---

## 1) Blueprint vs current phase status

### Baseline (what we said we would do)

From `docs/IH35-TMS-BLUEPRINT.md`:

- Phase 3 (module UI build) is in progress.
- Phase 4 (Samsara live wiring), Phase 5 (QBO live sync), Phase 6 (integrity/alert engine), and Phase 7 (cutover/launch hardening) are pending.
- Immediate active design-cycle deliverables called out:
  - Rebuild Create Work Order form to locked Excel layout.
  - Apply Combobox app-wide.
  - Build Fuel section.
  - Build Drivers section.

### Current reality (what is actually in repo)

- Phase 3: large amount shipped, but still not fully complete module-by-module.
- Phase 4/5/6/7: still pending overall, with specific deferred items explicitly recorded in trackers.
- Several phase-7 hardening tasks are open and not yet closed in tracker.

---

## 2) Module-by-module delta (what is still missing)

Status values below reflect repo evidence, not assumptions.

### Home

- Current: largely implemented structure, but visual parity still requires screenshot-level confirmation.
- Missing:
  - Final visual parity validation against approved screen.

### Maintenance

- Current: major rebuild exists.
- Missing:
  - Fleet table completion.
  - Service/location board completion.
  - WO detail integration follow-up called out in UI copy.

### Accounting

- Current: core surfaces exist, several forms were recently locked.
- Missing:
  - Bill payments route currently mapped to `ComingSoonPage`.
  - Vendor balances route currently mapped to `ComingSoonPage`.
  - Journal entries route currently mapped to `ComingSoonPage`.

### Banking

- Current: substantial implementation present; recent fixes included pagination/received mapping/home summary callout.
- Missing:
  - Dedicated banking driver escrow route/page (`/banking/driver-escrow`) still absent.
  - Dedicated banking reports route/page (`/banking/reports`) still absent.
  - QBO parity proof artifact still missing (counts/totals mismatch report per company).

### Fuel

- Current: fuel home page exists with structure.
- Missing:
  - `/fuel/planner`, `/fuel/settings`, `/fuel/inbox` remain `ComingSoonPage`.
  - Visual parity confirmation against approved mockup.

### Safety

- Current: major tabbed shell and multiple sections exist.
- Missing:
  - Some tabs still placeholder/deferred per audit docs.
  - Full visual parity confirmation.

### Drivers

- Current: route and major screens exist.
- Missing:
  - Deferred deep-tab parity: Driver Detail missing `Communication Log` tab (explicit tracker deferral).
  - Some KPIs/panels still hardcoded values (not fully live data-backed).

### Dispatch

- Current: strong implementation exists including Book Load.
- Missing:
  - Presettlement system still deferred and not scaffolded (`dispatch.presettlements` missing).
  - Several dispatch child routes still `ComingSoonPage` (`/dispatch/loads`, `/dispatch/geofencing`, `/dispatch/factoring-packets`, `/dispatch/incidents`).

### Lists/Catalogs

- Current: lists hub exists.
- Missing:
  - Dynamic routes `/lists/:domain` and `/lists/:domain/:catalogKey` still `ComingSoonPage`.
  - Some `/catalogs/*` routes still redirect to coming-soon.

### Reports

- Current: reports home exists.
- Missing:
  - Production-safe scheduled report E2E backlog item remains open in Phase 7.

### 425C

- Current: substantial implementation exists with route coverage.
- Missing:
  - Final visual parity confirmation and production filing runbook hardening.

### Driver App (PWA)

- Current: present and in use.
- Missing:
  - Phase-4 class items still deferred (offline queue expansion, push depth, etc.) from tracker backlog.

---

## 3) Cross-cutting architecture/governance drift to fix

These are drift risks independent of feature delivery.

### A. Design source governance conflict

- `docs/specs/CURSOR-PERMANENT-RULES.md` says approved PNG screens are the only design source and prototype HTML must not be used.
- `docs/approved-screens/DESIGN-DECISIONS-LOCKED.md` still includes rows citing `docs/ih35-tms-prototype.html` as source (for example Accounting/Dispatch).
- Risk: teams can legitimately choose conflicting sources.
- Required fix: normalize one canonical source policy and rewrite lock rows to match.

### B. Duplicate lock entries

- `docs/approved-screens/DESIGN-DECISIONS-LOCKED.md` has duplicate rows (for example Bill form / Expense form / Bill Payment form repeated, Banking Transactions repeated).
- Risk: ambiguity during audits and automated guard evolution.
- Required fix: deduplicate and keep one authoritative row per surface.

### C. Approved-screen artifact availability mismatch

- `docs/mockup-fidelity-audit.md` flags that manifest-declared approved PNGs are listed but not physically present in working tree.
- Risk: design verification becomes interpretive rather than deterministic.
- Required fix: ensure all approved image artifacts are present and versioned, or replace manifest with actually committed assets.

### D. Arch verifier scope gap

- `scripts/verify-architectural-design.ts` protects route presence, sidebar IDs, selected sub-nav arrays, and selected named sections.
- It does not block:
  - route still present but mapped to `ComingSoonPage`,
  - placeholder text regressions,
  - visual fidelity regressions.
- Risk: "passes arch-design" while experience still diverges from blueprint.
- Required fix: add guards for placeholder-route bans on locked modules and add component/contract checks for required panels.

### E. Baseline metadata freshness

- `docs/locked-ui-surface.json` metadata source points to an older feature branch/commit.
- Risk: audit trail confusion about which commit established current lock baseline.
- Required fix: regenerate baseline from current main when intentional lock update occurs.

---

## 4) Consolidated outstanding TODO list (all missing work)

## 4.1 Immediate module-completion TODOs (Phase 3 parity)

- [ ] Complete Maintenance unfinished sections (fleet table, service/location board, WO detail integration).
- [ ] Implement Accounting pages currently routed to `ComingSoonPage`:
  - [ ] Bill Payments
  - [ ] Vendor Balances
  - [ ] Journal Entries
- [ ] Implement Banking routes/pages still missing:
  - [ ] Driver Escrow page route
  - [ ] Banking Reports page route
- [ ] Replace remaining Fuel `ComingSoonPage` children with real screens:
  - [ ] Planner
  - [ ] Settings
  - [ ] Inbox
- [ ] Close Dispatch child route gaps still on `ComingSoonPage`:
  - [ ] Loads
  - [ ] Geofencing
  - [ ] Factoring Packets
  - [ ] Incidents
- [ ] Finish Lists/Catalogs dynamic page routes currently `ComingSoonPage`.
- [ ] Deliver Driver Detail `Communication Log` tab (explicit deferred item).
- [ ] Build full Presettlement system (`P6-WF041-PRESETTLEMENT-SYSTEM`).

## 4.2 Hardening and launch TODOs (Phase 7 tracker open items)

- [ ] `P7-FIX-SEED-001` loads seed with FK integrity.
- [ ] `P7-FIX-SEED-002` bank accounts seed (multi-company).
- [ ] `P7-FIX-SEED-003` bank transactions seed + idempotency.
- [ ] `P7-FIX-RLS-VERIFY-001` repair mdata RLS verify fixture user.
- [ ] `P7-FIX-OFFICE-SMOKE-001` authenticated office smoke setup/fix.
- [ ] `P7-FIX-OFFICE-SMOKE-002` settlement detail deep-link smoke extension.
- [ ] `P7-FIX-DRIVER-SMOKE-ENV` driver smoke env automation/docs.
- [ ] `P7-PROD-SMOKE-001` execute full authenticated production smoke.
- [ ] `P7-SCHEDULED-REPORT-E2E-001` complete scheduled-report E2E.

## 4.3 External integration TODOs (by blueprint phase intent)

- [ ] Phase 4: live Samsara wiring (real GPS/HOS/ETA ingestion in operational flows).
- [ ] Phase 5: live QBO bidirectional sync completeness and reconciliation evidence.
- [ ] Phase 6: integrity/alert engine completion.
- [ ] Phase 7: full cutover controls (backup/DR + production credentials/runbooks complete).

## 4.4 Governance/documentation TODOs (to stop future deviation)

- [ ] Align `CURSOR-PERMANENT-RULES.md` and `DESIGN-DECISIONS-LOCKED.md` on one canonical design-source policy.
- [ ] Deduplicate and clean `DESIGN-DECISIONS-LOCKED.md`.
- [ ] Ensure approved-screen artifacts are physically present and versioned.
- [ ] Extend `verify:arch-design` to fail on locked routes mapped to `ComingSoonPage`.
- [ ] Add a static CI check ensuring no locked module contains "active development/pending follow-up" placeholder copy.
- [ ] Regenerate `locked-ui-surface.json` from current main when lock updates are intentional.
- [ ] Produce and commit a formal QBO parity report artifact (TRK + TRANSP) with mismatch list.

---

## 5) Recommended execution order (to recover alignment fast)

Priority 1 (drift prevention first):

1. Governance cleanup (design-source policy alignment + lock-file dedupe + arch verifier strengthening).
2. Route-level gap closure for all `ComingSoonPage` paths tied to locked modules.
3. Presettlement system scaffold + linkage backfill path.

Priority 2 (proof + hardening):

4. QBO parity evidence report generation and commit.
5. Phase 7 seed/smoke/E2E backlog closure.

Priority 3 (phase progression):

6. Phase 4 live Samsara wiring.
7. Phase 5 full QBO sync lifecycle.
8. Phase 6 integrity/alert engine.
9. Phase 7 final cutover/DR validation.

---

## 6) Bottom line

The project has broad Phase 3 coverage, but it is not yet "fully aligned and locked" end-to-end. The biggest remaining risk is not only missing features; it is governance inconsistency (conflicting design-source rules + limited drift checks) that can reintroduce divergence even when features are shipped. Closing the governance TODOs and placeholder-route gaps first will reduce rework and keep future implementation inside one enforceable blueprint.
