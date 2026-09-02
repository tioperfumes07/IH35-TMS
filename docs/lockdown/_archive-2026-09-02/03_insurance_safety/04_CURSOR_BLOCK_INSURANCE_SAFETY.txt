AGENT-1 · Block <N> of <M> — PHASE <tracker-phase> / TASK <set-from-latest-IH35TMSMASTERTRACKER-before-dispatch> — Insurance<->Safety: per-unit coverage, values, deductible, gaps
RBC TARGET: branch feat/insurance-safety-coverage-link  (open PR after first push)
SEQUENCING: runs AFTER the Insurance sidebar+creator block (feat/insurance-sidebar-and-creator-lock) is merged.

[!] TASK ID: set from latest tracker before dispatch. Add tracker row if new. Malformed header = recall.

STANDING ORDERS: foreground only, no subagents; no retries — STOP, paste exact error; live updates every 5 min CST/Laredo + real measured data; confirm worktree pwd, git status, log, rev-parse; show diff --staged --stat before commit; stop on unexpected.

LOCKS:
- ADDITIVE ONLY. New table + columns only. Remove/rename nothing.
- Insurance OWNS coverage data; Safety READS + flags. Safety never writes coverage.
- Existing services only; audit on writes; ARCHIVE never DELETE; RLS on operating_company_id.
- RESPOND-BEFORE-CODE (RULE 6): inventory insurance.policies / policy_units / safety unit profile as-built vs spec; deltas; NEW spec. Wait for GO.

LANE LOCK: migrations one agent at a time, sequential. Do NOT edit shared registries (verify-pre-commit.mjs, verify-architectural-design.ts beyond needed, App.tsx, accounting/index.ts, backend index.ts) except adding the new endpoints/routes for the coverage data.

SCOPE (additive):
1. Migration: insurance.policy_unit_coverages (policy_unit_uuid FK, coverage_type IN (liability,physical_damage,cargo,workers_comp,other), limit_amount, deductible_amount, insured_value, effective, expires). Self-contained: explicit GRANTs + drift-capture. RLS scoped.
2. Insurance creator: per selected unit capture coverage_type(s), limit, deductible, insured_value. Policies/unit detail display them. Coverage gaps tab lists missing/lapsed.
3. Safety unit/asset profile: add INSURANCE panel (read-only) — insured? carrier/policy, coverage types held, limit per type, deductible per type, insured value, effective->expires.
4. Safety Coverage gaps view: compute gaps =
   - active unit (master_data.units.status active) AND no active policy_unit for a required coverage type on date -> ALERT gap.
   - unit OOS/in_shop/sold/retired AND uninsured -> show as expected ("Uninsured - OOS/in shop since <date>"), not an alert.
   - policy expired / expiring <60d -> lapse risk.
5. CI guard: assert policy_unit_coverages exists + RLS on; assert Safety insurance panel reads insurance source (no duplicate coverage store); assert gap logic distinguishes active-uninsured vs OOS/in-shop-uninsured (unit test).

GATES (Std Order #16 v2): build:backend EMIT, frontend tsc -b, verify:arch-design, full backend vitest for gap-logic + coverage reads, migration self-contained w/ GRANTs + drift-capture (CI is fresh-DB step). verify+commit+push as ONE step.

ACCEPTANCE: coverage stored per unit/policy; Insurance captures + shows values; Safety shows insurance panel + gaps; active-uninsured alerts, OOS/in-shop-uninsured expected; nothing removed; guards green.

PAUSE after RESPOND-BEFORE-CODE for GO. PAUSE before merge — Claude verifies live (Safety insurance panel + gaps reading insurance source) before GO.
