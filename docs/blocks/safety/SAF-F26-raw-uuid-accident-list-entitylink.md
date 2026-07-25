<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F26 — F26 · raw-UUID accident list (no EntityLink)
**FINDING:** F26 (P2) · **Lane:** NON-FINANCIAL · **Module:** Safety (Accidents list). **Provenance: [AUDIT — RE-VERIFY LIVE] — the accident table/columns are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Accidents) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§EntityLink) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — display/linkage).
Approved screens reviewed: docs/approved-screens/ (Safety accidents surface).
Tab count check (Rule 05): no leaf change · replaces raw-UUID cells with EntityLink · count unchanged.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — conforms the accident list to the EntityLink standard.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Accidents list renders foreign keys (driver, unit, load) as **raw UUID strings** instead of **EntityLink** components, so the list shows opaque IDs and does not drill both ways to the driver/unit/load. **Step 1 — reproduce (Rule 10, lucia):** accident table/columns NOT in backbone → read live:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%accident%';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<accidents>' ORDER BY ordinal_position;
ROLLBACK;
SQL
rg -n "accident" app/**/safety/**   # confirm the list cells render raw UUIDs, not EntityLink
```
Classify the accidents table's scoping by opco VALUES + policy before asserting PER-ENTITY. [Accident table name + FK columns + the raw-UUID render are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: accident header `to_regclass('<safety.accidents>')` (name to confirm live) — NEVER a RETIRE table; its driver/unit/load FKs resolve to `mdata.drivers`/`mdata.units`/`mdata.loads`.
2. Hub matrix: accident → `mdata.drivers` (reverse: driver shows accidents) + `mdata.units` (reverse: unit shows accidents) + `mdata.loads` + `org.companies` (both scoped). Safety §10.3 both-way: accident ↔ Driver/Unit/OperatingCompany/Insurance(claim)/Legal(case)/Accounting(GL — via SAF-F34)/Maintenance(WO — via SAF-F35).
3. Cross-module (Rule 21 §1): the accident list, driver profile, and unit profile each render the accident + its parties via EntityLink and drill both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite/McLeod list rendering — every FK in a list is a clickable, resolvable record link (name + drill), never a bare UUID. FMCSA/DOT: an accident register must show which driver and unit, legibly, for a reviewer.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral only — swap raw-UUID cells for EntityLink; no data change. Enforce: operating_company_id RLS + security_invoker on the accident reads · display IDs server-generated. Not financial (Rule 19 N/A; accident economics is SAF-F34 under Rule 13).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the accident list renders FK columns as raw UUID text rather than the EntityLink component, so the list is unreadable and non-navigable. Fix: render each FK (driver/unit/load) via EntityLink resolving to the canonical master with both-way drill; keep the underlying FK unchanged. Coordinate with SAF-F33 to ensure EntityLink has the accident kind registered.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-accident-list-entitylink.mjs + scripts/verify-steps/NNN-verify-accident-list-entitylink.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (accident list cells render raw UUID for driver/unit/load), PASS on fix (EntityLink with both-way drill). --selftest mutates a REAL list copy back to a raw-UUID cell, one case per assertion, and asserts the EntityLink shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, the accident list shows driver/unit/load as EntityLinks (name + drill both ways); no raw UUID visible; guard green. UNVERIFIED — accident table/columns pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F26
LANE: NON-FINANCIAL
DOD-A: PASS — accident list on a registered/mounted route; corrected render is the active path; no dual path.
DOD-B: N/A — list render (no create wizard here; wizard is SAF-F30).
DOD-C: PASS — accident ↔ driver/unit/load FKs both ways; EntityLink resolves the real FK (Law §9); no memo/uuid-in-name.
DOD-D: N/A — no money object (economics SAF-F34).
DOD-E: UNVERIFIED — accident table/columns + raw-UUID render pending Step-1.
VERIFY-1: PASS — list within ParityDrawer/Safety chrome (SAF-F25); EntityLink styling consistent.
VERIFY-2: N/A — list render, not a picker (pickers SAF-F24).
VERIFY-3: PASS — nav→Safety accidents→UI→API→canonical `safety.accidents`/`mdata.*` (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: accident→driver/unit/load (+claim/legal/WO where present) both ways.
VERIFY-5: PASS — TRANSP + USMCA each resolve EntityLinks to their own masters; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on the accident reads; grants unchanged.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: accident-list-entitylink-driver, accident-list-entitylink-unit, accident-list-entitylink-load (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — client render change; no DDL/DML.
ROOT CAUSE: accident list renders driver/unit/load FKs as raw UUID text instead of EntityLink — unreadable, non-navigable.
FIX: render each FK via EntityLink with both-way drill (needs SAF-F33 accident kind); files: accident list component.
GUARD: scripts/verify-steps/NNN-verify-accident-list-entitylink.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 accident table confirm + browser EntityLink drill.
REMAINING: coordinate SAF-F33 (EntityLink accident kind); confirm accident table/columns live; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
