<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F18 — F18 · external fines: raw-UUID driver, no load/unit pickers
**FINDING:** F18 (P1; reclassified FIN-HOLD — external-fine money) · **Lane:** FINANCIAL-HOLD (external fines are money owed to an authority / recoverable from a driver; per Rule 13 "fine money = FINANCIAL-HOLD") · **Module:** Safety (External Fines creator).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/External Fines) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Universal picker law · §Safety linkage §10.3) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (picker law; Rule 13/19)
Approved screens reviewed: docs/approved-screens/safety.png · docs/approved-screens/7Drivers.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (creator fields → pickers — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The external-fine creator uses a RAW-UUID text box for the driver and has NO load or unit pickers — so an external fine (money) can be tied to a mistyped/cross-entity driver and cannot be associated to the load or unit it arose from. Same class as SAF-F14 but on a money record, so the stakes are higher (drives AP + driver recovery in SAF-F13). **Step 1 — reproduce (Rule 10, lucia):** grep the external-fine creator; confirm the driver field is a raw-UUID input and that load/unit pickers are absent. Confirm the hubs: `SET app.bypass_rls='lucia'; SELECT count(*) FROM mdata.drivers; SELECT count(*) FROM mdata.units;` (RLS forced). Confirm the canonical loads target [AUDIT — mdata.loads flagged RETIRE by linkage law; confirm canonical dispatch loads target before FK]. Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: driver field → picker over `mdata.drivers` (real driver_id FK); unit field → picker over `mdata.units`; load field → picker over the canonical loads table [AUDIT — confirm; not mdata.loads if RETIRE]. NEVER a raw-UUID box, NEVER a RETIRE table.
2. Hub matrix (both-way): external fine → `mdata.drivers` (recovery, reverse in SAF-F16) · `mdata.units` (reverse in SAF-F17) · canonical loads · `org.companies` · `mdata.vendors` (authority payee, via SAF-F13) · `accounting.journal_entries`/`bills`.
3. Cross-module (Rule 21 §1) — Safety §10.3: external fine → Driver, Unit, Load, Operating Company; → Accounting (AP + recovery); → Legal(case); feeds SAF-F13 lifecycle and F16/F17 reverse sections.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks universal picker (never a raw ID on a money record) + the 7-clause picker law; McLeod/Alvys tie a violation/fine to its driver, unit, AND load for accurate attribution and recovery. A money record must reference real, in-entity parties.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/repair — replace the raw box with pickers, add load/unit pickers; no data change. Enforce: operating_company_id RLS on external fines + mdata.drivers/units · security_invoker views · append-only audit · display IDs server-generated · +Create/+Book semantics. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; the creator does not itself post GL (SAF-F13 lifecycle does, via the reused poster); QBO NEVER written; flags OFF; ASC 470-60. **Rule 19** — reserve/liability accounts owner-manual.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = external-fine creator uses a raw-UUID driver box and lacks load/unit pickers, weakening a money record's attribution. Fix: replace the raw driver input with the driver picker (`mdata.drivers`, entity-scoped, 7-clause) writing a validated `driver_id` FK; add unit and load pickers (`mdata.units` + canonical loads, entity-scoped, 7-clause) writing real FKs; server rejects any party not in the entity. This feeds SAF-F13's lifecycle/economics; the creator persists real FKs, never a typed string.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-external-fine-pickers.mjs` + `scripts/verify-steps/NNN-verify-external-fine-pickers.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (external-fine creator has a raw-UUID driver input / no load/unit pickers), PASSes on fix (driver/unit/load pickers bound to canonical tables, entity-scoped, 7-clause, real FKs). `--selftest` mutates a real creator copy back to a raw driver box, asserts flagged; asserts the picker shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, the external-fine creator shows driver/unit/load pickers (in-entity only, inline +Add first row), writes real FKs, survives reload; cross-entity parties cannot be selected; guard green. UNVERIFIED — creator component + canonical loads target pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F18
LANE: FINANCIAL-HOLD
DOD-A: PASS — external-fine creator is the active path; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: FAIL→PASS — driver/unit/load picker fields controlled AND in payload (real FKs, not typed strings).
DOD-C: FAIL→PASS — external fine ↔ driver/unit/load FKs both ways; feeds JE/bill + recovery via F13; no memo/uuid-in-name/jsonb.
DOD-D: PASS — attribution pickers set the parties the F13 economics post against; no silent default; GL deferred to the poster.
DOD-E: UNVERIFIED — creator component + canonical loads target pending Step-1.
VERIFY-1: PASS — creator QBO chrome; drawer-on-drawer for driver/unit/load pickers.
VERIFY-2: FAIL→PASS — each picker satisfies the 7 clauses: entity behind it (mdata.drivers/units/loads) · inline +Add first row · opens the create wizard · write=read canonical · appears+selected+survives reload · entity-scoped.
VERIFY-3: PASS — nav→Safety external fine creator→UI→API→mdata.drivers/units + canonical loads (never raw-UUID/RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: external fine→driver/unit/load→(F13) authority bill+payment + recovery deduction, both ways under build-and-HOLD.
VERIFY-5: PASS — TRANSP + USMCA isolation; pickers cannot select cross-entity parties; units by owner/lease.
VERIFY-6: PASS (build-and-HOLD) — creator posts no GL; F13 posts matched JE via reused poster; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on external fines + mdata.drivers/units; correct GUC; security_invoker; grants; server-side in-entity party checks.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: external-fine-driver-picker, external-fine-unit-picker, external-fine-load-picker
MIGRATE: N/A — UI + picker bindings; no DDL (mdata.drivers/units canonical hubs exist, RLS forced). If the external-fine table lacks unit_id/load_id FK columns, add idempotent migration above BOTH 202607950000 and 202607960000 (e.g. 202607970018, distinct), FORCE RLS, REVOKE DELETE, dynamic org.companies, grants, checksum-override same PR (load FK only after canonical loads target confirmed).
ROOT CAUSE: external-fine creator uses a raw-UUID driver box and lacks load/unit pickers → weak/incorrect attribution on a money record.
FIX: driver/unit/load pickers bound to canonical tables, entity-scoped, 7-clause, writing real FKs. Files: external-fine creator, driver/unit/load picker bindings, (if needed) migration.
GUARD: scripts/verify-steps/NNN-verify-external-fine-pickers.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 creator reproduce + canonical loads target + prod picker proof.
REMAINING: feeds SAF-F13 lifecycle + F16/F17 reverse sections; confirm canonical loads target (mdata.loads RETIRE per linkage law); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
