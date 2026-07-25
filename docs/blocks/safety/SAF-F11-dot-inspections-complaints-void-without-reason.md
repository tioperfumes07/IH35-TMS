<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F11 — F11 · DOT-Inspections / Complaints void without a reason
**FINDING:** F11 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL · **Module:** Safety (DOT Inspections / Complaints).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/DOT Inspections · §Complaints) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§void-not-delete + reason) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (void requires reason + actor)
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (void UX + audit — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
DOT Inspection and Complaint records can be VOIDED with no reason captured and (likely) no actor/timestamp — breaking the audit trail for compliance records. A void without a reason is an untraceable state change on a DOT/FMCSA-relevant record. **Step 1 — reproduce (Rule 10, lucia):** (a) grep the void handlers for DOT inspections + complaints; confirm they set a void/status flag WITHOUT requiring a reason (and check for actor/timestamp). (b) Confirm the target tables + their void/audit columns: `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name IN ('dot_inspections','complaints') AND column_name IN ('voided_at','void_reason','voided_by');` (do not assume names — not in backbone). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: void writes an append-only status + `void_reason` + `voided_by` + `voided_at` on the canonical `safety.dot_inspections` / `safety.complaints` [AUDIT — confirm columns live]; the reason binds a reason catalog where one exists (e.g. `catalogs.complaint_types` is PER-ENTITY, backbone-verified). NEVER a hard DELETE, NEVER a RETIRE table.
2. Hub matrix (both-way): void event → record → `mdata.drivers`/`mdata.units` · `org.companies` · `identity.users` (voided_by). Void is visible in the record's history both ways.
3. Cross-module (Rule 21 §1) — Safety §10.3: DOT inspection/complaint → Driver, Unit, Operating Company; a void shows in Driver/Unit reverse sections (SAF-F16/F17) with its reason.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite void-with-reason + audit stamp; FMCSA recordkeeping expects traceable changes to inspection/complaint records. Strong audit trails, no silent state changes.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — void-not-delete with a mandatory reason; append-only audit (actor + timestamp + reason). Enforce: operating_company_id RLS on both tables · security_invoker views · display IDs server-generated. Non-financial — Rule 13/19 N/A.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the void action does not require or persist a reason (nor reliably an actor/timestamp). Fix: require a reason on void (catalog-bound where a reason catalog exists, else required structured text), persist `void_reason` + `voided_by` + `voided_at` as an append-only status change, and block the void until a reason is provided — server-side AND client-side. Surface the void + reason in the record history. If the void columns are missing, add them via idempotent migration above both maxes (FORCE RLS).

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-safety-void-reason.mjs` + `scripts/verify-steps/NNN-verify-safety-void-reason.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (DOT inspection / complaint void path accepts no reason), PASSes on fix (reason required + persisted with actor/timestamp). `--selftest` mutates a real void handler copy to drop the reason requirement, asserts flagged; asserts the reason-required shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, voiding a DOT inspection / complaint requires a reason, records voided_by/voided_at, and the void+reason appears in history + Driver/Unit reverse sections; guard green. UNVERIFIED — void handlers + columns pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F11
LANE: NON-FINANCIAL
DOD-A: PASS — void action on the active DOT/complaint records; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: FAIL→PASS — void reason field controlled AND in payload; submit blocked until provided.
DOD-C: PASS — void ↔ record ↔ driver/unit/company/actor FKs both ways; reason binds a real catalog where available; no memo-only.
DOD-D: N/A — non-financial.
DOD-E: UNVERIFIED — void handlers + columns pending Step-1.
VERIFY-1: PASS — void modal QBO chrome; reason field; +Create semantics N/A (void, not create).
VERIFY-2: PASS — reason picker (complaints) binds catalogs.complaint_types (PER-ENTITY); inline +Add first row; write=read; entity-scoped.
VERIFY-3: PASS — nav→Safety DOT/Complaints→void→API→canonical safety.* void columns (never RETIRE)→entity-scoped→flags honest.
VERIFY-4: PASS — void reason surfaces in reverse sections (F16/F17) both ways.
VERIFY-5: PASS — TRANSP + USMCA isolation; per-entity reason catalog; no cross-entity leak.
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on dot_inspections/complaints; correct GUC; security_invoker; grants; server-side reason enforcement.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: dot-inspection-void, complaint-void, void-reason-audit
MIGRATE: N/A if void_reason/voided_by/voided_at exist (confirm Step-1); else idempotent migration above BOTH 202607950000 and 202607960000 (e.g. 202607970011, distinct) adding those columns, FORCE RLS, REVOKE DELETE, dynamic org.companies, grants, checksum-override same PR.
ROOT CAUSE: DOT inspection / complaint void does not require or persist a reason → untraceable state change on compliance records.
FIX: require + persist void reason (+ actor/timestamp), catalog-bound where available, void-not-delete. Files: DOT inspection void handler, complaint void handler, reason picker binding, (if needed) migration.
GUARD: scripts/verify-steps/NNN-verify-safety-void-reason.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 handler reproduce + prod void-with-reason proof.
REMAINING: reason picker binding coordinates with SAF-F15; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
