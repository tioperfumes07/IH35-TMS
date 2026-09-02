AGENT-1 · Block <N> of <M> — PHASE <tracker-phase> / TASK <set-from-latest-IH35TMSMASTERTRACKER-before-dispatch> — Insurance: sidebar slot 8 + creator lock + docs + guards
RBC TARGET: branch feat/insurance-sidebar-and-creator-lock  (open PR after first push)

[!] TASK ID: do NOT dispatch until a real tracker task-ID is set in this header. Add the tracker row first if new. Malformed header = recall.

STANDING ORDERS: foreground only, no subagents; no retries — STOP, paste exact error; live updates every 5 min with CST/Laredo timestamp + real measured data, no guesses; confirm worktree pwd, git status, log, rev-parse; show diff --staged --stat before commit; stop on unexpected.

LOCKS (read first):
- ADDITIVE ONLY. Never delete/remove/reorder existing sidebar items, modules, routes, fields. Insurance is INSERTED at index 8; everything else shifts down by one, nothing removed.
- Vocabulary: "+ Create policy" only. NEVER "+ New" / "+ Add".
- ARCHIVE never DELETE (soft-delete via is_active).
- All financial flows (bills) go through EXISTING accounting service functions + outbox. NO new financial code.
- RESPOND-BEFORE-CODE (CURSOR-PERMANENT-RULES RULE 6): before writing code, reply with: (a) inventory of what already exists for Insurance (routes, components, insurance schema tables, policy creator) vs the locked spec below; (b) the approved-screens / blueprint sections you are matching; (c) any deltas; (d) any NEW spec. Wait for GO.

LANE LOCK — forbidden files for this block unless listed in allowed_files (one writer per magnet file):
- Do NOT touch: verify-pre-commit.mjs, verify-architectural-design.ts (EXCEPT the single module-count number 21->22), App.tsx routing beyond adding insurance route if missing, accounting/index.ts, backend index.ts, AccountingSubNav.tsx.
- sidebar-config.ts: THIS block is the sole writer this cycle.

SCOPE (all additive):
1. sidebar-config.ts — insert insurance entry at index 8 of SIDEBAR_DEFAULT_ORDER (id 'insurance', label 'INSURANCE', icon shield/umbrella, route /insurance). Add to SIDEBAR_ROLE_ORDER for owner/office_admin/accountant/safety. Preserve icons/highlight/badges.
2. verify-architectural-design.ts — bump expected module count 21 -> 22.
3. Insurance landing /insurance — ensure tabs Policies · Claims · Lawsuits · Coverage gaps · Carriers · Settings; KPI row (Active policies · Units covered · Premium/mo · Expiring <60d · Open claims); Policies table cols: Policy # · Carrier·type · Units · Coverage · Term · Premium/mo · Status. Add only what is missing.
4. Create-policy 4-step wizard (additive to existing if present):
   - Step 2 multi-vehicle selector: search by unit/VIN/driver; chips All·Tractors·Trailers·Reefer·TRK·TRANSP; live "N of fleet selected"; block proceed at 0.
   - Step 3: total premium + term + allocation (equal_split DEFAULT, pro_rata, weighted). DISPLAY cost per vehicle insured per month; recompute on premium/term/vehicle change.
   - Step 4: auto-generated monthly bill schedule (N=term), each=premium/term, per-unit-per-month shown; action "Create policy + schedule N bills".
   - Create = ONE atomic tx: insurance.policies(1) + insurance.policy_units(N) + scheduled bills(term) via existing accounting service + outbox; idempotency_key per bill; audit rows. RLS on operating_company_id.
5. Docs: append the dated section to UNIFIED_BLUEPRINT_ADDITIONS.md (see 01_INSURANCE_BLUEPRINT_ADDITION.md) and the sidebar table to IH35_ARCHITECTURAL_DESIGN.md (see 02_SIDEBAR_ARCH_UPDATE.md).
6. CI guards: add verify-sidebar-contract.mjs + insurance-creator contract (see 04_CI_GUARD_SIDEBAR_AND_INSURANCE.md). Guards FAIL the PR on drift. Per NEVER-DEFER, fix any gap surfaced here in THIS PR.

GATES (Standing Order #16 v2): build:backend EMIT, frontend tsc -b, verify:arch-design, full backend vitest for runtime/creator paths, migrations self-contained with explicit GRANTs + drift-capture (CI is the fresh-DB step). verify+commit+push as ONE step.

ACCEPTANCE:
- Sidebar = 22 items, Insurance at index 8, nothing else removed/reordered (Guard A green).
- "+ Create policy" only; cost-per-vehicle shown + recomputes; equal_split default; 0-vehicle blocks (Guard B green).
- Create writes policy + N units + term bills in one tx, idempotent, audit, outbox.
- Docs updated; module count 22; all gates green.

PAUSE after RESPOND-BEFORE-CODE for GO. PAUSE again before merge — Claude verifies live (sidebar index 8 in prod, creator behavior) before GO.
