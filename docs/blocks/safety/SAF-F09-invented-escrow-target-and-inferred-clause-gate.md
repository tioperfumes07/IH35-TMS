<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F09 — F09 · invented ESCROW_TARGET_DEFAULT=1000 + inferred has_signed_clause gate forfeiture
**FINDING:** F09 (P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Driver Escrow — money-lock).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/Driver Escrow) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Escrow terms are agreement-driven) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (no invented thresholds; recovery rail = always ask; Rule 13/19)
Approved screens reviewed: docs/approved-screens/safety.png · docs/approved-screens/7Drivers.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (remove invented constants; source terms from data — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None — escrow terms are contractual, not code constants.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Escrow logic hardcodes `ESCROW_TARGET_DEFAULT = 1000` and infers a `has_signed_clause` flag, using both to GATE forfeiture. This invents a driver-money threshold and a contractual precondition that must come from the driver's actual escrow agreement — a direct violation of the owner money-lock ("no invented thresholds; recovery rail = always ask"). A wrong default target or an inferred (not evidenced) signed-clause can forfeit money that should not be forfeited, or block a legitimate one. **Step 1 — reproduce (Rule 10, lucia):** (a) grep for `ESCROW_TARGET_DEFAULT`, `1000`, and `has_signed_clause` in the escrow logic; confirm the constant + the inference gate forfeiture. (b) Confirm where the REAL target/agreement should live: `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name IN ('driver_escrow','driver_escrow_agreements');` (do not assume names — not in backbone). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the escrow target amount and signed-clause status come from the driver's canonical escrow agreement record `safety.driver_escrow*` [AUDIT — confirm live], NOT a code constant/inference. NEVER a RETIRE table.
2. Hub matrix (both-way): escrow agreement → `mdata.drivers` (reverse: driver escrow terms) · `org.companies` · escrow liability `catalogs.accounts` (owner-manual, Rule 19) · `accounting.journal_entries` (forfeiture, build-and-HOLD).
3. Cross-module (Rule 21 §1) — Safety §10.3: escrow agreement → Driver (terms visible) → Accounting (liability + forfeiture JE). Feeds SAF-F01 (route) + SAF-F10 (modal).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Owner money-lock + ASC 470-60 build-and-HOLD: driver-money terms are contractual facts, never software defaults. QuickBooks/NetSuite never invent a liability threshold; McLeod/Alvys escrow terms come from the signed driver agreement. Recovery rail = ALWAYS ASK (surface, don't auto-decide).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/repair — remove the invented constant + inference; read terms from the agreement; no data change. Enforce: operating_company_id RLS on escrow tables · security_invoker views · append-only audit · void-not-delete. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; forfeiture reuses the poster; QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — the escrow/holdback liability account is OWNER-MANUAL: never create/reclassify/merge; the target amount is owner/agreement data, never invented.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = software invents an escrow target ($1000) and infers a signed-clause, then gates a money movement on both. Fix: (1) delete `ESCROW_TARGET_DEFAULT` and the inferred `has_signed_clause` gate; (2) source the target amount and signed-clause status from the driver's canonical escrow agreement record; (3) where the agreement data is missing, DO NOT default — surface "escrow terms not on file, cannot forfeit" and ask (recovery rail = always ask). No forfeiture proceeds on invented/inferred terms. Ties into SAF-F01/F10 for the route + modal.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-escrow-no-invented-terms.mjs` + `scripts/verify-steps/NNN-verify-escrow-no-invented-terms.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (presence of ESCROW_TARGET_DEFAULT/hardcoded 1000 or an inferred has_signed_clause gating forfeiture), PASSes on fix (terms sourced from the agreement record; missing terms block + ask). `--selftest` mutates a real escrow-logic copy to reintroduce the constant, asserts flagged; asserts the agreement-sourced shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a driver WITH an escrow agreement forfeits per the agreement's actual target/clause; a driver WITHOUT one is blocked with an "ask owner" prompt (no invented default); guard green. UNVERIFIED — escrow agreement table/columns pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F09
LANE: FINANCIAL-HOLD
DOD-A: PASS — escrow forfeiture path is the active path (with F01); no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — forfeiture inputs derive from agreement + owner entry, all controlled + in payload (with F10).
DOD-C: PASS — escrow agreement ↔ driver ↔ liability account ↔ JE FKs both ways; no memo/uuid-in-name/jsonb.
DOD-D: PASS — purpose (forfeit) uses agreement terms + owner-selected liability GL; NO invented threshold, NO silent default.
DOD-E: UNVERIFIED — agreement table/columns pending Step-1; JE/accounts hub verified in backbone.
VERIFY-1: PASS — forfeiture drawer QBO chrome; +Create semantics.
VERIFY-2: N/A — account picker only (postable filter, SAF-F14).
VERIFY-3: PASS — nav→Safety escrow→API→canonical escrow agreement + journal_entries (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: agreement→forfeiture→matched JE (build-and-HOLD) both ways.
VERIFY-5: PASS — TRANSP + USMCA isolation; each entity's escrow terms distinct; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — matched JE via reused poster; owner-selected control account (Rule 19); flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on escrow tables; correct GUC; security_invoker; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: escrow-terms-source, remove-ESCROW_TARGET_DEFAULT, remove-inferred-signed-clause
MIGRATE: N/A — logic sources from existing agreement columns (confirm Step-1). If an agreement/target/clause column is genuinely missing, add via idempotent migration above BOTH 202607950000 and 202607960000 (e.g. 202607970009, distinct), FORCE RLS, REVOKE DELETE, dynamic org.companies, grants, checksum-override same PR — but NEVER seed an invented target value.
ROOT CAUSE: software invents ESCROW_TARGET_DEFAULT=1000 and infers has_signed_clause, gating a driver-money forfeiture on non-contractual data.
FIX: remove the constant + inference; source target/clause from the driver's escrow agreement; missing terms → block + ask (never default). Files: escrow logic module, escrow agreement reader.
GUARD: scripts/verify-steps/NNN-verify-escrow-no-invented-terms.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 agreement reproduce + prod forfeit-per-agreement + block-when-missing proof.
REMAINING: pairs with SAF-F01 (route) + SAF-F10 (modal); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
