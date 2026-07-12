# Phase-13 Specialized-Industry-Audit Cluster — Disposition + Financial Design Direction

**Date (CST):** 2026-07-12
**Author:** backlog build pass (phase13-* cluster)
**Source dispatch:** `0245__15-CASCADE-07-04-2026-PHASE-13-SPECIALIZED-INDUSTRY-AUDITS-Final-Complete.md`
**Intent recovered from:** `docs/trackers/MASTER-MANIFEST-2026-07-10.json` (rows `phase13-audit216..230`)
**Type:** DESIGN / DISPOSITION ONLY — no code, no schema, no migration, no GL. Companion to the phase13 backlog pass.

---

## 0. Why this is a design/disposition doc and not a build

Every one of the 14 `phase13-audit*` blocks carries a single acceptance criterion of
`kind: design, spec: NONE` in the manifest. They are **industry-vertical gap findings** from a
"does this TMS cover industry X" sweep, not field-level buildable specs. Under §0 (verify-everything)
and the standing "never build from a defect list — read the spec first" rule, there is **no
approved-screen or field spec** to build any of these against. The honest disposition of the cluster:

- **8 are N/A** — out of scope for a trucking carrier (the audit doc itself marks them N/A).
- **2 are duplicates** of earlier audits (already tracked; do not double-build).
- **2 are FINANCIAL** (banking, insurance) → design direction below; **owner-gated**, never self-built.
- **2 are "partial" non-financial** (transportation dashboard, logistics) → verified **already
  substantially covered** by the existing reports module + Home charts; the only real remaining gap
  (route optimization) is a **deferred future module** (`load-board-module-planned`) with no spec.

**Net: nothing in this cluster is a bounded, spec-backed, genuinely-buildable non-financial change.**
No fake-green build was produced. Verified evidence per block below.

---

## 1. Per-block disposition (all 14)

| Block | Manifest verdict | Verified disposition | Action |
|---|---|---|---|
| phase13-audit216-banking-industry | needs-design (FINANCIAL) | Real gap: lending-ops tracking (CCG equipment loans), banking risk, banking dashboard | **DESIGN §2** — owner-gated |
| phase13-audit217-insurance-industry | needs-design (FINANCIAL, db_touch) | Real gap: claims workflow, underwriting, solvency, insurance dashboard | **DESIGN §3** — owner-gated |
| phase13-audit218-healthcare-na | not-built | N/A — patient care out of scope | REPORT N/A |
| phase13-audit219-pharmaceutical-na | not-built | N/A — drug development out of scope | REPORT N/A |
| phase13-audit220-manufacturing-duplicate | partial | **DUPLICATE** of `phase3-audit70-manufacturing-qc` (superseded_by) | REPORT DUP — do not build |
| phase13-audit221-retail-na | not-built | N/A — retail store-ops out of scope | REPORT N/A |
| phase13-audit222-restaurant-na | not-built | N/A — food-service out of scope | REPORT N/A |
| phase13-audit223-hospitality-na | not-built | N/A — guest-experience out of scope | REPORT N/A |
| phase13-audit224-transportation-dashboard-route-optim | partial | **Substantially built** (see §4); route-optim = deferred module | REPORT partial + §4 |
| phase13-audit225-logistics-warehousing | partial | Warehousing N/A (asset-based carrier, no warehouse); logistics dashboard covered by reports; supply-chain/distribution optimization overlaps route-optim (deferred) | REPORT N/A/deferred + §4 |
| phase13-audit226-construction-na | not-built | N/A — construction PM out of scope | REPORT N/A |
| phase13-audit228-energy-duplicate | not-built | **DUPLICATE** of `phase12-audit210-energy` (superseded_by) | REPORT DUP — do not build |
| phase13-audit229-mining-na | not-built | N/A — mining/extraction out of scope | REPORT N/A |
| phase13-audit230-agriculture-na | not-built | N/A — farming out of scope | REPORT N/A |

---

## 2. audit216 — Banking (FINANCIAL — DESIGN ONLY, owner-gated)

**Verified live (repo):** `banking.bank_accounts` / `banking.bank_transactions` real; Plaid integration
present. `grep -rilE 'lending.?operations|banking.?risk' apps/` → **empty (re-run empty)** — no
lending-operations or banking-risk surface exists.

**Real gap:** the carrier has **equipment financing (Commercial Credit Group / CCG)** and factoring
liabilities that today live only as raw bank transactions with no dedicated loan/risk tracking.

**Design direction (NOT to be self-built — financial cluster, §1.4):**
- Lending-operations tracking = a **loan/note sub-ledger** (CCG equipment notes, Faro/RTS factoring
  advances): principal, rate, term, amortization schedule, current balance, next-payment. This touches
  `accounting.*` / a new schema + posting → **owner ceremony + migration gate**. Reuse existing
  posting/GL functions; write NO new GL math (§2 invariants). Escrow/factoring already ruled
  secured-borrowing (see memory `faro-factoring-contract-terms`, `dip-cash-and-factoring-answered`).
