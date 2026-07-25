<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F19 — F19 · deprecated driver subcatalogs (Sunset 2026-09-03)
**FINDING:** F19 (P3) · **Lane:** NON-FINANCIAL · **Module:** lists/driver (deprecated subcatalogs).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Driver subcatalogs) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§deprecation policy) · IH35_ARCHITECTURAL_DESIGN.md (module driver) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A) · deprecation note: Sunset 2026-09-03.
Approved screens reviewed: docs/approved-screens/7Drivers.png.
Tab count check (Rule 05): design marks these driver subcatalogs deprecated (sunset 2026-09-03) but still reachable until then · this block archives (flags deprecated) while keeping them reachable · leaf count unchanged until sunset.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — deprecation, not new build.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Several driver subcatalogs are deprecated with a Sunset date of 2026-09-03 but must remain reachable and non-deleted until then (Rule 07: archive+keep reachable, never delete). **Step 1 — reproduce (Rule 10, lucia):** identify the exact deprecated subcatalogs + confirm their rows are intact:
```
# 1) which driver subcatalogs are flagged deprecated/sunset 2026-09-03 — read live
rg -n "deprecat|sunset|2026-09-03" app/**/lists/driver/** config/**catalog*   # not in backbone → verify live
# 2) confirm rows exist (do NOT delete) for each named subcatalog
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
-- for each subcatalog table identified above: SELECT to_regclass(...) , count(*)
ROLLBACK;
SQL
```
The exact subcatalog names + current deprecation flag state are NOT in the backbone → read live; do NOT enumerate them from memory.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the identified deprecated `catalogs.*` driver subcatalog tables (confirm live) — additive `deprecated_at`/`sunset_on` flag only; NEVER DROP/DELETE, NEVER a RETIRE table.
2. Hub matrix: each links BOTH-WAY to `org.companies` (if per-entity) and to `mdata.drivers` where referenced — reverse: a driver record still resolves any historical subcatalog value.
3. Cross-module (Rule 21 §1): deprecated leaves stay reachable (greyed/badged “deprecated — sunset 2026-09-03”) so historical drill-through works both ways until sunset.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite record deprecation / QuickBooks make-inactive — deprecated reference data is flagged and hidden from new use but retained and reachable for historical integrity; hard-deleting before sunset breaks audit history. Append-only/void-not-delete.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/archival ONLY — add a deprecation flag + sunset badge; keep routes reachable; NO DROP/DELETE/TRUNCATE before or at sunset without a separate owner-gated retirement block. Enforce: RLS retained · append-only audit on the flag write · display IDs unchanged. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Flag each deprecated driver subcatalog as deprecated with `sunset_on = 2026-09-03`, badge it in the hub as deprecated, block NEW writes/selections (existing rows read-only + reachable), and record the sunset in the tracker with a future owner-gated retirement block id. No data removed.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-driver-subcatalogs-deprecation.mjs + scripts/verify-steps/NNN-verify-driver-subcatalogs-deprecation.mjs. FAIL on pre-fix main (a deprecated subcatalog is either still writable as new OR has been made unreachable/deleted); PASS on the fix (flagged deprecated + reachable + read-only + rows intact). --selftest mutates REAL source to un-reach / hard-delete a subcatalog, one case per assertion, and asserts the archive-and-reachable shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: each deprecated subcatalog shows the deprecated/sunset badge, is reachable, blocks new writes, rows unchanged (count equals pre-fix) for TRANSP and USMCA; guard wired; browser drill-through works. OR "UNVERIFIED — deprecated subcatalog set not yet enumerated; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F19
LANE: NON-FINANCIAL
DOD-A: PASS — deprecated leaves remain reachable (single active read path, badged); no deletion, no broken twin.
DOD-B: N/A — new writes blocked; no create wizard change beyond disabling.
DOD-C: PASS — historical subcatalog values still resolve FORWARD+REVERSE from driver records; no data severed.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — the deprecated subcatalog set must be enumerated live before freeze.
VERIFY-1: PASS — hub chrome shows deprecated badge; no chrome removed.
VERIFY-2: N/A — new selection disabled; historical picker read-only.
VERIFY-3: PASS — nav→deprecated leaf→route→CANONICAL catalogs.* (read-only)→entity-scoped→flags honest (deprecated).
VERIFY-4: N/A — no new claim/WO/expense chain.
VERIFY-5: PASS — per-entity subcatalogs scoped for TRANSP and USMCA; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — leaf count unchanged until sunset (Rule 05); badge added; design deprecation honored.
VERIFY-8: PASS — RLS retained + correct GUC + security_invoker + grants; no privilege change.
MODULE_PROGRESS: driver N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/driver.json after PR].
ITEMS_TOUCHED: driver-subcatalog-deprecation (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A for data — additive flag column only if `deprecated_at`/`sunset_on` absent (idempotent DO + IF NOT EXISTS, > 202607960000 distinct, FORCE RLS retained, no hardcoded UUID). NEVER a DROP/DELETE.
ROOT CAUSE: driver subcatalogs slated for 2026-09-03 sunset lacked a deprecation flag/badge and a reachable-but-read-only policy.
FIX: flag deprecated + sunset_on, badge in hub, block new writes, keep reachable + rows intact; files: driver subcatalog config/components + (conditional) flag migration + tracker retirement-block id.
GUARD: scripts/verify-steps/NNN-verify-driver-subcatalogs-deprecation.mjs
LIVE PROOF: <badged + reachable + rows intact + browser — or UNVERIFIED: set not enumerated>
REMAINING: physical retirement at/after 2026-09-03 is a separate owner-gated block (tracker + future block id); never auto-delete.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
