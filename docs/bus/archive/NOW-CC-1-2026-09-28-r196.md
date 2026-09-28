# ROUND 195 + 195.1 — QBO write-back blocked permanently; receivable lag zeroed for factored loads — CC-1 — 2026-09-28 18:04Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r195.md`. PRs #23038, #23039, #23041, #23043 — all merged. DB migration already applied live; feature flag re-enabled live. Deployed and re-measured, not just merged.

## ROUND 195 — QBO write-back flags blocked permanently. DONE.
Measured live before writing anything: 92 active `lib.feature_flags`, 19 QBO-named. 17 of those carry
a `lib.feature_flag_overrides` row with `enabled=false` for all three entities, all set 2026-08-16 by
the owner — pinned off at wiring time, never touched since. The other 2
(`QBO_RECONCILE_UI_ENABLED`, `TMS_QBO_RECON_UI_ENABLED`) are read-only reconciliation-surface UI
flags, currently `true` for all three entities, and correctly stay OUT of the blocked list.

Built (migration 202614530000, applied live on prod, `RESET ROLE` first — the known pooled-connection
role-downgrade landmine hit on the first attempt, `permission denied for schema catalogs`, fixed):
- `catalogs.blocked_feature_flags` — named, auditable blocklist. `ih35_app` gets SELECT only, no
  write grant at all — "never a code path" enforced twice (grant boundary + trigger).
- `lib.refuse_blocked_flag_enable()` — BEFORE INSERT/UPDATE trigger on `lib.feature_flag_overrides`
  (the real enforcement surface: all 17 keys are already `POSTING_FLAG_KEYS`/`PER_ENTITY_ONLY_FLAG_KEYS`
  in `feature-flags/service.ts`, so `default_enabled`/`rollout_pct` are never consulted for them —
  documented plainly rather than implying a risk the code doesn't have) and BEFORE UPDATE on
  `lib.feature_flags` (belt-and-suspenders, per the owner's explicit ask). No `current_user`
  exemption — covers every seat, script, and the owner's own direct SQL.
- Seeded all 17 keys. 3 named hard-core (`QBO_JE_PUSH_ENABLED`, `QBO_ENTITY_PUSH_ENABLED`,
  `VOID_QBO_MIRROR_ENABLED`) cite law doc §2 "QuickBooks write-back: NEVER"; 14 are QBO-mirror-to-TMS
  pull/projection flags the order also covers, without distinguishing direction — built as ordered.
- Guard `verify-qbo-flags-blocked.mjs` (verify-step 11699), wired into `money-pr-local-gate.mjs`.

**Live proof — the failed enable attempt (exact text):**
```
QBO_FLAG_PERMANENTLY_BLOCKED: QBO_JE_PUSH_ENABLED cannot be enabled. Push journal entries into
QuickBooks. QBO write-back is the hard core the owner named.. Ref: ROUND 195 (2026-09-28); law doc
section 2 QuickBooks write-back: NEVER. Blocked 2026-09-28 17:52:37.504724+00 by
e4117991-d2c0-406d-8cda-74e98d95bccd. Unblocking requires DELETING catalogs.blocked_feature_flags
WHERE flag_key = 'QBO_JE_PUSH_ENABLED' -- an explicit, logged act, never a code path or UI toggle.
```
Also live-verified: `UPDATE ... enabled=true` on an existing override raises the same way; `UPDATE
lib.feature_flags SET default_enabled=true` raises the same way; `QBO_RECONCILE_UI_ENABLED` (not
blocked) can still be written — the block doesn't over-reach. Caught and fixed one cosmetic bug in
my own first pass: `RAISE EXCEPTION` doesn't support `%L` like `format()` does — fixed to bare `%`
with literal quotes before merging.

**Guard PASS (live, after fix):**
```
verify-qbo-flags-blocked: PASS — all 17 QBO flags blocked, resolve FALSE for every entity, and an
attempted enable raises.
```

## ROUND 195.1 — receivable lag to zero for factored loads. DONE.
Owner law (verbatim): "THE DELIVERY DATE OF THE LOAD IS THE PROJECTED INCOME DATE. Faro buys the
invoice at delivery. There is no lag." Supersedes the 2026-06-17 lock in `receivable-lag.ts` ("the
lag is NEVER zero") — retired, not re-raised.

- `FACTORING_ADVANCE_DAYS`: 1 → 0. Header comment rewritten.
- `DEFAULT_NET_TERMS_DAYS` (non-factored customers) — **unchanged**, confirmed by inspection: the
  non-factored branch of `receivableLagDays()` never touches the factoring constant.
- `projectedCashDateSql` — no logic change needed; its CASE expression already multiplies
  `FACTORING_ADVANCE_DAYS` by the day interval only on the factored branch, so lag=0 resolves to the
  raw delivery date automatically. Confirmed by inspection, then proven live (below).
- Test suite updated: "never returns zero" → "non-factored never zero, factored always zero." All 8
  tests pass.
- Guard `verify-projected-cash-date-equals-delivery.mjs` (verify-step 11703), wired into the money
  gate. Scoped to **factored** customers only — a non-factored proforma's real net terms are
  unaffected by this ruling; the guard reports (never fails on) any non-factored open proforma it
  finds, so it stays correct if that ever changes. Live-checked: all 14 open USMCA proformas are
  factored today, so the owner's literal "every open USMCA proforma" holds in practice.
- `CASH_FOLLOWS_ETA_ENABLED` re-enabled for USMCA live (a DB action, not repo-tracked) after the code
  merged, then re-measured — per "merged is not done; deployed and re-measured is done."

**Live proof — real `getDailyPrediction()` calls, before merge (both flag states) and after
re-enabling the real flag (deployed code, real resolver):**
```
Before merge, both states compared directly:
  date=2026-09-28 cashFollowsEta=false: 10 income line(s), $46825.00
  date=2026-09-28 cashFollowsEta=true:  10 income line(s), $46825.00
  date=2026-09-29 cashFollowsEta=false: 0 income line(s), $0.00
  date=2026-09-29 cashFollowsEta=true:  0 income line(s), $0.00

After merge + flag re-enabled, real resolver:
  CASH_FOLLOWS_ETA_ENABLED resolves: true
  date=2026-09-28 (real flag state): 10 income line(s), $46825.00
  date=2026-09-29 (real flag state): 0 income line(s), $0.00
```
Flag ON now produces the identical bucket as flag OFF — zero shift, to the cent, both before and
after the real re-enable. (This session's live count, 10 loads / $46,825.00, differs from the
order's cited 9 loads / $40,575.00 — expected on a live system measured at a different moment; the
zero-shift property is what was reproduced and what matters.)

**Guard PASS (live, after re-enable):**
```
verify-projected-cash-date-equals-delivery: PASS — 14 factored open USMCA proforma(s) have
projected_cash_date = delivery date, zero variance.
```

**Self-caught testing mistake, corrected before reporting:** my first post-merge re-measurement
accidentally checked out a stale local `main` git ref (not `origin/main`) into the worktree, which
briefly ran the OLD pre-fix code (`FACTORING_ADVANCE_DAYS = 1`) and produced a false "still shifting"
result. Caught by checking `git log` on the ref actually used, fixed by checking out `origin/main`
explicitly, and re-run — the real result is the zero-shift proof above. Not a code regression; a
scratch-script git-ref mistake on my part, caught before it was reported as a finding.

## What's next
ROUND 195 and 195.1 are both closed. No remaining task from either order. Standing by.

Tier used: mid (live-data investigation, two small surgical DB/code changes, two new guards — no
new GL/business math authored, both changes reuse or correct existing constants/logic).
