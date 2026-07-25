<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-MODULE-DOD — per-surface DoD A–E + VERIFY 1–8 click-through sweep across every Safety tab/leaf
**FINDING:** SAF-MODULE-DOD (module-level, Full-Audit-Law) · **Lane:** NON-FINANCIAL (individual FIN surfaces stay HOLD under their own blocks) · **Module:** Safety (full module). **Provenance: [AUDIT — RE-VERIFY LIVE] — the live Safety leaf set + per-surface state are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety module) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Full Audit Law / Rule 21) · IH35_ARCHITECTURAL_DESIGN.md (module Safety — reconciled to 28/9 by SAF-F28) · docs/lockdown/00_LOCKED_DECISIONS.md (FIN surfaces HOLD) · docs/module-completion/safety.json (currently 3 of 32).
Approved screens reviewed: docs/approved-screens/ (the full canonical Safety leaf set).
Tab count check (Rule 05): this sweep is bound to the canonical Safety leaf set (28 tabs / 9 groups per SAF-F28); M in safety.json must equal the reconciled leaf/surface count, not a frozen subset (Rule 21/24).
Deviations from spec: none introduced — the sweep documents actual per-surface state against spec.
NEW SPEC items (Rule 01): None — this is the audit-and-bind sweep, not new product.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
`docs/module-completion/safety.json` records **3 of 32** — only 3 Safety surfaces are marked done against 32 tracked items, and the Safety findings SAF-F19..F35 show the real per-surface gaps (linkage, economics, chrome, reachability, wizard depth). This block is the **per-surface DoD A–E + VERIFY 1–8 click-through sweep** across every Safety tab/leaf: each surface gets an evidence-or-UNVERIFIED verdict, and the manifest is bound so M reflects the true surface count (M grows as SAF-F19..F35 reveal FAILs — never freeze to hide leaves). **Step 1 — reproduce (Rule 10, lucia):** the live leaf set + per-surface state NOT in backbone → read live:
```
# 1) the canonical Safety leaf set (approved screens + reconciled nav, SAF-F28=28/9)
ls docs/approved-screens/ | rg -i safety ; rg -n "nav|<Route" app/**/safety/**
# 2) the manifest today (3 of 32)
cat docs/module-completion/safety.json
# 3) per surface, click through and record DoD A-E + VERIFY 1-8 with evidence:
#    route mounted? field persistence? FK both-way? economics purpose? RLS/GUC? — TRANSP AND USMCA
# 4) reconcile M to the true surface count (Rule 24)
```
Every surface verdict must be live evidence or an explicit `UNVERIFIED — <blocker> · Step-1 reproduce`. [The full leaf set + each surface's state are NOT in backbone → sweep live; prod/reference wins.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each Safety surface is verified against its CANONICAL table (accidents/incidents/fines/escrow/damage/cargo-claim/permits/violations → `safety.*`/`driver_finance.*`/`accounting.*`/`maintenance.work_orders`/`catalogs.*`) — NEVER a RETIRE table (`maint.*`/`bank.*`/`payroll.*`/`settlement.*`/`mdata.qbo_*` as write target/`catalogs.cancellation_reasons`).
2. Hub matrix: every surface's both-way links to `org.companies` + `mdata.drivers`/`units`/`loads`/`vendors`/`customers` + `accounting.journal_entries` + `maintenance.work_orders` are checked FORWARD+REVERSE per Safety §10.3 (event ↔ Driver/Unit/OperatingCompany/Insurance/Legal/Accounting/Maintenance + hub).
3. Cross-module (Rule 21 §1): each Safety leaf drills both ways into Driver/Unit/Accounting/Maintenance/Legal/Insurance; a surface that cannot drill is FAIL and stays in M.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Full Audit Law (Rule 21) + DEFINITION-OF-DONE: finish the MODULE under audit before the next; CI-green ≠ done; chrome ≠ linkage; wave-slice ≠ module. NetSuite/McLeod module-completeness discipline. TRANSP + USMCA both verified; evidence-or-UNVERIFIED, never a fake green.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/audit only — record verdicts + bind the manifest; no surface removed, no item dropped from the manifest to lower M (M grows, never freeze to hide leaves — Rule 24). Enforce: each verified surface honors operating_company_id RLS + security_invoker + correct GUC. FIN surfaces (SAF-F21/F23/F29/F34) stay build-and-HOLD under Rule 13; reserve accounts untouched (Rule 19). No package.json/ci.yml/locked-guard edits (Rule 17).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the Safety module is tracked at 3 of 32 with no per-surface DoD evidence, so "done" is unproven and the true surface count is unbound. Fix: (1) enumerate the canonical Safety leaf set live (approved-screens + reconciled nav per SAF-F28 = 28/9); (2) for EACH tab/leaf, click through in TRANSP AND USMCA and record DoD A–E + VERIFY 1–8 with live evidence or an explicit `UNVERIFIED — <blocker>`; (3) bind each item to `docs/module-completion/safety.json`, growing M to the true surface count and mapping SAF-F19..F35 to the surfaces they fix; (4) mark a surface done ONLY with live proof (route mounted + fields persisted + FKs both-way + economics purpose where money + RLS/GUC). No surface is frozen out of M to inflate the ratio (Rule 24).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-module-dod.mjs + scripts/verify-steps/NNN-verify-safety-module-dod.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (safety.json M < the reconciled canonical surface count, or a surface marked done without the DoD/VERIFY evidence trail), PASS on fix (M equals the canonical count; every done surface carries A–E + VERIFY 1–8 evidence; UNVERIFIED surfaces named with blockers). --selftest mutates the REAL manifest to mark an unproven surface done / shrink M, one case per assertion, and asserts the evidenced-and-bound shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: docs/module-completion/safety.json M equals the canonical Safety surface count (≥ the reconciled 28/9 leaf set); each done surface has A–E + VERIFY 1–8 evidence verified in TRANSP AND USMCA; each not-done surface is UNVERIFIED with a named blocker + Step-1; SAF-F19..F35 mapped to their surfaces; guard green. UNVERIFIED — the full leaf set + per-surface sweep pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: SAF-MODULE-DOD
LANE: NON-FINANCIAL
DOD-A: UNVERIFIED→target PASS — every canonical Safety route registered + mounted + nav-linked (coordinate SAF-F22/F27); no DUAL_PATH_OLD_ACTIVE / ComingSoon twin; recorded per surface.
DOD-B: UNVERIFIED→target PASS — every rendered field controlled AND in submit payload per surface (coordinate SAF-F30); recorded per surface.
DOD-C: UNVERIFIED→target PASS — Law §9 both-way FK linkage per surface (coordinate SAF-F19/F26/F29/F33/F35); memo/jsonb/uuid-in-name = FAIL; recorded per surface.
DOD-D: UNVERIFIED→target PASS — purpose→economics per money surface (SAF-F21/F23/F34), no silent default, flags OFF/HOLD; recorded per surface.
DOD-E: UNVERIFIED — the full leaf set + per-surface evidence must be swept live; every verdict is evidence or named blocker (Step-1).
VERIFY-1: UNVERIFIED→target PASS — ParityDrawer/QBO chrome per surface (SAF-F25); recorded.
VERIFY-2: UNVERIFIED→target PASS — universal picker law (7 clauses) per picker (SAF-F24/F31); recorded.
VERIFY-3: UNVERIFIED→target PASS — nav→route→UI→API→CANONICAL Neon table (never RETIRE)→same R/W→entity-scoped→flags honest, per surface.
VERIFY-4: UNVERIFIED→target PASS — deep linkage chains F+R per surface (claim/at-fault/WO/expense/bill+payment as applicable); Safety §10.3.
VERIFY-5: UNVERIFIED→target PASS — catalogs/entity scope TRANSP AND USMCA; drivers-as-vendors; units by owner/lease; no cross-entity leak, per surface.
VERIFY-6: UNVERIFIED→target PASS — economics audit-grade on money surfaces (balanced JE when flag ON, poster reused, control roles, NO TMS→QBO write-back); recorded.
VERIFY-7: PASS — bound to the canonical Safety tab/leaf set (Rule 05, 28/9 per SAF-F28); no invented tab; no silent-missing; M reflects true count.
VERIFY-8: UNVERIFIED→target PASS — FORCE RLS + correct GUC + security_invoker + grants per surface; recorded.
MODULE_PROGRESS: safety M of M — must equal docs/module-completion/safety.json AFTER this PR (currently 3 of 32; M grows to the reconciled canonical surface count as SAF-F19..F35 reveal FAILs; NEVER frozen to hide leaves — Rule 24).
ITEMS_TOUCHED: safety-module-dod-sweep + per-surface manifest items (bind all 32+ live) + mapping SAF-F19..F35 → surfaces (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — audit sweep + manifest binding + verify-step; no DDL/DML; no package.json/ci.yml/locked-guard edits (Rule 17).
ROOT CAUSE: Safety module tracked at 3 of 32 with no per-surface DoD/VERIFY evidence and an unbound M — "done" is unproven and the true surface count is hidden.
FIX: live per-surface DoD A–E + VERIFY 1–8 sweep (TRANSP+USMCA), evidence-or-UNVERIFIED, bind safety.json to the true count, map SAF-F19..F35 to surfaces; files: docs/module-completion/safety.json + sweep evidence + verify-step.
GUARD: scripts/verify-steps/NNN-verify-safety-module-dod.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 full leaf enumeration + per-surface click-through evidence in TRANSP and USMCA.
REMAINING: complete the sweep for every leaf; M grows as FAILs surface (Rule 21/24); FIN surfaces stay HOLD (Rule 13) + reserve accounts owner-manual (Rule 19); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
