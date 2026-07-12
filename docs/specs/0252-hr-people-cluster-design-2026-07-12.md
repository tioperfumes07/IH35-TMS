# 0252 cluster — HR / People audits remediation design (owner-gated, needs-design)

**Date:** 2026-07-12 (CST) · **Author:** agent (non-stop 0252 backlog pass)
**Scope:** all 14 `.block-ready/0252-audit1{36..48,50}-*` blocks. Every block in this cluster was recovered
from `docs/trackers/MASTER-MANIFEST-2026-07-10.json` (source doc
`0252__09-CASCADE-07-04-2026-PHASE-7-HR-PEOPLE-AUDITS-Final-Complete.md`) and cross-checked against **live
repo code this session**. **Result: 0 buildable, 14 needs-design.** This is a design/plan only — nothing
was built.

## Why nothing was built (verified vs live code)
Every block shares three disqualifiers from the buildable-non-financial lane:
1. **No governing spec** — every manifest row is `spec: NONE`, `verdict: needs-design` (146 = `partial`).
   Per the standing law *never build from a defect list — read the spec first*, an audit finding that says
   "no X module exists" is **not** a build instruction; it needs an IH35-scoped spec/approved-screen first,
   and none exists anywhere in the repo.
2. **Each requires NEW `hr.*` schema** — there is no internal-employee HR domain in the DB today. A new
   schema/table = migration = **financial-cluster / owner-ceremony (§1.4/§2)** → design-doc only, never
   built solo.
3. **No existing module surface** to attach a non-financial query/validation/error-state/guard to. These
   are greenfield modules, not gaps in a shipped screen.

### Live-code verification performed this session (evidence)
- `apps/backend/src/` — **no** dir matching `hr|recruit|train|perform|compensat|benefit|engag|turnover|divers|culture|wellness|remote|relation|osha`.
- `grep -rilE 'recruitment|applicant.track|performance.review|benefits.admin|osha' apps/backend/src apps/frontend/src` → **0 hits**.
- `grep -rlE 'CREATE SCHEMA.*(hr|recruit|people)' db/migrations/` → **0 hits** (no HR schema).
- Near-analogs found, all **domain-distinct** from these internal-employee audits (so they do NOT already
  satisfy the blocks):
  - `apps/frontend/src/pages/safety/training/TrainingProgramsPage.tsx` = FMCSA **driver** safety training,
    not an employee LMS (audit138).
  - `apps/backend/src/safety/incidents.routes.ts` + `dvir.routes.ts` / `dvir-submit.service.ts` = DOT/FMCSA
    **driver-safety** lens (`safety.incidents`, `safety.dvir_submissions`) — no OSHA/workplace-injury
    dashboard layer (audit146).
  - `catalogs.driver_termination_reasons` (`db/migrations/0023_driver_safety_file.sql`) +
    `mdata.drivers.deactivated_at/archived_at` = **driver-specific**, not a general employee-turnover
    system (audit143).

> **UNVERIFIED — needs prod check:** the above is verified against the local repo (migrations + source).
> Schema absence was NOT re-confirmed against the gated Neon prod branch this session (§0/§1.5). Before any
> `hr.*` migration is authored, confirm on prod that no `hr` schema / employee tables already exist.

---

## IH35-specific scoping (the audit template is generic corporate-HR; most items are low-relevance here)
The source is a generic corporate-HR audit checklist, **not** scoped to a Laredo↔Mexico trucking carrier.
Two locked facts sharply narrow relevance:
- **Drivers are Mexican-B1 1099 contractors, NOT W-2 employees** (memory `finance-build-directive-and-driver-model`).
  So driver-facing "benefits / wellness / engagement / diversity / performance-review / compensation-equity"
  do **not** apply to the driver population — only to the small internal office/dispatch staff.
- **Field vs office** — "remote-work productivity tracking" is near-irrelevant (drivers are field workers;
  office staff are on-site in Laredo).

Recommended owner triage (build value, highest → lowest):

| Block | Audit | IH35 relevance | Recommendation |
|---|---|---|---|
| 0252-audit136 | HR policy/procedure + compliance tracking | **Medium** — a real doc-management need for office staff + carrier policies | Candidate #1 if owner wants HR; small `hr.policies` + ack-tracking |
| 0252-audit146 | OSHA workplace-safety dashboard | **Medium** — genuine for yard/shop injuries, distinct from DOT/FMCSA | Candidate #2; layer over/next to existing `safety.incidents` |
| 0252-audit137 | Recruitment / hiring pipeline | **Low-Med** — driver hiring pipeline exists in spirit via `driver-hiring-contract-spec`; office hiring is small-volume | Defer; reconcile with existing driver-hiring work first |
| 0252-audit143 | Turnover / exit-interview | **Low-Med** — driver turnover partially covered by `driver_termination_reasons` | Defer; extend driver analog before a generic system |
| 0252-audit138 | Employee training / LMS | **Low** — driver training already exists (FMCSA); office LMS is small | Defer |
| 0252-audit139 | Performance review / goals | **Low** — office-staff only | Defer |
| 0252-audit140 | Compensation structure / pay-equity | **Low** — driver pay is 1099 settlements (out of scope); office payroll small | Defer |
| 0252-audit141 | Benefits administration | **Very low** — 1099 drivers have no benefits | Defer / likely N/A |
| 0252-audit142 | Engagement / satisfaction | **Very low** | Defer / likely N/A |
| 0252-audit144 | Diversity / inclusion metrics | **Very low** | Defer / likely N/A |
| 0252-audit145 | Workplace-culture assessment | **Very low** | Defer / likely N/A |
| 0252-audit147 | Wellness / health program | **Very low** (P3 in source doc itself) | Defer / likely N/A |
| 0252-audit148 | Remote-work policy/productivity | **Very low** (field workforce) | Defer / likely N/A |
| 0252-audit150 | Employee relations / grievance | **Low** — office-staff only | Defer |

