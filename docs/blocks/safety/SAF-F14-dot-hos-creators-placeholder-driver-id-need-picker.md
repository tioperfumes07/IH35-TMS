<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F14 — F14 · DOT/HOS creators use placeholder="driver_id" raw text (need driver picker, 7-clause picker law)
**FINDING:** F14 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL · **Module:** Safety (DOT Inspection / HOS creators).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety/DOT · §HOS) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Universal picker law · 7 clauses) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (picker law)
Approved screens reviewed: docs/approved-screens/safety.png · docs/approved-screens/7Drivers.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (creator field → picker — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The DOT Inspection and HOS creators use a raw text input with `placeholder="driver_id"`, expecting the user to type/paste a driver UUID — no driver picker. A raw-UUID text box produces typos, wrong/cross-entity drivers, and no validation that the driver exists in the entity. It must be the driver picker (7-clause picker law). **Step 1 — reproduce (Rule 10, lucia):** grep the DOT/HOS creator components for `placeholder="driver_id"` (and raw driver-id inputs); confirm no picker binding. Confirm the driver source is entity-scoped: `SET app.bypass_rls='lucia'; SELECT count(*) FROM mdata.drivers;` (drivers are the canonical hub; RLS forced). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the driver field is a picker bound to `mdata.drivers` (canonical driver hub, entity-scoped) writing a real `driver_id` FK on the DOT/HOS record — NEVER a raw-UUID text box, NEVER a RETIRE table.
2. Hub matrix (both-way): DOT/HOS record → `mdata.drivers` (reverse: driver reverse section shows it, SAF-F16) · `mdata.units` (if unit-scoped) · `org.companies`.
3. Cross-module (Rule 21 §1) — Safety §10.3: DOT/HOS → Driver, Unit, Operating Company; feeds the qualification gate (SAF-F07) and the Driver reverse section.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks universal picker (never a raw ID field) + the 7-clause picker law: catalog/entity behind it, inline +Add first row, opens the create wizard, same canonical table write=read, appears+selected+survives reload, entity-scoped. FMCSA DOT/HOS records must reference a real, in-entity driver.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/repair — replace the raw box with the picker; no data change. Enforce: operating_company_id RLS on DOT/HOS tables + mdata.drivers · security_invoker views · display IDs server-generated · +Create semantics. Non-financial — Rule 13/19 N/A.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = DOT/HOS creators use a raw `driver_id` text placeholder instead of the driver picker. Fix: replace the raw input with the driver picker bound to `mdata.drivers`, entity-scoped, writing a validated `driver_id` FK; the picker satisfies the 7-clause law (inline +Add-new driver as first row opening the driver create wizard, write=read same canonical table, selected value survives reload). Server rejects a driver_id not in the entity. Same fix pattern applies to any unit field (unit picker → mdata.units).

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-dot-hos-driver-picker.mjs` + `scripts/verify-steps/NNN-verify-dot-hos-driver-picker.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (DOT/HOS creator renders a raw driver_id text input / placeholder="driver_id"), PASSes on fix (driver picker bound to mdata.drivers, entity-scoped, 7-clause). `--selftest` mutates a real creator copy back to a raw input, asserts flagged; asserts the picker shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, the DOT/HOS creator shows a driver picker (only in-entity drivers, inline +Add first row), writes a real driver_id FK, survives reload; a cross-entity driver cannot be selected; guard green. UNVERIFIED — creator component paths pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F14
LANE: NON-FINANCIAL
DOD-A: PASS — DOT/HOS creators are the active path; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: FAIL→PASS — driver picker field controlled AND in payload (real driver_id, not a typed string).
DOD-C: PASS — DOT/HOS ↔ mdata.drivers FK both ways; no memo/uuid-in-name/jsonb.
DOD-D: N/A — non-financial.
DOD-E: UNVERIFIED — creator component paths pending Step-1.
VERIFY-1: PASS — creator QBO chrome; drawer-on-drawer for the driver picker.
VERIFY-2: FAIL→PASS — driver picker: entity behind it (mdata.drivers) · inline +Add first row · opens driver wizard · write=read canonical · appears+selected+survives reload · entity-scoped (all 7 clauses).
VERIFY-3: PASS — nav→Safety DOT/HOS creator→UI→API→mdata.drivers (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — DOT/HOS→driver→qualification gate + driver reverse section, both ways.
VERIFY-5: PASS — TRANSP + USMCA isolation; picker cannot select cross-entity driver.
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on DOT/HOS + mdata.drivers; correct GUC; security_invoker; grants; server-side driver-in-entity check.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: dot-inspection-creator-driver-picker, hos-creator-driver-picker
MIGRATE: N/A — UI + picker binding; no DDL (mdata.drivers canonical hub already exists, RLS forced).
ROOT CAUSE: DOT/HOS creators use a raw driver_id text box (placeholder="driver_id") instead of the driver picker → typos, wrong/cross-entity drivers, no validation.
FIX: driver picker bound to mdata.drivers, entity-scoped, 7-clause, writing a validated driver_id FK. Files: DOT inspection creator, HOS creator, driver-picker binding.
GUARD: scripts/verify-steps/NNN-verify-dot-hos-driver-picker.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 creator reproduce + prod picker proof.
REMAINING: coordinates with SAF-F15 (catalog pickers) + SAF-F16 (driver reverse); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
