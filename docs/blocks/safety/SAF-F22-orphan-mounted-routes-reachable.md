<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F22 — F22 · 6 orphan-mounted Safety routes (audit-425c, reports, training, eld/audit-trail, photo-comparison)
**FINDING:** F22 (P1) · **Lane:** NON-FINANCIAL · **Module:** Safety (route reachability / nav). **Provenance: [AUDIT — RE-VERIFY LIVE] — the 6 routes' mount/nav state is not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety surfaces) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Rule 21 reachability) · IH35_ARCHITECTURAL_DESIGN.md (module Safety nav) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — nav wiring, no GL).
Approved screens reviewed: docs/approved-screens/ (Safety nav — confirm exact PNG live).
Tab count check (Rule 05): these 6 routes are mounted but NOT linked in nav · this block makes each reachable/linked (or owner-documents intended-headless) · coordinate the reconciled count with SAF-F28.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — the components exist and are mounted; they just aren't reachable/linked.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
6 Safety routes are **orphan-mounted** — the component/route is registered but no nav leaf links to it, so it is unreachable from the UI (Rule 21 reachable/linked violation): **audit-425c, reports, training, eld/audit-trail, photo-comparison** (6th route name to confirm live). A mounted-but-unlinked route is a silent-missing surface. **Step 1 — reproduce (Rule 10):** mount/nav state NOT in backbone → read live:
```
# routes registered vs nav leaves that link them (read live)
rg -n "audit-425c|/reports|training|eld/audit-trail|photo-comparison" app/**/safety/**
rg -n "route|path=" app/**/safety/** | rg -v "nav|menu"          # mounted
rg -n "nav|menu|leaf|Link" app/**/safety/**                      # linked
# diff: mounted set MINUS linked set = the orphans
```
Enumerate all 6 (the list above is from the Desktop audit; confirm the exact 6 + their canonical data targets live). [The 6 routes' orphan state + their backing tables are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each of the 6 routes resolves to its canonical backing surface (e.g. audit-425c → the Form 425c source; eld/audit-trail → ELD audit table; photo-comparison → the photo/accident evidence table) — NEVER a RETIRE table; confirm each target live.
2. Hub matrix: each reachable Safety surface links BOTH-WAY to `org.companies` (per-entity where opco VALUES populate) and to the driver/unit/accident it concerns; reports read canonical per-entity sources.
3. Cross-module (Rule 21 §1): each of the 6 becomes reachable from the Safety hub and drills both ways; any intentionally-headless one gets a documented owner note naming its consumer.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite record/surface reachability + Full Audit Law: a mounted route that no nav links to is a silent-missing surface. FMCSA/DOT: audit-425c, ELD audit-trail, and photo evidence are compliance surfaces that must be reachable for a DOT reviewer.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — add nav leaves / links (or a documented headless owner-note); no route removed, no component deleted. Enforce: reachable surfaces honor operating_company_id RLS + security_invoker · display IDs server-generated. Not financial (Rule 19 N/A; reports that touch money read canonical per-entity, never write).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = 6 Safety routes are registered/mounted but have no nav leaf linking to them, so they are unreachable (Rule 21). Fix: for each of the 6, add a Safety nav leaf linking the route (reachable + both-way linked to its data), OR — if a route is intentionally deep-linked-only / system — add a documented owner-note (docs/trackers) naming why no top nav leaf. Reconcile the resulting reachable-leaf count with SAF-F28 (tab law) in the same commit.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-route-reachability.mjs + scripts/verify-steps/NNN-verify-safety-route-reachability.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (a mounted Safety route has no nav leaf AND no documented headless note), PASS on fix (every mounted Safety route is nav-linked or owner-noted headless). --selftest mutates REAL source to add a mounted-but-unlinked route, one case per assertion, and asserts the linked shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, each of the 6 routes is reachable via a Safety nav leaf (browser click-through) and drills both ways to its data, or appears in the headless owner-note doc; zero orphan-mounted Safety routes remain; guard green. UNVERIFIED — the exact 6 + their backing targets pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F22
LANE: NON-FINANCIAL
DOD-A: PASS — each of the 6 gains a registered nav leaf → mounted component (no orphan); no DUAL_PATH_OLD_ACTIVE; no ComingSoon twin.
DOD-B: N/A — nav wiring; surfaces reuse their vetted payloads.
DOD-C: PASS — each reachable surface exposes canonical FKs FORWARD+REVERSE to its driver/unit/accident; no memo/uuid-in-name.
DOD-D: N/A — no money object (reports read-only).
DOD-E: UNVERIFIED — the exact 6 routes + backing tables + orphan confirmation pending Step-1.
VERIFY-1: PASS — Safety hub chrome gains the 6 leaves; consistent nav.
VERIFY-2: PASS — where a surface references a catalog, it uses the universal picker; entity-scoped.
VERIFY-3: PASS — nav→route→UI→API→canonical target (never RETIRE)→same R/W→entity-scoped→flags honest; headless documented.
VERIFY-4: PASS — reachable surfaces drill both ways (audit-425c→driver/unit; photo-comparison→accident; eld/audit-trail→driver/unit).
VERIFY-5: PASS — per-entity surfaces scoped for TRANSP and USMCA; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — reachable-leaf set reconciled with design (Rule 05) in the same commit as SAF-F28; no invented tab, no silent-missing.
VERIFY-8: PASS — reachable surfaces FORCE RLS + correct GUC + security_invoker + grants.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: safety-nav-audit425c, safety-nav-reports, safety-nav-training, safety-nav-eld-audit-trail, safety-nav-photo-comparison, safety-nav-route6 (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — nav/route config + docs only; no DDL/DML; no package.json/ci.yml/locked-guard edits (Rule 17).
ROOT CAUSE: 6 Safety routes are mounted but not linked by any nav leaf — unreachable, silent-missing surfaces (Rule 21).
FIX: add a nav leaf per route (or documented headless owner-note); reconcile reachable-leaf count with SAF-F28 same commit; files: Safety nav config + docs/trackers headless note.
GUARD: scripts/verify-steps/NNN-verify-safety-route-reachability.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 enumeration of the 6 + browser reachability in TRANSP/USMCA.
REMAINING: confirm the 6th route name + each backing target; coordinate reconciled count with SAF-F28 (same commit).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
