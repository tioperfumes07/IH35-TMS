<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F20 — F20 · count-spec misses safety/accounting catalogs
**FINDING:** F20 (P2) · **Lane:** NON-FINANCIAL · **Module:** lists (count-spec coverage).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Catalog counts) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§count-spec) · IH35_ARCHITECTURAL_DESIGN.md (module lists) · docs/lockdown/00_LOCKED_DECISIONS.md (accounting catalogs counted read-only; no GL math).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png, 10Reports.png.
Tab count check (Rule 05): the count-spec drives the ribbon (LST-F01) tiles · missing safety/accounting catalogs means missing/blank tiles · extending coverage aligns tiles to the designed set.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — coverage extension over existing catalogs.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The catalog count-spec (the declarative map of catalog→count query the ribbon/registry consume) omits safety and accounting catalogs, so those are uncounted (silent-missing). **Step 1 — reproduce (Rule 10, lucia):** read the current count-spec and diff it against the live catalog set:
```
# 1) current count-spec entries — read live
rg -n "countSpec|count_spec|catalog.*count" scripts/** app/**/lists/**   # not in backbone → verify live
# 2) safety/accounting catalogs that exist but are absent from the spec
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_schema IN ('catalogs','safety','accounting') ORDER BY 1,2;   -- confirm schema names live
ROLLBACK;
SQL
```
The count-spec location + the exact safety/accounting catalog set are NOT in the backbone → read live. Backbone-verified accounting catalog anchors: `catalogs.accounts` (1392), `catalogs.items` (236), `catalogs.expense_categories` (9).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each new count-spec entry maps to a canonical `catalogs.*`/`safety.*`/`accounting.*` table (confirm live) counted under GUC — NEVER a RETIRE table or QBO view (that was the LST-F01 bug).
2. Hub matrix: the count-spec is the source for ribbon tiles (LST-F01) and registry (LST-F18); each counted catalog links to `org.companies` where per-entity.
3. Cross-module (Rule 21 §1): extends counting into safety and accounting modules; each tile drills into its list.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite saved-search/count completeness — every managed list is counted; an incomplete count-spec produces blank/absent badges that read as “empty” when data exists (false-empty, a trust defect). Pairs with LST-F21 fail-loud.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — add spec entries; no removal, no data change. Enforce: each count computed under `operating_company_id` GUC where per-entity · targets canonical tables only · fail-loud on a missing table (LST-F21). Not financial (Rule 19 N/A — read-only counts, no GL).

## THE FIX (requirement-level; no invented unverified SQL)
Extend the count-spec to cover every safety and accounting catalog (from the Step-1 live diff), each entry a canonical-table `count(*)` under GUC, classified by opco VALUES+policy (per-entity vs global per LST-REGISTRY). Feed LST-F01 ribbon + LST-F18 registry from the same complete spec.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-count-spec-coverage.mjs + scripts/verify-steps/NNN-verify-count-spec-coverage.mjs. FAIL on pre-fix main (a live safety/accounting catalog table has no count-spec entry); PASS on the fix (every such catalog present in the spec, each pointing at a canonical non-null table). --selftest mutates REAL source to drop a safety/accounting entry, one case per assertion, and asserts the complete spec is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: count-spec includes all safety/accounting catalogs; ribbon tiles render their counts equal to the canonical per-entity queries (TRANSP and USMCA); guard wired; browser shows the tiles. OR "UNVERIFIED — count-spec location / catalog set not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F20
LANE: NON-FINANCIAL
DOD-A: PASS — each newly-counted catalog resolves to a live list (single active path).
DOD-B: N/A — spec extension, no create wizard.
DOD-C: PASS — each count entry FORWARD to canonical table + REVERSE row-resolvable; no memo/uuid-in-name.
DOD-D: N/A — no money object; read-only counts.
DOD-E: UNVERIFIED — count-spec location + safety/accounting catalog set confirmed live before freeze.
VERIFY-1: PASS — ribbon tiles for safety/accounting appear (chrome complete).
VERIFY-2: N/A — spec is not a picker.
VERIFY-3: PASS — count-spec→ribbon/registry→CANONICAL tables (never RETIRE/qbo view)→entity-scoped→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — per-entity counts scoped for TRANSP and USMCA; global catalogs counted globally per LST-REGISTRY; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — tile set matches design after extension (Rule 05); no invented tiles.
VERIFY-8: PASS — per-entity counts under correct GUC; security_invoker on any view; FORCE RLS.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: count-spec-safety, count-spec-accounting (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — count-spec is code/config; no DDL/DML.
ROOT CAUSE: the count-spec was authored for a subset (missing safety + accounting catalogs), so those tiles are uncounted/false-empty.
FIX: extend the count-spec to full safety/accounting coverage, each canonical + GUC-scoped, classified by opco VALUES; files: count-spec module.
GUARD: scripts/verify-steps/NNN-verify-count-spec-coverage.mjs
LIVE PROOF: <spec covers all + ribbon tiles match canonical counts + browser — or UNVERIFIED: spec/set unconfirmed>
REMAINING: coordinate with LST-F01 (ribbon consumer), LST-F21 (fail-loud), LST-F18 (registry) — same authoritative set.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
