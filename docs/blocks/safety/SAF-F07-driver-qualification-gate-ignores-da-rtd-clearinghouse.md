<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F07 — F07 · driver-qualification gate ignores D&A / RTD / Clearinghouse
**FINDING:** F07 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL (compliance gate) · **Module:** Safety (Driver Qualification).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Driver Qualification) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Qualification gate inputs) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md
Approved screens reviewed: docs/approved-screens/safety.png · docs/approved-screens/7Drivers.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (extends gate inputs — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None — D&A/RTD/Clearinghouse are FMCSA-mandated qualification inputs, not new scope.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The driver-qualification gate computes eligibility WITHOUT the drug & alcohol program status, return-to-duty (RTD) status, or FMCSA Clearinghouse query result — so a driver failing D&A / in the RTD process / with a Clearinghouse prohibition can read as "qualified." This is a safety + compliance defect. **Step 1 — reproduce (Rule 10, lucia):** (a) grep the qualification-gate logic; enumerate the inputs it evaluates; confirm D&A / RTD / Clearinghouse are absent. (b) Confirm the source tables exist and their status columns: `SET app.bypass_rls='lucia'; SELECT to_regclass('safety.drug_alcohol_tests'), to_regclass('safety.clearinghouse_queries'), to_regclass('safety.rtd_process');` then inspect their status columns (do not assume names — not in backbone). (c) In browser, construct a driver with a failing D&A/Clearinghouse status and confirm the gate still shows qualified. Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the gate READS the canonical D&A / RTD / Clearinghouse tables `safety.*` [AUDIT — confirm to_regclass live]; NEVER a RETIRE table, NEVER a stale cache.
2. Hub matrix (both-way): qualification result → `mdata.drivers` (reverse: driver profile shows the gate + its failing inputs) · `org.companies` · `identity.users` (evaluator/override) · D&A/RTD/Clearinghouse records (reverse: each drills to the driver).
3. Cross-module (Rule 21 §1) — Safety §10.3: qualification gate → Driver (blocks dispatch when disqualified) → Dispatch (a disqualified driver cannot be assigned); Driver detail reverse section (SAF-F16) surfaces D&A/Clearinghouse.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
FMCSA 49 CFR Part 382 (D&A, RTD) + Part 382 Subpart G (Clearinghouse: an employer must not allow a driver to operate a CMV with a "prohibited" status) + Part 391 driver qualification. McLeod/Alvys gate dispatch on these exact inputs; a gate that ignores them is non-compliant and unsafe.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — extend the gate's inputs; no data change; overrides are append-only, void-not-delete, actor-stamped. Enforce: operating_company_id RLS on D&A/RTD/Clearinghouse tables · security_invoker views · append-only audit on any manual override. Non-financial — Rule 13/19 N/A (unless a fee is tied, which it is not here).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the gate's input set omits three FMCSA-mandated statuses. Fix: extend the qualification computation to READ current D&A program status, RTD status, and Clearinghouse query result from their canonical tables, and treat a failing/prohibited status as DISQUALIFYING (or requiring an explicit, audited override) — surfacing the specific failing input. Do not invent thresholds; use the recorded statuses. The gate result must be recomputed on status change, not cached stale.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-qualification-gate-inputs.mjs` + `scripts/verify-steps/NNN-verify-qualification-gate-inputs.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (gate logic does not reference D&A / RTD / Clearinghouse status), PASSes on fix (all three consumed and disqualifying). `--selftest` mutates a real gate copy to drop a Clearinghouse check, asserts flagged; asserts the full-input gate not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a driver with a failing D&A / open RTD / prohibited Clearinghouse status reads DISQUALIFIED in the gate and cannot be dispatched; the failing input is named; guard green. UNVERIFIED — gate logic + source table/columns pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F07
LANE: NON-FINANCIAL
DOD-A: PASS — qualification gate is the active eligibility path; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: N/A (computed gate) — override form fields (if any) controlled + in payload.
DOD-C: PASS — gate ↔ driver ↔ D&A/RTD/Clearinghouse records FKs both ways; no memo/uuid-in-name/jsonb.
DOD-D: N/A — non-financial gate.
DOD-E: UNVERIFIED — gate logic + source tables pending Step-1.
VERIFY-1: PASS — gate result rendered in QBO chrome on the driver; failing inputs itemized.
VERIFY-2: N/A — no catalog picker (status comes from records, not a free picker).
VERIFY-3: PASS — nav→driver→qualification→API→canonical D&A/RTD/Clearinghouse tables (never RETIRE)→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: Clearinghouse prohibition→gate→dispatch block, both ways.
VERIFY-5: PASS — TRANSP + USMCA isolation; no cross-entity status leak.
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on D&A/RTD/Clearinghouse; correct GUC; security_invoker; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: qualification-gate-logic, da-status-reader, clearinghouse-status-reader, rtd-status-reader
MIGRATE: N/A — read-logic extension; no DDL (source tables exist per Step-1). If a status column is missing, separate idempotent migration above both maxes (FORCE RLS), not this block.
ROOT CAUSE: qualification gate omits FMCSA-mandated D&A / RTD / Clearinghouse inputs → a prohibited driver can read as qualified.
FIX: extend the gate to read + enforce all three statuses as disqualifying (with audited override), recomputed on change. Files: qualification-gate module, D&A/RTD/Clearinghouse status readers.
GUARD: scripts/verify-steps/NNN-verify-qualification-gate-inputs.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 gate-logic reproduce + prod disqualified-driver proof.
REMAINING: depends on SAF-F06 (D&A screens reachable) for live D&A data; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
