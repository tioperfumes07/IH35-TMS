<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F30 — F30 · accident-wizard-catalogs guard passes while 12 rendered fields are discarded (DOD-B)
**FINDING:** F30 (P2) · **Lane:** NON-FINANCIAL · **Module:** Safety (Accident wizard). **Provenance: [AUDIT — RE-VERIFY LIVE] — the 12 discarded fields + the guard's shape-only pass are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Accident capture) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§DOD-B wizard depth) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — data capture completeness).
Approved screens reviewed: docs/approved-screens/ (Safety accident wizard).
Tab count check (Rule 05): no leaf change · closes the wizard's field-loss + tightens the guard · count unchanged.
Deviations from spec: the 12 discarded fields are the deviation (rendered but not persisted).
NEW SPEC items (Rule 01): None — persists fields the wizard already renders.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The accident wizard renders fields the user fills, but **12 of them are discarded** — not in the submit payload / not persisted — while the `accident-wizard-catalogs` guard **passes** (it checks catalog shape, not that every rendered field is controlled AND persisted). This is a DOD-B violation (wizard depth) masked by a shape-only guard. **Step 1 — reproduce (Rule 10, lucia):** the 12 fields + guard gap NOT in backbone → read live:
```
# 1) fields the wizard renders vs fields in the submit payload (the 12 dropped ones)
rg -n "name=|register\\(|<Input|<Select" app/**/safety/**accident*    # rendered
rg -n "payload|body:|INSERT|mutation" app/**/safety/**accident*        # persisted
# 2) confirm the accident table has (or needs) columns for the 12
psql "$NEON_PROD" -c "BEGIN; SET LOCAL app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_name='<accidents>'; ROLLBACK;"
# 3) what the current guard actually asserts (catalog shape, not field persistence)
rg -n "accident-wizard-catalogs" scripts/**
```
Enumerate the 12 fields + whether each has a destination column (add via additive migration if missing). [The 12 fields + the guard's shape-only assertion are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each of the 12 fields persists to the canonical accident table (`<safety.accidents>` or a child) — NEVER a RETIRE table; any FK field among the 12 (driver/unit/load) writes a real FK (coordinate SAF-F26/F33 EntityLink).
2. Hub matrix: the completed accident links BOTH-WAY to `mdata.drivers`/`mdata.units`/`mdata.loads` + `org.companies` (both scoped); the 12 fields include the data needed for downstream claim/WO (SAF-F34/F35).
3. Cross-module (Rule 21 §1): accident detail, driver/unit profiles read the now-persisted fields; nothing rendered is silently lost.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Full Audit Law DOD-B: every rendered field must be controlled AND in the submit payload — no silent field loss. FMCSA/DOT accident capture completeness. A guard that green-lights while data is dropped is a shape-vs-substance defect (see LST-GUARD-SUITE).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — persist the 12 fields (add columns idempotently if missing); tighten the guard via verify-steps/NNN; no data deletion. Enforce: operating_company_id RLS on accidents · views WITH(security_invoker=true) · append-only audit · display IDs server-generated. Not financial (Rule 19 N/A; accident→money is SAF-F34 under Rule 13).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the accident wizard renders 12 fields that are not wired into the submit payload/persistence, and the existing guard only checks catalog shape so it passes anyway (DOD-B masked). Fix: (1) wire all 12 rendered fields into the controlled form state AND the submit payload; (2) ensure each has a destination column (idempotent additive migration for any missing); (3) tighten the guard so it asserts every rendered field is persisted (substance), not just catalog shape.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-accident-wizard-field-persistence.mjs + scripts/verify-steps/NNN-verify-accident-wizard-field-persistence.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (a rendered accident-wizard field is not in the submit payload / not persisted; the shape-only guard passes), PASS on fix (every rendered field controlled + persisted; substance-checking guard). --selftest mutates a REAL wizard copy to drop a field from the payload, one case per assertion, and asserts the fully-persisted shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, filling the accident wizard persists all rendered fields (all 12 reconciled) to canonical columns; re-opening the record shows them; the tightened guard fails on a dropped field; guard green. UNVERIFIED — the 12 fields + destination columns pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F30
LANE: NON-FINANCIAL
DOD-A: PASS — accident wizard on a registered/mounted route; corrected wizard is the active path; no dual path.
DOD-B: UNVERIFIED→target PASS — the core: every rendered field (all 12 previously dropped) controlled AND in the submit payload; confirm the exact 12 live.
DOD-C: PASS — FK fields among the 12 write real FKs both ways (coordinate SAF-F26/F33); no memo/uuid-in-name.
DOD-D: N/A — no money object (accident→money SAF-F34).
DOD-E: UNVERIFIED — the 12 fields + destination columns + guard-gap confirmation pending Step-1.
VERIFY-1: PASS — wizard uses ParityDrawer chrome (SAF-F25); +Create.
VERIFY-2: PASS — any picker among the 12 fields follows picker law (SAF-F24), write=read, entity-scoped.
VERIFY-3: PASS — nav→accident wizard→UI→API→canonical `safety.accidents` (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — persisted fields feed downstream claim/WO chains (SAF-F34/F35) both ways.
VERIFY-5: PASS — TRANSP + USMCA each persist to their own entity's accident record; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on accidents; grants correct.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: accident-wizard-persist-12-fields, accident-wizard-guard-substance (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if all 12 destination columns exist (code-only wiring). If any missing: idempotent additive ADD COLUMN, above both 202607950000 and 202607960000 (distinct, e.g. 202607970030), FORCE RLS, REVOKE DELETE, grants, validate on throwaway only, checksum-override same PR.
ROOT CAUSE: accident wizard renders 12 fields not wired into the submit payload/persistence; the accident-wizard-catalogs guard checks catalog shape only, so it passes while data is dropped (DOD-B masked).
FIX: wire all 12 rendered fields into state + payload (add any missing columns) + tighten the guard to assert field persistence; files: accident wizard component + API + additive migration if needed + verify-step.
GUARD: scripts/verify-steps/NNN-verify-accident-wizard-field-persistence.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 enumeration of the 12 + prod round-trip persistence.
REMAINING: enumerate the 12 + confirm destination columns; coordinate SAF-F26/F33 for FK fields; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
