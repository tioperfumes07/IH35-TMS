# ROUND 197 — both answers, precisely — CC-1 — 2026-09-28 18:40Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r197.md`. PR #23046 closed unmerged, branch deleted, per "drop my branch, abandon it."

## Housekeeping
Closed PR #23046 (the Lead's `b019ad4425`) without merging and deleted the remote branch
`lead-r195-cashflow-delivery-date-is-income-date`. Comment posted on the PR citing the Lead's own
retraction (#23043 correct, theirs too broad — zeroed `DEFAULT_NET_TERMS_DAYS` for non-factored
customers too).

## a. CASH_FOLLOWS_ETA_ENABLED for USMCA — YES, true. Deployed SHA confirmed first.
- **Deployed SHA**: `0135e04dad9a23f00042c6bae2fc7be969e3ffef`, built 2026-09-28T18:38:20Z, branch
  `main`. Confirmed a descendant of the #23043 merge commit (`b05801bf4a`) — `gh api compare
  b05801bf4a...0135e04d` → `ahead_by: 6, behind_by: 0`. The fix is live in production, not just
  merged.
- **Flag**: already `enabled=true` for USMCA (I flipped it myself right after #23043 merged, at
  2026-09-28 18:03:24Z, and reported it in the ROUND 195+195.1 status report). Re-confirmed live
  just now — still `true`, unchanged.
- **Four-row projection, re-measured live just now, exact match:**
```
2026-09-25  1 load    $3,200.00
2026-09-28  9 loads  $40,575.00
2026-09-30  2 loads   $7,800.00
2026-10-01  2 loads   $9,800.00
```
Matches the order's cited figures to the cent.

## b. Active USMCA settlement lines with posting_account_id NULL after #23034 — 15, NOT 0.
Precise count, live, just now: **353 active lines total, 15 with `posting_account_id IS NULL`.**
Not zero — do not close this item as fully resolved, but it is not an open gap either. All 15 are
the same, already-named rows from #23034's own report: 13 `reimbursement` + 2 `deduction` lines with
`source_table`/`source_reference_id` both NULL — no upstream `driver_reimbursements` or
`driver_settlement_deductions` row exists for any of them (checked again, not re-guessed). They were
inserted this way by `settlement-creator.service.ts`'s bare-AlwaysTrack-digit path, which never
wires source linkage for these two line types. Forcing a generic account onto them would mean
guessing a reimbursement/deduction type that is nowhere recorded — the exact pattern the owner's
2026-09-10 ruling bans. The completeness guard (`verify-settlement-line-posting-account-complete.mjs`,
verify-step 11695) already encodes this as a named, non-failing exemption and PASSES live with
exactly these 15 named. Closing this item as "0 NULL" would be inaccurate; closing it as "332 of 347
resolvable rows resolved, 15 correctly unresolvable and named" is the accurate state, and that part
has not changed since #23034.

## What's next
Nothing outstanding from ROUND 197. Standing by.
