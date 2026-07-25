<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-GUARD-SUITE — guard shape-vs-substance sweep + evidence backfill for 5 merged Lists PRs
**FINDING:** LST-GUARD-SUITE (P2, guard integrity) · **Lane:** NON-FINANCIAL · **Module:** lists/CI guards. **Provenance: [GUARD-VERIFIED 2026-07-25] for the 4 guard defects; [AUDIT — RE-VERIFY LIVE] for per-PR evidence.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§CI guards) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§verify-steps) · IH35_ARCHITECTURAL_DESIGN.md (module CI) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — guards, no GL) · EVERY-PR-CHECKLIST + Full-Audit-Law.
Approved screens reviewed: N/A (CI/guard block; no user surface).
Tab count check (Rule 05): no tab change — guard hardening + evidence docs only.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — tightens existing guards; adds evidence to already-merged PRs.

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25] (guard defects) / [AUDIT — RE-VERIFY LIVE] (PR evidence)
Four guards pass on SHAPE while missing SUBSTANCE, and 5 already-merged Lists PRs lack an evidence trail (their counts are prod-verified — do NOT revert). Defects:
1. `verify:no-hardcoded-list-counts` scans the WRONG surface — it inspects a file/route where counts do not live, so a hardcoded count on the real ribbon surface slips through (see LST-F01: wire the guard to the surface the value lives on).
2. `DomainCountParity` compares a source against ITSELF (same-source) — “parity” is trivially true; it must compare the UI/count-spec value against the CANONICAL per-entity Neon count.
3. the checksum guard is CI-INTERNAL (validates its own artifact) rather than checking the PROD ledger (migration ledger max / applied state), so drift like the 870–890 checksum incident is not caught at the ledger.
4. the 1324 gate reads the COMMIT MESSAGE, not the PR BODY, so PR-body evidence/keys are unchecked (a commit can pass while the PR body is empty).

