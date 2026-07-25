<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F33 — F33 · EntityLink has no accident/incident/fine/escrow/complaint/permit kinds (Rule 21 both-way drill)
**FINDING:** F33 (P2→P1) · **Lane:** NON-FINANCIAL · **Module:** Safety (EntityLink registry). **Provenance: [AUDIT — RE-VERIFY LIVE] — EntityLink's registered kinds are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze. Escalated P2→P1 because without these kinds no Safety record can drill both-way (Rule 21) — it blocks SAF-F19/F26/F35.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§EntityLink kinds) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Rule 21 both-way drill) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — linkage plumbing).
Approved screens reviewed: docs/approved-screens/ (Safety surfaces that must drill).
Tab count check (Rule 05): no leaf change · registers new EntityLink kinds · count unchanged.
Deviations from spec: the missing kinds are the deviation.
NEW SPEC items (Rule 01): None — extends the existing EntityLink registry with Safety kinds.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The EntityLink component/registry has **no kinds for accident, incident, fine, escrow, complaint, or permit**, so Safety records cannot be rendered as resolvable both-way links (Rule 21 drill) — this is the plumbing that SAF-F19 (fines), SAF-F26 (accidents), and SAF-F35 (spawn WO/liability) depend on. **Step 1 — reproduce (Rule 10):** registered kinds NOT in backbone → read live:
```
# what kinds EntityLink currently registers (read live)
rg -n "EntityLink|entityKind|type:.*link|registerKind" app/**/**
rg -n "'driver'|'unit'|'load'|'accident'|'incident'|'fine'|'escrow'|'complaint'|'permit'" app/**/**entity*link*
# confirm each Safety kind resolves to a canonical route + display resolver
```
Enumerate which of the 6 kinds are missing + each one's canonical route/resolver target. [EntityLink's registered kinds are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each new kind resolves to its canonical Safety table/route — accident→`<safety.accidents>`, incident→`<safety.incidents>`, fine→`<safety.fines>` (SAF-F19), escrow→`driver_finance.*` escrow (SAF-F23), complaint→`complaint_types`-backed complaint record, permit→`<safety.permits>` — NEVER a RETIRE table.
2. Hub matrix: each kind renders a record that links BOTH-WAY to `org.companies` + its driver/unit/load; EntityLink is the both-way drill mechanism the hub relies on.
3. Cross-module (Rule 21 §1): once registered, accidents/fines/escrow/etc. drill both ways everywhere they appear (lists, profiles, drawers) — unblocking SAF-F19/F26/F35.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite record-link registry: every record type is a first-class, resolvable link with a route + display resolver. Rule 21 both-way drill: a record that cannot be linked/drilled is not done. Full Audit Law: no silent-missing link kind.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — register new EntityLink kinds; no existing kind changed/removed. Enforce: each kind's resolver honors operating_company_id RLS + security_invoker (entity-scoped route) · display IDs server-generated. Not financial (Rule 19 N/A; the escrow/fine kinds link to FIN records governed by SAF-F21/F23/F34 under Rule 13 — this block only registers the link kind).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = EntityLink's kind registry lacks accident/incident/fine/escrow/complaint/permit, so Safety records cannot be rendered as both-way drillable links — blocking every Safety linkage finding. Fix: register the 6 kinds (each with its canonical route + entity-scoped display resolver: label + drill target), reusing the existing EntityLink registration pattern; then the dependent blocks (SAF-F19/F26/F35) render EntityLinks. Resolvers stay GUC-scoped so a link never resolves cross-entity.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-entitylink-safety-kinds.mjs + scripts/verify-steps/NNN-verify-entitylink-safety-kinds.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (EntityLink lacks any of accident/incident/fine/escrow/complaint/permit), PASS on fix (all 6 registered with canonical route + entity-scoped resolver + both-way drill). --selftest mutates a REAL registry copy to remove a Safety kind, one case per assertion, and asserts the registered shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, an accident/incident/fine/escrow/complaint/permit renders as an EntityLink that drills both ways to its canonical record, scoped to the entity; all 6 kinds resolve; guard green. UNVERIFIED — which kinds are missing + each resolver target pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F33
LANE: NON-FINANCIAL
DOD-A: PASS — EntityLink registry is the active linkage mechanism; new kinds registered; no dual path.
DOD-B: N/A — registry plumbing; no create wizard.
DOD-C: PASS — the core: each kind renders a real FK-backed both-way link FORWARD+REVERSE; no memo/uuid-in-name.
DOD-D: N/A — no money object (FIN records governed by SAF-F21/F23/F34).
DOD-E: UNVERIFIED — missing-kind set + resolver targets pending Step-1.
VERIFY-1: PASS — EntityLink renders consistently inside ParityDrawer chrome (SAF-F25).
VERIFY-2: N/A — registry, not a picker (though pickers/EntityLink share canonical targets).
VERIFY-3: PASS — link→canonical route→UI→API→canonical Safety table (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — the enabling plumbing for deep chains: accident/fine/escrow/etc. now drill both ways (unblocks SAF-F19/F26/F35).
VERIFY-5: PASS — resolvers GUC-scoped for TRANSP and USMCA; a link never resolves cross-entity.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — each kind's resolver route enforces FORCE RLS + correct GUC + security_invoker; grants unchanged.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: entitylink-kind-accident, -incident, -fine, -escrow, -complaint, -permit (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — client/registry registration; no DDL/DML.
ROOT CAUSE: EntityLink registry lacks accident/incident/fine/escrow/complaint/permit kinds — Safety records cannot be rendered as both-way drillable links (Rule 21), blocking SAF-F19/F26/F35.
FIX: register the 6 kinds with canonical route + entity-scoped resolver; files: EntityLink registry/config.
GUARD: scripts/verify-steps/NNN-verify-entitylink-safety-kinds.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 missing-kind enumeration + browser both-way drill for each kind.
REMAINING: land before/with SAF-F19/F26/F35 (they depend on these kinds); confirm each resolver target; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
