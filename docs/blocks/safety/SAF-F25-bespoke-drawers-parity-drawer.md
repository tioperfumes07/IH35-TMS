<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F25 — F25 · bespoke drawers instead of ParityDrawer (VERIFY-1 chrome)
**FINDING:** F25 (P2) · **Lane:** NON-FINANCIAL · **Module:** Safety (drawer chrome). **Provenance: [AUDIT — RE-VERIFY LIVE] — the bespoke-drawer surfaces are not enumerated in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§QBO chrome / ParityDrawer) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§VERIFY-1 visual chrome) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — UI conformance).
Approved screens reviewed: docs/approved-screens/ (Safety drawer surfaces).
Tab count check (Rule 05): no leaf change · swaps bespoke drawers for the shared ParityDrawer · count unchanged.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — conforms to the locked ParityDrawer chrome.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
One or more Safety surfaces render **bespoke drawers** (hand-rolled side panels) instead of the shared **ParityDrawer**, so they miss the locked QBO chrome (side-panel layout, Due auto, box-in-box, +Create/+Book, drawer-on-drawer) — a VERIFY-1 conformance failure and a source of drift. **Step 1 — reproduce (Rule 10):** the bespoke drawers are NOT enumerated in backbone → read live:
```
# Safety surfaces that render their own drawer instead of ParityDrawer (read live)
rg -n "Drawer|SidePanel|Sheet|Modal" app/**/safety/**
rg -n "ParityDrawer" app/**/safety/**     # the ones that DON'T match are the bespoke offenders
```
Enumerate each bespoke drawer + the surface it belongs to. [The bespoke-drawer surfaces are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: purely presentational — each converted surface keeps writing/reading its existing canonical table (accidents/fines/claims/escrow/`catalogs.*`); NEVER a RETIRE table. The chrome swap changes no data path.
2. Hub matrix: unchanged — the surface's both-way links to `org.companies`/driver/unit/accident are preserved; ParityDrawer must not drop any existing FK render.
3. Cross-module (Rule 21 §1): ParityDrawer is the shared component across modules; adopting it makes Safety consistent with Accounting/Dispatch and preserves both-way drill.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks side-panel transaction chrome (the ParityDrawer parity target): consistent side panel, Due auto, box-in-box, +Create/+Book, drawer-on-drawer. A bespoke drawer diverges from the locked visual system and re-implements behavior that must be shared.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral only — replace bespoke drawers with ParityDrawer; no data change, no route removed. Enforce: the converted surface keeps operating_company_id RLS + security_invoker on its reads/writes · display IDs server-generated · +Create/+Book (never +New/+Add). Not financial (Rule 19 N/A; FIN surfaces that adopt ParityDrawer, e.g. SAF-F21/F23, still HOLD under Rule 13).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = Safety surfaces hand-roll their own drawer chrome instead of using the shared ParityDrawer, diverging from the locked QBO visual system (VERIFY-1). Fix: replace each enumerated bespoke drawer with ParityDrawer, preserving the surface's existing data path, FK renders (EntityLinks), and pickers; verify the QBO chrome elements (side panel, Due auto where applicable, box-in-box, +Create/+Book, drawer-on-drawer). No data or economics change from this block.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-parity-drawer.mjs + scripts/verify-steps/NNN-verify-safety-parity-drawer.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (a Safety create/edit surface renders a bespoke drawer, not ParityDrawer), PASS on fix (every such surface uses ParityDrawer with the required chrome). --selftest mutates a REAL surface copy back to a bespoke drawer, one case per assertion, and asserts the ParityDrawer shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, every Safety create/edit surface opens the shared ParityDrawer with QBO chrome (side panel, +Create/+Book, drawer-on-drawer); no bespoke drawer remains; data path unchanged; guard green. UNVERIFIED — the bespoke-drawer surface set pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F25
LANE: NON-FINANCIAL
DOD-A: PASS — converted surfaces stay on their registered/mounted routes; ParityDrawer is the active chrome; no dual path.
DOD-B: PASS — every rendered field stays controlled AND in the submit payload after the chrome swap (no field lost — cross-check SAF-F30).
DOD-C: PASS — existing canonical FKs + EntityLinks preserved FORWARD+REVERSE.
DOD-D: N/A — presentational; FIN surfaces keep their HOLD posture (SAF-F21/F23).
DOD-E: UNVERIFIED — the bespoke-drawer surface set must be enumerated live before freeze.
VERIFY-1: PASS — ParityDrawer side panel, Due auto (where applicable), box-in-box, +Create/+Book, drawer-on-drawer — the core of this block.
VERIFY-2: PASS — pickers inside the drawer follow the universal picker law (coordinate SAF-F24); inline +Add first row.
VERIFY-3: PASS — nav→Safety→UI→API→canonical table (never RETIRE)→same R/W→entity-scoped→flags honest; unchanged by the swap.
VERIFY-4: PASS — both-way drill chains preserved after conversion.
VERIFY-5: PASS — TRANSP + USMCA entity scoping preserved; no cross-entity leak.
VERIFY-6: N/A — no economics change; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — RLS/GUC/security_invoker unchanged on the converted surfaces.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: safety-parity-drawer-conversion (per enumerated surface; manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — client chrome swap; no DDL/DML.
ROOT CAUSE: Safety surfaces hand-roll bespoke drawers instead of the shared ParityDrawer, diverging from the locked QBO chrome (VERIFY-1).
FIX: replace each bespoke drawer with ParityDrawer, preserving data path/FK renders/pickers; files: enumerated Safety surface components.
GUARD: scripts/verify-steps/NNN-verify-safety-parity-drawer.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 enumeration + browser proof of ParityDrawer chrome.
REMAINING: enumerate the bespoke-drawer surfaces; cross-check SAF-F30 that no field is dropped in the swap; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