5 merged Lists PRs need evidence backfilled (NO revert — counts prod-verified): **#3397, #3403, #3405, #3408, #3409.** **Step 1 — reproduce (Rule 10):**
```
# guard-defect reproduction (read live)
rg -n "no-hardcoded-list-counts" scripts/**            # which surface does it scan? (wrong one)
rg -n "DomainCountParity" scripts/**                    # both sides same source?
rg -n "checksum" scripts/** .github/**                  # CI-internal vs prod-ledger?
rg -n "1324" scripts/** .github/**                      # reads commit msg vs PR body?
# PR evidence backfill
gh pr view 3397 --json title,body,files ; gh pr view 3403 --json body ; gh pr view 3405 --json body ; gh pr view 3408 --json body ; gh pr view 3409 --json body
# prod parity anchor for those PRs (lucia) — counts were verified; re-confirm before writing evidence
psql "$NEON_PROD" -c "BEGIN; SET LOCAL app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.accounts; ROLLBACK;"
```
Guard file paths + the PRs’ current evidence state are NOT in the backbone → read live. Rule 17: touch verify-steps/NNN only — NEVER edit package.json/ci.yml/locked-guards.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each tightened guard must assert against the CANONICAL surface/table (ribbon component for counts; canonical per-entity Neon `count(*)` for parity; the prod migration ledger for checksum; the PR body for 1324) — never a same-source or wrong-surface proxy, never a RETIRE table.
2. Hub matrix: guards protect the count surfaces linked to `org.companies` (per-entity) and the migration ledger; the 5 PRs’ evidence links each merged change to its prod-verified count.
3. Cross-module (Rule 21 §1): these guards gate lists/accounting/maintenance count surfaces and the migration pipeline; evidence backfill closes the PR-body trail.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Our Full Audit Law + DEFINITION-OF-DONE — a guard must test substance (real value vs canonical truth), not shape; CI-green ≠ done. A merged financial-adjacent PR must carry evidence (auditor-reviewable trail). NetSuite/QuickBooks change-control rigor.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/hardening only — tighten guards via NEW/edited verify-steps/NNN files (Rule 17); add evidence docs to the 5 PRs; DO NOT revert the 5 PRs (their counts are prod-verified) and DO NOT edit package.json/ci.yml/locked-guards. Enforce: guards fail on the bug, pass on the fix, --selftest mutates real source. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Tighten ONE guard per issue via verify-steps/NNN: (1) repoint `no-hardcoded-list-counts` to the ribbon surface where counts render; (2) make `DomainCountParity` compare the UI/spec value against the canonical per-entity Neon count (two distinct sources); (3) add a prod-ledger check to the checksum guard (assert against the applied migration ledger, not the CI artifact); (4) make the 1324 gate read the PR body (not just the commit message). Then backfill evidence for #3397/#3403/#3405/#3408/#3409 (prod-verified counts, do NOT revert). One guard tightened per PR so each change is isolated and reviewable.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-guard-substance.mjs + scripts/verify-steps/NNN-verify-guard-substance.mjs (one NNN per tightened guard). FAIL on pre-fix main (assert each guard tests shape: wrong surface / same-source parity / CI-internal checksum / commit-msg-only 1324); PASS on the fix (correct surface / cross-source parity / prod-ledger checksum / PR-body 1324). --selftest mutates REAL source back to the shape-only assertion, one case per assertion, and asserts the substance shape is NOT flagged. NEVER edit package.json/ci.yml/locked-guards.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: each tightened guard FAILs on a reintroduced shape-only bug and PASSes on substance; the 5 PRs carry evidence docs referencing their prod-verified counts (TRANSP + USMCA where entity-relevant); the 5 PRs remain merged (not reverted); guards wired. OR "UNVERIFIED — guard paths / PR bodies not yet read; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: LST-GUARD-SUITE
LANE: NON-FINANCIAL
DOD-A: PASS — each guard has one active, correctly-targeted verify-step; no shape-only twin left active.
DOD-B: N/A — guard/evidence work, no create wizard.
DOD-C: PASS — each guard asserts against the canonical surface/table FORWARD (value) + REVERSE (source of truth); evidence links PR→prod count.
DOD-D: N/A — no money object.
DOD-E: PASS — 4 guard defects GUARD-VERIFIED 2026-07-25; PR evidence UNVERIFIED until Step-1 reads the 5 PR bodies + re-confirms counts.
VERIFY-1: N/A — no user chrome (CI block).
VERIFY-2: N/A — not a picker.
VERIFY-3: PASS — guard→correct surface/canonical Neon/prod ledger/PR body→honest pass-fail; no wrong-surface/same-source proxy.
VERIFY-4: PASS — checksum guard now chains to the prod migration ledger (real drift detection).
VERIFY-5: PASS — parity guard checks per-entity counts for TRANSP and USMCA (cross-source), not a same-source echo.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: N/A — no tab/design change (Rule 05).
VERIFY-8: PASS — guards respect RLS/GUC when reading canonical counts (lucia bypass only inside the reproduce txn); no privilege change.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR; guard hardening may reveal new FAILs → M grows, Rule 21].
ITEMS_TOUCHED: guard-no-hardcoded-counts, guard-domaincountparity, guard-checksum-prod-ledger, guard-1324-pr-body, evidence-backfill-3397/3403/3405/3408/3409 (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — verify-steps + evidence docs only; no DDL/DML; no package.json/ci.yml/locked-guard edits (Rule 17).
ROOT CAUSE: four guards asserted on shape (wrong surface / same-source parity / CI-internal checksum / commit-msg 1324), and 5 merged Lists PRs lacked an evidence trail despite prod-verified counts.
FIX: tighten one guard per issue via verify-steps/NNN to assert substance; backfill evidence for the 5 PRs without reverting; files: 4 verify-steps + 5 PR evidence docs.
GUARD: scripts/verify-steps/NNN-verify-guard-substance.mjs (one per tightened guard)
LIVE PROOF: <each guard fail-on-bug/pass-on-fix + 5 PRs evidenced + still merged — or UNVERIFIED: guard paths/PR bodies not read>
REMAINING: do NOT revert #3397/#3403/#3405/#3408/#3409 (prod-verified counts); if Step-1 finds a PR whose count no longer reconciles, open a new block (tracker + future block id) — never silently revert.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
