<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F03 — F03 · fine→deduction INSERTs load_id / source_bank_transaction_id (both held/unapplied)
**FINDING:** F03 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Fine → Settlement deduction).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Civil Fines · §Settlement deductions) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Safety linkage §10.3) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (deduction↔load↔bank linkage; Rule 13)
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (writer + migration correctness).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The fine→deduction INSERT writes `load_id` and `source_bank_transaction_id`, BOTH present only in the held/unapplied migration `202607080000` (`applied_on_prod:false`) — neither column is on the prod branch. Same class as SAF-F02: the INSERT depends on schema objects that do not exist on prod, masked by the migration-file-sourced parity guard (SAF-F08). **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='driver_finance' AND table_name IN ('settlement_deductions','deductions') AND column_name IN ('load_id','source_bank_transaction_id');` → expect ZERO on prod (columns absent). Grep server for the fine→deduction INSERT; confirm it lists both columns. Bank linkage target must be `banking.*` (never RETIRE `bank.*`); load target confirmed live (`mdata.loads` is linkage-law RETIRE — confirm canonical loads target before FK). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the deduction row lives in `driver_finance.*` (canonical, never `settlement.*`/`payroll.*`); its bank reference FKs `banking.bank_transactions` (backbone-verified, never RETIRE `bank.*`); its load reference FKs the canonical loads table [AUDIT — mdata.loads flagged RETIRE by linkage law; confirm canonical dispatch loads target live]. All must be APPLIED columns, never held.
2. Hub matrix (both-way): deduction → `mdata.drivers` · `org.companies` · `banking.bank_transactions` (reverse: the settling bank txn ↔ deduction) · canonical loads (reverse: load ↔ deduction) · `accounting.journal_entries` (reverse).
3. Cross-module (Rule 21 §1) — Safety §10.3 + Driver-Finance: fine → deduction → settlement → bank; Driver Fines/Settlement sections drill both ways (SAF-F16); Banking reconciliation sees the source txn.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys settlement deductions carry a real load reference and a real bank-settlement reference for audit; QuickBooks/NetSuite: no financial row may FK a non-existent column. ASC 470-60 build-and-HOLD; bank txn is the reconciliation anchor (banking.*, the canonical bank schema per backbone).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — the load_id / source_bank_transaction_id links are ADDED as real applied both-way FKs via an idempotent migration above both maxes; the held 202607080000 is superseded, never re-run blindly. Enforce: operating_company_id RLS · security_invoker views · lockstep INSERT · append-only audit · void-not-delete · display IDs server-generated. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse poster; parallel books; QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — reserve/holdback accounts untouched.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = fine→deduction INSERT references two columns that exist only in an unapplied migration; SAF-F08 masked it. Fix: (1) SAF-F08 first; (2) add `load_id` (→ canonical loads, confirmed live) and `source_bank_transaction_id` (→ `banking.bank_transactions`) as REAL applied both-way FKs (idempotent migration above both maxes, FORCE RLS, REVOKE DELETE, dynamic org.companies), superseding 202607080000; (3) repoint the INSERT to the applied columns and the canonical schemas (driver_finance / banking), never settlement.*/payroll.*/bank.*. No write may reference an unapplied object; any GL effect uses the reused poster (flags OFF).

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-fine-deduction-applied-links.mjs` + `scripts/verify-steps/NNN-verify-fine-deduction-applied-links.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (INSERT names load_id/source_bank_transaction_id absent from PROD information_schema, or targets bank.*/settlement.*), PASSes on fix (columns applied on prod, FKs to canonical loads + banking.bank_transactions, driver_finance canonical). `--selftest` mutates a real writer copy back to the held columns, asserts flagged; asserts applied-canonical shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: create a fine→deduction in TRANSP + USMCA; both link columns present on prod and populated with real FKs (canonical loads + banking.bank_transactions); reverse sections resolve; QBO untouched; guard green. UNVERIFIED — table/column/route names pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F03
LANE: FINANCIAL-HOLD
DOD-A: PASS — fine→deduction is the active path; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — deduction form fields (load, bank txn, amount) controlled AND in payload.
DOD-C: FAIL→PASS — deduction ↔ canonical loads ↔ banking.bank_transactions FKs both ways on APPLIED columns; no held column, no memo/uuid-in-name/jsonb.
DOD-D: PASS — purpose (settle fine via deduction) picks the money objects (load, bank txn, JE) with no silent default.
DOD-E: UNVERIFIED — prod column absence + writer path pending Step-1; canonical banking/JE targets verified in backbone.
VERIFY-1: PASS — deduction drawer uses QBO chrome; +Create semantics.
VERIFY-2: PASS — load + bank-txn pickers bind to canonical tables (write=read), entity-scoped, inline-add where applicable.
VERIFY-3: FAIL→PASS — nav→Safety fine→deduction→API→driver_finance + banking.bank_transactions + canonical loads (never held/RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: fine→deduction→settlement→bank txn→reconciliation; both ways under build-and-HOLD.
VERIFY-5: PASS — TRANSP + USMCA isolation; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — any GL via reused poster, balanced when ON; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on deduction + FK targets; correct GUC; security_invoker; REVOKE DELETE; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: fine-deduction-writer, deduction-load-bank-link-migration
MIGRATE: number strictly above BOTH 202607950000 and 202607960000 (e.g. 202607970006, distinct) / idempotent / adds real both-way FKs (load → canonical loads, bank → banking.bank_transactions) / FORCE RLS / REVOKE DELETE / dynamic org.companies NO hardcoded UUID / grants / validate on throwaway only / checksum-override same PR / supersedes unapplied 202607080000.
ROOT CAUSE: fine→deduction INSERT names load_id + source_bank_transaction_id, present only in unapplied migration 202607080000; F08 masked the drift.
FIX: apply real both-way link columns to canonical loads + banking.bank_transactions; repoint INSERT to driver_finance/banking canonical. Files: server fine→deduction route, migrations/202607970006_*.sql.
GUARD: scripts/verify-steps/NNN-verify-fine-deduction-applied-links.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 prod column-absence proof + post-fix applied columns + populated FKs.
REMAINING: land SAF-F08 first; confirm canonical loads target (mdata.loads RETIRE per linkage law) before FK; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
