<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F04 — F04 · insurance claim graph reads held/unapplied columns; parity guard PASSES falsely
**FINDING:** F04 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Insurance-claim linkage graph).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Accidents · §Insurance claims) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Safety linkage §10.3 — event→Insurance(claim)→Legal(case)) · IH35_ARCHITECTURAL_DESIGN.md (module Safety/Insurance/Legal) · docs/lockdown/00_LOCKED_DECISIONS.md
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (read-graph + guard correctness).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The insurance-claim linkage graph reads `accident_reports.insurance_claim_id`, `legal.matters.insurance_claim_id`, and `incidents.auto_created_claim_id` — all three exist ONLY in the held/unapplied migration `202607080000` (`applied_on_prod:false`). On prod these columns are ABSENT, so the graph resolves nothing (or errors), yet the schema-parity guard PASSES because it parses its baseline from migration FILES, not prod (root cause = SAF-F08). A green check here is FAKE. **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE (table_schema='safety' AND table_name='accident_reports' AND column_name='insurance_claim_id') OR (table_schema='legal' AND table_name='matters' AND column_name='insurance_claim_id') OR (table_schema='safety' AND table_name='incidents' AND column_name='auto_created_claim_id');` → expect ZERO rows on prod (all absent). Then run the parity guard and observe it reports PASS despite the absence — the false-green to eliminate. Prod branch br-fancy-credit-akjnd07a wins over migration files.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the claim graph must read REAL applied both-way FKs among `safety.accident_reports`, `safety.incidents`, `legal.matters`, and the canonical insurance-claim table [AUDIT — confirm to_regclass('insurance.claims') live]. NEVER held columns, NEVER RETIRE tables.
2. Hub matrix (both-way): accident/incident → `mdata.drivers` · `mdata.units` · `org.companies` · insurance claim (reverse: claim ↔ event) · `legal.matters` (reverse: case ↔ claim) · `accounting.journal_entries` (claim receivable/loss, build-and-HOLD).
3. Cross-module (Rule 21 §1) — Safety §10.3: event → Driver, Unit, Operating Company; → Insurance(claim); → Legal(case); → Accounting(any claim proceeds/loss); → Maintenance(damage WO) — every leg both-way, no phantom column.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite/McLeod claim-to-event traceability: an accident, its insurance claim, and its legal matter form one navigable both-way graph. A financial/compliance graph that reads unapplied columns and a guard that greenlights it violate the "no fake green checks / traceable numbers" standard.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — the claim-link columns are ADDED as real applied both-way FKs (idempotent migration above both maxes, FORCE RLS), superseding the held 202607080000; nothing dropped. Enforce: operating_company_id RLS on accident_reports/incidents/legal.matters · security_invoker views · append-only audit · void-not-delete. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; any claim proceeds/loss uses the reused poster; QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — insurance reserve/holdback accounts owner-manual, untouched.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the graph reads three unapplied columns and the parity guard's file-sourced baseline hides it. Fix, in order: (1) SAF-F08 — re-source the parity baseline from PROD information_schema so the false PASS becomes a real FAIL; (2) add `accident_reports.insurance_claim_id`, `incidents.auto_created_claim_id` (or a single canonical event→claim FK), and `legal.matters.insurance_claim_id` as REAL applied both-way FKs to the canonical insurance-claim table (idempotent, above both maxes, FORCE RLS), superseding 202607080000; (3) repoint the graph reads to the applied columns. No read may depend on an unapplied object; no auto-created claim without a real FK.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-insurance-claim-graph-applied.mjs` + `scripts/verify-steps/NNN-verify-insurance-claim-graph-applied.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (graph reads columns absent from PROD information_schema; parity guard falsely green), PASSes on fix (columns applied on prod; graph resolves real both-way FKs; parity baseline now prod-sourced). `--selftest` mutates a real graph-reader copy back to the held columns, asserts flagged; asserts applied shape not flagged. (This guard verifies steps only; it does not edit the F08 parity guard — it consumes its corrected baseline.)

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, open an accident with a claim → the graph resolves accident↔claim↔legal matter via real prod FKs; the parity guard, now prod-sourced, correctly reflects schema truth; QBO untouched; guard green (honestly). UNVERIFIED — table/column/route names pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F04
LANE: FINANCIAL-HOLD
DOD-A: PASS — claim-graph view is the active path; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: N/A (read graph) — no submit payload; any claim-link create form is covered by its own field-controlled writer.
DOD-C: FAIL→PASS — accident ↔ claim ↔ legal matter FKs both ways on APPLIED columns; no held column, no memo/uuid-in-name/jsonb-ids.
DOD-D: PASS — purpose (surface claim/loss economics) resolves to the real claim + any JE; no silent phantom.
DOD-E: UNVERIFIED — prod column absence + false-green reproduce pending Step-1; canonical JE hub verified in backbone.
VERIFY-1: PASS — graph rendered in ParityDrawer/QBO chrome; drill both ways.
VERIFY-2: N/A — no catalog picker in the read graph.
VERIFY-3: FAIL→PASS — nav→Safety accident→claim graph→API→APPLIED canonical FKs (never held columns/RETIRE)→same R/W→entity-scoped→flags honest (no fake green).
VERIFY-4: PASS — deep chain: accident→claim→legal matter→(proceeds/loss JE) all both ways under build-and-HOLD.
VERIFY-5: PASS — TRANSP + USMCA isolation; no cross-entity claim leak.
VERIFY-6: PASS (build-and-HOLD) — claim proceeds/loss via reused poster; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on accident_reports/incidents/legal.matters/claims; correct GUC; security_invoker; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: insurance-claim-graph-reader, claim-link-migration, parity-baseline (consumes F08)
MIGRATE: number strictly above BOTH 202607950000 and 202607960000 (e.g. 202607970007, distinct) / idempotent / adds real both-way claim FKs on accident_reports + incidents + legal.matters / FORCE RLS / REVOKE DELETE / dynamic org.companies NO hardcoded UUID / grants / validate on throwaway only / checksum-override same PR / supersedes unapplied 202607080000.
ROOT CAUSE: claim graph reads insurance_claim_id/auto_created_claim_id present only in unapplied 202607080000; parity guard's migration-file baseline (F08) greenlights the absent columns.
FIX: prod-source the parity baseline (F08), apply real both-way claim FKs, repoint the graph reads. Files: claim-graph reader, migrations/202607970007_*.sql, (F08) parity-baseline source.
GUARD: scripts/verify-steps/NNN-verify-insurance-claim-graph-applied.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 prod column-absence + false-green reproduce, then applied-FK proof.
REMAINING: SAF-F08 is the hard dependency (kills the false PASS root cause); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
