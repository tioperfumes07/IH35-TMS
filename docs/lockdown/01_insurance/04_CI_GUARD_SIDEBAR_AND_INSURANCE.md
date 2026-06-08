# CI GUARD — prevent silent sidebar/insurance drift (add to CI)

## Guard A — sidebar contract (scripts/verify-sidebar-contract.mjs)
Assert SIDEBAR_DEFAULT_ORDER (source of truth: SIDEBAR_ITEM_IDS in sidebar-config.ts):
- length === 21
- item at index 7 has id === 'insurance' (label 'INSURANCE')
- item at index 9 has id === 'factoring'
- the full ordered id list equals exactly:
  ["home","maintenance","fuel","dispatch","drivers","safety","accounting","insurance","bank","factoring","customers","vendors","lists","reports","legal","docs","eld","form_425","drv_app","users","help"]
Fail build with a clear message naming the missing/moved id. This is what was absent — Insurance
shipped but the sidebar entry silently never landed, and nothing caught it.

## Guard B — insurance creator contract (scripts/verify-insurance-creator.mjs OR a vitest)
Assert in the policy-creator module/spec:
- "+ Create policy" string present; NO "+ New policy" / "+ Add policy" anywhere (vocabulary lock).
- creator computes a per-vehicle-per-month cost field (cost_per_vehicle / cost_per_unit) — referenced in code.
- allocation methods include 'equal_split' (default), 'pro_rata', 'weighted'.
- create path enqueues N bills where N === term_months (idempotency_key present per bill).

## Guard C — vocabulary (extend existing verify if present)
Repo-wide: no user-facing "+ New" or "+ Add" button labels (locked G7).

Every guard must FAIL the PR (not warn). Per NEVER-DEFER: if a guard surfaces a gap, fix it in this PR.
