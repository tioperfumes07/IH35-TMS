<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F02 — F02 · Convert-to-liability writes civil_fines.driver_settlement_deduction_id (held/unapplied column)
**FINDING:** F02 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Fines → Liability).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Civil Fines) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Safety linkage §10.3 · §fine→liability) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (fine liability = owner-selected GL; Rule 13/19)
Approved screens reviewed: docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (writer correctness + proper migration — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None — deduction linkage already specified; this fixes it to a real, applied, both-way column.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Convert-to-liability writes `civil_fines.driver_settlement_deduction_id`, a column that exists ONLY in migration `202607080000` which is `applied_on_prod:false` — i.e. the column is NOT on the prod branch. The write therefore either errors (column absent) or is masked by a falsely-green parity guard (SAF-F08 root cause). Also note the target must be `driver_finance.*` canonical, NEVER `settlement.*`/`payroll.*` (RETIRE). **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name='civil_fines' AND column_name='driver_settlement_deduction_id';` → expect ZERO rows on prod branch br-fancy-credit-akjnd07a (column absent), confirming migration 202607080000 is unapplied. Then grep server for the convert-to-liability writer and confirm it references that column. Prod wins over migration files/memory.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the deduction link must land on a REAL applied column that FKs the canonical driver-finance deduction record (`driver_finance.*`, never `settlement.*`/`payroll.*`), and the fine's liability posting goes to `accounting.journal_entries` against an OWNER-SELECTED liability account (`catalogs.accounts`, Rule 19-aware). NEVER a held/unapplied column, NEVER a RETIRE table.
2. Hub matrix (both-way): fine → `mdata.drivers` · `org.companies` · `accounting.journal_entries` (reverse: JE ↔ fine) · `driver_finance` deduction (reverse: deduction ↔ fine) · `catalogs.accounts` (liability GL, owner-selected).
3. Cross-module (Rule 21 §1) — Safety §10.3: fine event → Driver, Unit, Operating Company; → Accounting (fine→liability GL; if paid, expense); → Legal(case) if contested; Driver detail Fines section drills both ways (SAF-F16).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite: a payable/accrued liability is an owner-classified GL account with a matched, balanced JE; ASC 470-60 build-and-HOLD. McLeod driver-settlement deductions link to a real deduction record, not a phantom column. No financial write may depend on an unapplied schema object.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — the correct both-way FK is ADDED via a properly-applied idempotent migration ABOVE both ledger maxes; the held migration 202607080000 is not silently "un-broken" but superseded by an applied, checksum-registered one. Enforce: operating_company_id RLS · security_invoker views · lockstep INSERT (fine liability JE) · append-only audit · void-not-delete. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the poster (no new GL math); parallel books; QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — liability/reserve account is OWNER-MANUAL; never auto-create/reclassify.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the writer targets a column that lives only in an unapplied migration; the parity guard (SAF-F08) hid it. Fix, in order: (1) SAF-F08 first (baseline from prod information_schema so the drift is visible); (2) add the deduction-link column as a REAL, applied, both-way FK to the canonical `driver_finance` deduction (idempotent migration above both maxes, FORCE RLS, REVOKE DELETE, dynamic org.companies) — supersede the held 202607080000; (3) convert-to-liability posts the fine to the OWNER-SELECTED liability account via the reused poster (build-and-HOLD, flags OFF) and records the deduction link on the applied column. No write may reference an unapplied object.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-fine-liability-applied-column.mjs` + `scripts/verify-steps/NNN-verify-fine-liability-applied-column.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (writer references a column absent from PROD information_schema, or targets settlement.*/payroll.*), PASSes on fix (column applied on prod, writer targets driver_finance canonical + owner-selected liability GL). `--selftest` mutates a real writer copy back to the held column, asserts flagged; asserts the applied-canonical shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: convert a fine to liability in TRANSP + USMCA; the deduction-link column is present on prod and populated with a real driver_finance FK; matched liability JE posted (flags OFF); Driver Fines section shows it both ways; QBO untouched; guard green. UNVERIFIED — table/column/route names pending Step-1 reproduce.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F02
LANE: FINANCIAL-HOLD
DOD-A: PASS — convert-to-liability is the active path; no DUAL_PATH_OLD_ACTIVE twin; writer corrected in place.
DOD-B: PASS — convert modal fields (liability account, amount, deduction toggle) controlled AND in payload.
DOD-C: FAIL→PASS — fine ↔ driver_finance deduction ↔ journal_entries FKs both ways on an APPLIED column; no memo/uuid-in-name/jsonb-ids; no held column.
DOD-D: PASS — purpose (accrue fine as liability) picks the owner-selected liability GL + matched JE; no silent default.
DOD-E: UNVERIFIED — prod column absence + writer path pending Step-1; canonical JE/driver_finance targets verified (backbone + linkage law).
VERIFY-1: PASS — convert drawer uses QBO chrome; +Create semantics.
VERIFY-2: PASS — liability account picker = postable filter (SAF-F14), inline +Add first row, write=read canonical accounts, entity-scoped.
VERIFY-3: FAIL→PASS — nav→Safety fine→convert→API→APPLIED canonical column + journal_entries (never held column, never settlement.*/payroll.*)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: fine→liability JE→(on pay) expense; deduction→driver_finance; both ways under build-and-HOLD.
VERIFY-5: PASS — TRANSP + USMCA isolation; no cross-entity fine/deduction leak.
VERIFY-6: PASS (build-and-HOLD) — balanced JE via reused poster; owner-selected control account; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on civil_fines + deduction table; correct GUC; security_invoker; REVOKE DELETE; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: convert-to-liability-writer, civil_fines-deduction-link-migration, fine-liability-poster
MIGRATE: number strictly above BOTH 202607950000 and 202607960000 (e.g. 202607970005, distinct) / idempotent (DO + IF NOT EXISTS) / adds real both-way FK to driver_finance deduction / FORCE RLS / REVOKE DELETE / dynamic org.companies NO hardcoded UUID / grants / validate on throwaway only / checksum-override same PR / supersedes unapplied 202607080000 (do not re-run the held one).
ROOT CAUSE: writer targets civil_fines.driver_settlement_deduction_id, present only in unapplied migration 202607080000; parity guard (F08) masked the drift.
FIX: apply a real both-way deduction FK to driver_finance canonical (above both maxes); repoint writer; post liability via reused poster to owner-selected GL. Files: server convert-to-liability route, migrations/202607970005_*.sql, fine-liability poster.
GUARD: scripts/verify-steps/NNN-verify-fine-liability-applied-column.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 prod column-absence proof + post-fix applied column + matched JE row.
REMAINING: land SAF-F08 first (baseline fix) so this drift is guard-visible; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