- Banking-risk assessment / dashboard = **read-only analytics** over `banking.*` (cash position,
  covenant headroom, days-cash-on-hand). The dashboard *view* could later be a non-financial UI slice
  **once a spec exists** — it does not today. No build now.
- Linkage (§10): loan records must FK to `mdata.units` (owner/lessee, **not** operating_company_id) for
  equipment notes, to `mdata.vendors` (lender), and to the JE/liability account.

**Gate:** migration + `accounting.*` + GL posting → STOP, owner-entered/owner-approved only.

---

## 3. audit217 — Insurance (FINANCIAL / db_touch — DESIGN ONLY, owner-gated)

**Verified live (repo):** `insurance.policy` / `insurance.policy_unit` real and wired
(`apps/backend/src/safety/damage-continuity/insurance-link.service.ts`, compliance missing-required).
`grep -rilE 'claims.?management|claim.?workflow|claims.?intake' apps/` → **empty (re-run empty)** — no
claims workflow. The manifest-cited spec `docs/specs/qbo-parity/INSURANCE-BLUEPRINT-ADDITION.md`
**does NOT exist** on disk (verified `ls` empty) — that citation is stale; a real spec must be authored
before any build.

**Real gap:** claims intake/tracking workflow, underwriting-process tracking, solvency tracking,
insurance dashboard.

**Design direction (NOT to be self-built):**
- Claims workflow = new `insurance.*` tables (claim, claim_status_event append-only, claim↔policy↔unit
  ↔driver↔safety_event FKs). New schema → **migration + GRANTs/FORCED-RLS (0065 pattern) → owner gate.**
- **§10 linkage matrix is the whole point here:** a claim must wire **both ways** to safety
  (`safety.safety_events` — reverse link already exists per PR #2381), insurance (`insurance.policy`),
  legal, maintenance (repair WO), the load, the unit/driver, AND its money legs (deductible expense,
  recovery A/R, reserve liability). Silence = defect.
- Insurance dashboard/underwriting/solvency = read-only analytics, spec-first, later.

**Gate:** new schema/migration + insurance financial linkage → STOP, owner approval + migration ceremony.

---

## 4. audit224 / audit225 — Transportation dashboard & logistics (NON-FINANCIAL — verified already covered)

**This is the honest correction of a stale 07-04 finding.** The manifest claimed "no fleet-utilization
… engine exists" and only "Home's general widgets." Verified against **live repo 2026-07-12:**

- **Fleet utilization EXISTS:** `apps/frontend/src/pages/home/charts/FleetUtilizationGauge.tsx` (+ test)
  with a live `fetchHomeFleetUtilization` endpoint and threshold coloring.
- **Home analytics EXISTS:** `WeeklyRevenueChart.tsx`, `WOStatusPieChart.tsx`, role dashboards
  (`OwnerHome.tsx`, `DefaultHome.tsx`).
- **A full reports module EXISTS** (`apps/frontend/src/pages/reports/`): LaneProfitability, Deadhead,
  DispatchMargin, PerTruckCpm, ProfitPerTruck, CustomerProfitability, ManagementReportPackage,
  Geofence dwell/reconciliation, FuelReconciliation, BookingGap, LateArrival, plus a CustomReportBuilder
  and scheduled reports. This **is** the transportation-analytics surface the audit asked for.
- **Warehousing (audit225):** genuinely **N/A** — IH35 is an asset-based carrier, no warehouse operation.

**Remaining true gap:** *route optimization* / *distribution optimization* (DAT-360-style routing
intelligence). `grep -rilE 'routeOptim|route_optim' apps/` → **empty (re-run empty)**. This is a
**deferred future module** (memory `load-board-module-planned`), a major net-new build with **no spec**,
not a bounded backlog slice. **No build now; carry as deferred.**

**Disposition:** audit224 = partial→substantially-satisfied; residual route-optim = deferred.
audit225 = warehousing N/A + logistics dashboard satisfied + optimization deferred. No non-financial
build is warranted without an approved spec.

---

## 5. Duplicates (do not double-build)

- **audit220-manufacturing-duplicate** → same gap as `phase3-audit70-manufacturing-qc`
  (`superseded_by`). Maintenance schema + `fleet.equipment` exist; production-tracking/QC is the same
  single open item tracked there.
- **audit228-energy-duplicate** → same gap as `phase12-audit210-energy` (`superseded_by`). No
  energy-production/distribution operation in a trucking carrier.

---

## 6. Summary for the tracker

- **Built:** 0 (nothing bounded/spec-backed/non-financial in this cluster).
- **Design (owner-gated financial):** 2 — audit216 (banking lending/risk), audit217 (insurance claims).
- **Already-satisfied / partial:** 2 — audit224, audit225 (reports module + Home charts).
- **Duplicate:** 2 — audit220, audit228.
- **N/A out of scope:** 8 — audit218/219/221/222/223/226/229/230.

No fake-green. Any future build of 216/217 is **financial → owner ceremony + migration gate**; any
build of 224/225 route-optimization is a **deferred spec-first module**.
