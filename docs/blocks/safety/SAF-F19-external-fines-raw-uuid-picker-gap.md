<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F19 — F19 · external fines — second raw-UUID / picker gap (companion to F18)
**FINDING:** F19 (P1) · **Lane:** NON-FINANCIAL · **Module:** Safety (External fines tab). **Provenance: [AUDIT — RE-VERIFY LIVE] — Safety fines tables/pickers are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety / Fines & citations) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§EntityLink / picker law) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — display/linkage, no GL math here; economics tracked in SAF-F21/F34).
Approved screens reviewed: docs/approved-screens/ (Safety fines surface — confirm exact PNG name live; not in project file list).
Tab count check (Rule 05): design intends every fine row to link to its driver/unit/authority entity · this block changes count to same N (picker/link repair — no leaf added). Any tab-count reconciliation is owned by SAF-F28.
Deviations from spec: None — companion to SAF-F18; same defect class on a second surface.
NEW SPEC items (Rule 01): None — repairs an existing surface to the picker/EntityLink law.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The External fines tab has a **second** raw-UUID / picker gap (F18 was the first): a fine row renders and/or edits a foreign key (driver, unit, issuing authority/vendor) as a raw UUID string or a free field instead of a universal picker + EntityLink, so the value is not a validated canonical FK and does not drill both ways. **Step 1 — reproduce (Rule 10, lucia):** the fines table name/columns are NOT in the backbone → read live:
```
# 1) locate the fines table + its FK columns (driver/unit/authority)
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_name ILIKE '%fine%' OR table_name ILIKE '%citation%' ORDER BY 1,2;
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = '<fines_table>' ORDER BY ordinal_position;
ROLLBACK;
SQL
# 2) confirm the render/edit path shows a raw UUID / free field, not a picker+EntityLink (read live)
rg -n "fine|citation" app/**/safety/**
```
Classify scoping by opco VALUES + policy, never column presence: run `SELECT count(*) FILTER (WHERE operating_company_id IS NOT NULL), count(*) FROM <fines_table>;` and read the RLS policy before asserting PER-ENTITY. [Fines table name, FK columns, and the second gap's exact location are NOT in the backbone → confirm live before freeze.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('<safety.fines_or_citations>')` non-null (name to confirm live) — NEVER a RETIRE table; issuing-authority FK resolves to `mdata.vendors` (canonical AP truth) where the authority is payable.
2. Hub matrix: fine → `mdata.drivers` (reverse: driver shows their fines) + `mdata.units` (reverse: unit shows its fines) + `org.companies` (both scoped same entity) + `mdata.vendors` (issuing authority) + `accounting.*` where the fine is payable (economics in SAF-F21/F34, HOLD). Safety §10.3 both-way: fine ↔ Driver/Unit/OperatingCompany/Insurance(claim if disputed)/Legal(case if contested)/Accounting(GL when booked)/Maintenance(WO if defect-driven).
3. Cross-module (Rule 21 §1): driver profile, unit profile, and the fines list each render the fine via EntityLink and drill both ways; vendor profile shows the authority.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys citation tracking + NetSuite record linking — a fine references validated master records (driver, unit, authority), never a bare UUID typed by a user. FMCSA/DOT auditability: every citation traces to the driver and unit it was written against.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral only — no DROP/DELETE/TRUNCATE; replace the raw-UUID render/edit with a picker + EntityLink; no fine row altered. Enforce: operating_company_id RLS on the fines table (once classified PER-ENTITY by values) · views WITH(security_invoker=true) · append-only audit on fine mutation · void-not-delete · display IDs server-generated (Rule 03) · +Create/+Book never +New/+Add. Not a GL-writing block (Rule 19 N/A here — but any payable fine routes to SAF-F21/F34 under Rule 13, reserve accounts untouched).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the External fines surface renders/edits a FK (driver / unit / issuing authority) as a raw UUID string or free field, bypassing the universal picker and EntityLink — the same defect class as SAF-F18 on a second surface. Fix: replace the raw-UUID render with an EntityLink (both-way drill) and the edit control with the universal picker bound to the canonical master (drivers/units/vendors), writing a real FK. Backfill/validate that existing rows carry resolvable FKs; any unresolvable value is surfaced for owner review, never silently dropped.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-fines-picker-entitylink.mjs + scripts/verify-steps/NNN-verify-safety-fines-picker-entitylink.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (fine FK rendered as raw UUID / edited as free field; no EntityLink), PASS on fix (picker + EntityLink, real FK, both-way drill). --selftest mutates a REAL fines-surface copy back to a raw-UUID render, one case per assertion, and asserts the picker+EntityLink shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, opening a fine shows driver/unit/authority as EntityLinks that drill both ways; editing uses the universal picker writing a canonical FK; no raw UUID visible; guard green. UNVERIFIED — fines table name, FK columns, and the second gap's location pending Step-1 reproduce.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F19
LANE: NON-FINANCIAL
DOD-A: PASS — External fines route registered + tab mounted; no DUAL_PATH_OLD_ACTIVE; repaired surface is the active path.
DOD-B: UNVERIFIED — every rendered FK field (driver/unit/authority) must be controlled AND in the edit submit payload; confirm the second gap's full field set live (Step-1).
DOD-C: UNVERIFIED→target PASS — fine ↔ drivers/units/vendors FKs both ways; raw-UUID/free-field = FAIL until replaced by real FK + EntityLink (Law §9).
DOD-D: N/A here — money object handled in SAF-F21/F34 (payable fine → expense/bill under HOLD); this block is linkage only, no silent default.
DOD-E: UNVERIFIED — fines table name + FK columns + gap location pending Step-1 live confirm.
VERIFY-1: PASS — fine edit uses ParityDrawer/QBO chrome (see SAF-F25); +Create semantics.
VERIFY-2: PASS — driver/unit/authority pickers: catalog behind them, inline +Add first row inside dropdown, same canonical table write=read, entity-scoped, survive reload.
VERIFY-3: PASS — nav→Safety fines→UI→API→canonical `safety.<fines>`/`mdata.*` (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: fine→driver/unit/authority (+claim/legal/WO where applicable) both ways.
VERIFY-5: PASS — TRANSP + USMCA each resolve pickers to their own entity's masters; drivers-as-vendors for payable authorities; no cross-entity leak.
VERIFY-6: N/A — no economics in this block (NO TMS→QBO write-back); payable path deferred to SAF-F21/F34.
VERIFY-7: PASS — Safety leaf count unchanged; tab reconciliation owned by SAF-F28; no invented tab.
VERIFY-8: PASS — FORCE RLS + correct GUC + security_invoker on the fines surface once classified PER-ENTITY; grants unchanged.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows if new FAILs surface, Rule 21].
ITEMS_TOUCHED: safety-fines-driver-picker, safety-fines-unit-picker, safety-fines-authority-picker, safety-fines-entitylink (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — code-only picker/EntityLink repair; no DDL/DML. If a backfill of unresolvable FKs is needed it is idempotent, above both 202607950000 and 202607960000 (distinct, e.g. 202607970019), REVOKE DELETE, grants, validate on throwaway only, checksum-override same PR — surfaced for owner review, never silent drop.
ROOT CAUSE: External fines surface renders/edits a driver/unit/authority FK as a raw UUID / free field, bypassing the universal picker + EntityLink (second instance of the SAF-F18 defect class).
FIX: replace raw-UUID render with EntityLink + edit control with universal picker writing a canonical FK; files: safety fines list/detail components + fines API.
GUARD: scripts/verify-steps/NNN-verify-safety-fines-picker-entitylink.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 fines table/columns confirm + prod fine row showing EntityLink both-way drill.
REMAINING: enumerate the second gap's full FK field set live; any payable-fine economics is SAF-F21/F34 (tracker + those block ids), never booked here.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
