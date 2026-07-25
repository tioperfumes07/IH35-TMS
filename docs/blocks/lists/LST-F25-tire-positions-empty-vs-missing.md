<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F25 — F25 · tire-positions missing-table indistinguishable from empty
**FINDING:** F25 (P3) · **Lane:** NON-FINANCIAL · **Module:** lists/maintenance (tire_positions count).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Tire positions) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§tire catalog) · IH35_ARCHITECTURAL_DESIGN.md (module maintenance) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A).
Approved screens reviewed: docs/approved-screens/2Maintenance.png.
Tab count check (Rule 05): no tab change — corrects the count-spec’s handling of one catalog.
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25 for existence] / [AUDIT — RE-VERIFY LIVE for count-spec code]
The count-spec cannot distinguish `catalogs.tire_positions` being MISSING from being EMPTY (both render 0) — the LST-F21 swallow-NULL mechanism applied to this catalog. **Backbone fact (GUARD-VERIFIED 2026-07-25):** `catalogs.tire_positions` EXISTS, has NO opco (GLOBAL), RLS forced with a global-read policy — so it is `companyScoped:false` and counts globally, NOT per-entity. Therefore its correct count is a GLOBAL `count(*)`, and 0 must mean “exists-but-empty”, never “missing”. **Step 1 — reproduce (Rule 10, lucia):** confirm existence + how the count-spec treats it:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('catalogs.tire_positions') AS exists_nonnull, count(*) AS global_count FROM catalogs.tire_positions;  -- backbone: EXISTS, global
ROLLBACK;
SQL
rg -n "tire_positions|to_regclass" scripts/** app/**/lists/**   # count-spec handling → verify live
```

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.tire_positions')` (backbone-verified non-null, GLOBAL/no opco) — counted globally; never coerced NULL→0. NEVER a RETIRE table.
2. Hub matrix: tire_positions is GLOBAL (no `org.companies` link — classify by opco VALUES: none) → not entity-scoped; consumed by maintenance tire tracking.
3. Cross-module (Rule 21 §1): referenced by maintenance tire records; count shown honestly (real global count or explicit missing state, never false 0).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Our Full Audit Law + NetSuite no-silent-failure — a count must distinguish “no table” from “no rows”. For a GLOBAL catalog the count is entity-independent; misclassifying it as per-entity (or as missing) would be a false signal.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/hardening only — teach the count-spec that tire_positions EXISTS + is GLOBAL; no data change. Enforce: global-read policy respected · fail-loud on true-missing (LST-F21) · production never serves a false 0. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
In the count-spec, mark `catalogs.tire_positions` as an existing GLOBAL catalog (companyScoped:false, LST-REGISTRY exclusion), count it with a global `count(*)`, and rely on the LST-F21 fail-loud path so a genuinely missing table errors instead of showing 0. Result: empty (0) and missing (error) are distinguishable, and the count is not wrongly scoped by opco.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-tire-positions-count.mjs + scripts/verify-steps/NNN-verify-tire-positions-count.mjs. FAIL on pre-fix main (asserts tire_positions is counted via a swallow-NULL path OR scoped by opco despite having none); PASS on the fix (global count + fail-loud on true-missing + classified companyScoped:false). --selftest mutates REAL source to opco-scope it / swallow NULL, one case per assertion, and asserts the correct global shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: tire_positions global count renders; the same value for TRANSP and USMCA sessions (global, not per-entity); a simulated missing target errors (not 0); guard wired. OR "UNVERIFIED — count-spec handling not yet read; Step-1 pending" (existence already backbone-verified).

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F25
LANE: NON-FINANCIAL
DOD-A: PASS — tire_positions catalog resolves to a real global table (single path).
DOD-B: N/A — count-spec handling, no create wizard.
DOD-C: PASS — count resolves the canonical table; global (no opco link by design); no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: PASS (existence) — backbone GUARD-VERIFIED tire_positions EXISTS/global; UNVERIFIED only the count-spec code path (Step-1) before freeze.
VERIFY-1: PASS — ribbon shows honest global count / distinct missing state.
VERIFY-2: N/A — not a picker.
VERIFY-3: PASS — count-spec→CANONICAL catalogs.tire_positions (global)→fail-loud on missing→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — GLOBAL by design: same count for TRANSP and USMCA; correctly NOT opco-scoped; no false cross-entity difference.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — no tab change (Rule 05).
VERIFY-8: PASS — global-read RLS policy respected; no incorrect opco filter applied.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: tire-positions-count-classify (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A — count-spec/classification code only; no DDL/DML (table already exists per backbone).
ROOT CAUSE: the count-spec treated tire_positions via the swallow-NULL path and/or as opco-scoped, so missing/empty and global/per-entity were conflated.
FIX: classify tire_positions as existing GLOBAL (companyScoped:false), count globally, fail-loud on true-missing (LST-F21); files: count-spec + LST-REGISTRY exclusion.
GUARD: scripts/verify-steps/NNN-verify-tire-positions-count.mjs
LIVE PROOF: <global count renders + same across entities + missing→error — or UNVERIFIED: count-spec code not read>
REMAINING: none defensible; lands with LST-F21 (fail-loud) and LST-REGISTRY (exclusion list).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
