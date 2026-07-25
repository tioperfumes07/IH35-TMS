<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F27 — F27 · 7 double-registered Safety routes
**FINDING:** F27 (P2) · **Lane:** NON-FINANCIAL · **Module:** Safety (route registration). **Provenance: [AUDIT — RE-VERIFY LIVE] — the 7 duplicate registrations are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety routing) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§single-active-path) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — routing hygiene).
Approved screens reviewed: docs/approved-screens/ (Safety nav).
Tab count check (Rule 05): no leaf change · de-duplicates route registrations · count unchanged (a duplicate is not a real extra leaf).
Deviations from spec: None.
NEW SPEC items (Rule 01): None — removes duplicate registrations of existing routes.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
7 Safety routes are **double-registered** — the same path is registered in two places (router + module index, or two config blocks), which risks a DUAL_PATH_OLD_ACTIVE (the wrong/older component winning) and makes reachability audits ambiguous. **Step 1 — reproduce (Rule 10):** the 7 duplicates NOT in backbone → read live:
```
# find duplicate Safety route registrations (same path registered >1x) (read live)
rg -n "path=|route\\(" app/**/safety/** | rg -oi "safety/[a-z0-9/_-]+" | sort | uniq -d
rg -n "register|addRoute|<Route" app/**/safety/**
```
Enumerate the 7 duplicate paths + which registration is the intended-active one. [The 7 duplicates + the correct active component are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each de-duplicated route keeps ONE registration pointing at its canonical backing surface/table — NEVER a RETIRE table; the duplicate that points at an older/dual path is removed.
2. Hub matrix: each route's both-way links to `org.companies`/driver/unit/accident are preserved on the single surviving registration.
3. Cross-module (Rule 21 §1): single active path per route means reachability audits (SAF-F22) and nav are unambiguous across modules.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Full Audit Law: exactly one active product path per route (kill DUAL_PATH_OLD_ACTIVE). NetSuite/QuickBooks routing determinism — no ambiguous double registration that could serve a stale component.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/hygiene — remove the DUPLICATE REGISTRATION only (a code-registration duplicate, not data, not a table): keep the intended-active component, delete the redundant registration; no route's data or component logic is deleted. Enforce: the surviving surface keeps operating_company_id RLS + security_invoker. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = 7 Safety routes are registered twice, creating a latent DUAL_PATH_OLD_ACTIVE hazard and ambiguous reachability. Fix: for each of the 7, identify the intended-active registration (newest/correct component) and remove the redundant one so exactly one registration remains; confirm the surviving component is the new design (kill any old twin). Coordinate with SAF-F22 (reachability) so the de-duplicated set is cleanly nav-linked.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-no-double-route.mjs + scripts/verify-steps/NNN-verify-safety-no-double-route.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (a Safety path is registered more than once), PASS on fix (each Safety path registered exactly once, active = new design). --selftest mutates REAL source to re-register a path twice, one case per assertion, and asserts the single-registration shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, each of the 7 routes resolves to a single, intended-active component (browser + route table); no duplicate registration remains; guard green. UNVERIFIED — the 7 duplicates + intended-active pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F27
LANE: NON-FINANCIAL
DOD-A: PASS — each route has exactly one registration → the intended-active mounted component; DUAL_PATH_OLD_ACTIVE removed.
DOD-B: N/A — routing hygiene; no create wizard.
DOD-C: PASS — surviving surface keeps canonical FKs FORWARD+REVERSE; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — the 7 duplicate paths + intended-active registration pending Step-1.
VERIFY-1: PASS — single active surface uses the correct chrome (SAF-F25); no stale twin.
VERIFY-2: N/A — routing, not a picker.
VERIFY-3: PASS — nav→single route→UI→API→canonical target (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — both-way drill preserved on the surviving surface.
VERIFY-5: PASS — TRANSP + USMCA scoping preserved on the single active path; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged (a duplicate is not a real leaf); no invented tab; coordinate SAF-F28/F22.
VERIFY-8: PASS — RLS/GUC/security_invoker preserved on the surviving surface.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: safety-route-dedupe-x7 (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — route-registration hygiene; no DDL/DML.
ROOT CAUSE: 7 Safety routes registered twice — latent DUAL_PATH_OLD_ACTIVE + ambiguous reachability.
FIX: keep the intended-active registration, remove the redundant one per route; files: Safety router/module-index registration.
GUARD: scripts/verify-steps/NNN-verify-safety-no-double-route.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 duplicate enumeration + single-active browser confirm.
REMAINING: confirm the intended-active component per route; coordinate SAF-F22 (reachability) + SAF-F28 (count); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