**Recommendation:** do NOT build 14 speculative HR modules. If the owner wants an HR footprint at all, scope
**one** small office-staff HR module starting with **audit136 (policy/ack tracking)** and **audit146 (OSHA
incidents)**, and treat the remaining 12 as `N/A → deferred` until there is a real business need + spec. This
matches §7 additive-only and avoids gold-plating an out-of-domain checklist.

---

## Reference schema/linkage approach (IF the owner greenlights an HR module — owner-ceremony gated)
This is a **plan only**. No SQL is authored here; no GL/posting math is involved (HR policy/OSHA tracking is
operational, not financial — but a NEW schema/table still triggers §2 owner ceremony). When/if greenlit:

- **New schema `hr.*`** (never `ih35_app.*`), created with the **0065 grants pattern** + **FORCED RLS**:
  `identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)`.
  UUIDv7 server PKs; `is_active` + `voided_at`/`archived_at` (void-not-delete); `audit.row_changes` coverage;
  `security_invoker=true` on any view.
- **Migration discipline (§2):** number strictly above main's max at push time; idempotent
  (`CREATE ... IF NOT EXISTS` / `DO` guards); must replay green on a **fresh CI DB from 0001** (JOIN
  gracefully, never `RAISE` on absent runtime data). Validate against a throwaway local Postgres — **never**
  `npm run db:migrate` in this clone (it can hit prod). Show the owner full SQL + `git diff --staged --stat`
  → **WAIT for explicit "OK to merge."**
- **Linkage (§10 matrix)** — every HR record wires both ways:
  - `hr.employees` (office staff) → `identity.users` (login), `org.companies` (`operating_company_id`).
    Keep **separate** from `mdata.drivers` (drivers are 1099 contractors, a different population) — link, do
    not merge.
  - audit136 `hr.policies` + `hr.policy_acknowledgements` → employee + `docs.files` (policy PDF evidence).
  - audit146 `hr.osha_incidents` → `hr.employees`, and cross-link to existing `safety.incidents` /
    `mdata.units` (if yard/equipment involved) so OSHA and DOT/FMCSA safety are joined, not siloed.
  - audit143 turnover → reuse `catalogs.driver_termination_reasons` pattern; add
    `hr.employee_separations` for office staff, linked to `hr.employees`.
- **Feature flags default OFF**; each HR surface behind `isEnabled(...)` honoring overrides; nav additive on
  the existing top bar (no second sidebar; `SIDEBAR_ITEM_IDS` contract respected — a new module id is an
  owner decision).
- **NOT financial-posting:** HR policy/OSHA/turnover tracking involves no GL, no `accounting.*`,
  no `catalogs.accounts`. If a future comp/benefits module (audit140/141) ever posts payroll cost, THAT is
  financial-cluster and gets its own owner-gated posting design — never built solo, reuse existing posting
  functions, write NO new GL math.

---

## Per-block disposition (all 14)
| Block | manifest verdict | disposition this pass | reason |
|---|---|---|---|
| 0252-audit136-hr-policy-tracking | needs-design | **DESIGN-ONLY** | no spec, needs `hr.*` migration; candidate #1 |
| 0252-audit137-recruitment-system | needs-design | **DESIGN-ONLY** | no spec/schema; reconcile w/ driver-hiring first |
| 0252-audit138-training-system | needs-design | **DESIGN-ONLY** | driver training exists; office LMS unspecced |
| 0252-audit139-performance-management | needs-design | **DESIGN-ONLY** | no spec/schema |
| 0252-audit140-compensation-structure | needs-design | **DESIGN-ONLY** | driver pay = 1099 settlements; office comp unspecced |
| 0252-audit141-benefits-administration | needs-design | **DESIGN-ONLY** | 1099 drivers → likely N/A |
| 0252-audit142-engagement-tracking | needs-design | **DESIGN-ONLY** | likely N/A |
| 0252-audit143-turnover-analysis | needs-design | **DESIGN-ONLY** | driver analog exists; office system unspecced |
| 0252-audit144-diversity-metrics | needs-design | **DESIGN-ONLY** | likely N/A |
| 0252-audit145-workplace-culture | needs-design | **DESIGN-ONLY** | likely N/A |
| 0252-audit146-workplace-safety-osha | partial | **DESIGN-ONLY** | `safety.incidents`/`dvir` exist; OSHA layer unspecced; candidate #2 |
| 0252-audit147-wellness-program | needs-design | **DESIGN-ONLY** | P3 in source; likely N/A |
| 0252-audit148-remote-work-policy | needs-design | **DESIGN-ONLY** | field workforce → near-irrelevant |
| 0252-audit150-employee-relations | needs-design | **DESIGN-ONLY** | no spec/schema |

**Gate:** every item above is blocked on (1) an owner decision to build an HR footprint at all, (2) an
IH35-scoped spec/approved-screen, and (3) §2 owner ceremony for the `hr.*` migration. Until then they remain
`needs-design`. No build, no guard, no migration authored this pass.
