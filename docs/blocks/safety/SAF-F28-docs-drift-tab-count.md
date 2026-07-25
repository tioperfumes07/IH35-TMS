<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F28 — F28 · docs drift: 21/8 vs canonical 28 tabs / 9 groups (Rule 05 tab law)
**FINDING:** F28 (P2) · **Lane:** DOCS · **Module:** Safety (tab/design law + IH35_ARCHITECTURAL_DESIGN). **Provenance: [AUDIT — RE-VERIFY LIVE] — the live tab/group count is not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety tabs) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§tab law) · IH35_ARCHITECTURAL_DESIGN.md (module Safety — the doc that drifts) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — docs/design reconciliation).
Approved screens reviewed: docs/approved-screens/ (Safety — the approved tab set).
Tab count check (Rule 05): docs currently say **21 tabs / 8 groups**; canonical (approved-screens + live nav) is **28 tabs / 9 groups** · this block reconciles the doc to the canonical count in the SAME commit as any code that changes the count (Rule 05).
Deviations from spec: the doc is the deviation — it is stale vs the canonical 28/9.
NEW SPEC items (Rule 01): None — reconciles the design doc to the already-approved tab set; no new product surface.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
IH35_ARCHITECTURAL_DESIGN.md documents the Safety module as **21 tabs / 8 groups** while the canonical set (approved-screens + live nav, once SAF-F22/F27 reachability is reconciled) is **28 tabs / 9 groups** — a Rule 05 tab-law drift: the design doc no longer matches the product. **Step 1 — reproduce (Rule 10):** the true live count is NOT in backbone → read live and reconcile all three sources:
```
# 1) what the design doc claims
rg -n "tab|group" docs/**/IH35_ARCHITECTURAL_DESIGN* | rg -i "safety"
# 2) what the approved screens show (canonical)
ls docs/approved-screens/ | rg -i "safety"
# 3) what the live nav renders (after SAF-F22 orphan + SAF-F27 dedupe reconciliation)
rg -n "nav|leaf|<Route" app/**/safety/**
# reconcile: canonical (approved + reconciled live) wins; update the doc to match
```
Confirm the canonical is 28/9 (not merely the audit's number) before writing. [The exact live count + the correct 28/9 must be confirmed live; the doc's 21/8 is the drift.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the DOC (IH35_ARCHITECTURAL_DESIGN.md Safety section) is updated to the canonical tab/group count — no data table touched; NEVER a RETIRE table.
2. Hub matrix: N/A for a docs reconciliation (no record FK); it governs the Safety nav leaves that link to `org.companies`-scoped surfaces.
3. Cross-module (Rule 21 §1): the reconciled count must agree with SAF-F22 (reachability) and SAF-F27 (dedupe) so the doc, nav, and approved screens are one truth.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Rule 05 tab law + Full Audit Law: the design doc is a controlled artifact that must match the approved product; a stale count is a documentation defect that misleads audits. NetSuite/QuickBooks change-control: docs updated in the same commit as the surface.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/documentation only — update the design doc to the canonical count; no tab deleted (reachability/dedupe is SAF-F22/F27). Enforce: docs updated SAME COMMIT if any code changes the count (Rule 05). Not financial (Rule 19 N/A). No package.json/ci.yml/locked-guard edits.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = IH35_ARCHITECTURAL_DESIGN.md drifted to 21 tabs / 8 groups while the canonical approved+live Safety set is 28 tabs / 9 groups (Rule 05). Fix: reconcile the three sources (approved-screens = canonical, live nav after SAF-F22/F27, design doc), confirm the canonical 28/9 live, and update the design doc's Safety section to match — in the SAME commit as any code that alters the count. If the live nav does not yet equal 28/9 because of orphan/duplicate routes, this block lands together with SAF-F22/F27 so doc + nav + screens agree.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-tab-count-parity.mjs + scripts/verify-steps/NNN-verify-safety-tab-count-parity.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (design doc Safety tab/group count != canonical approved+live count), PASS on fix (doc == canonical 28/9). --selftest mutates the REAL doc back to 21/8, one case per assertion, and asserts the reconciled count is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: IH35_ARCHITECTURAL_DESIGN.md Safety section states 28 tabs / 9 groups matching approved-screens and live nav (post SAF-F22/F27); guard green. UNVERIFIED — the canonical 28/9 must be confirmed live before writing the doc.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F28
LANE: DOCS
DOD-A: N/A — docs reconciliation, no route/component change (reachability is SAF-F22).
DOD-B: N/A — no wizard.
DOD-C: N/A — no record FK; governs nav leaves only.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — canonical 28/9 must be confirmed live (approved-screens + reconciled nav) before freezing the doc.
VERIFY-1: N/A — no user chrome change.
VERIFY-2: N/A — not a picker.
VERIFY-3: N/A — no data path change.
VERIFY-4: N/A — no linkage chain.
VERIFY-5: N/A — no entity-scoped write (docs only).
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — the core: design doc reconciled to the canonical Safety tab/group count (Rule 05); no invented tab; no silent-missing; doc updated same commit as any count-changing code.
VERIFY-8: N/A — no RLS surface (docs).
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; the reconciled tab set feeds SAF-MODULE-DOD's M].
ITEMS_TOUCHED: safety-design-doc-tab-count-reconcile (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — docs only; no DDL/DML; no package.json/ci.yml/locked-guard edits (Rule 17).
ROOT CAUSE: IH35_ARCHITECTURAL_DESIGN.md drifted to 21 tabs / 8 groups vs the canonical approved+live 28 tabs / 9 groups (Rule 05 tab-law drift).
FIX: confirm canonical 28/9 live, update the design doc Safety section to match, same commit as SAF-F22/F27 count reconciliation; files: IH35_ARCHITECTURAL_DESIGN.md.
GUARD: scripts/verify-steps/NNN-verify-safety-tab-count-parity.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 confirmation of canonical 28/9 across approved-screens + reconciled live nav.
REMAINING: land with SAF-F22 (orphan) + SAF-F27 (dedupe) so doc, nav, and screens are one truth; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
