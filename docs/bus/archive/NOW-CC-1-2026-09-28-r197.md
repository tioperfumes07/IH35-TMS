# ROUND 196 — item 0 pushed+PR opened (conflict flagged, not resolved); items 1-3 already complete from ROUND 191 — CC-1 — 2026-09-28 18:25Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r196.md`. Item 0: PR #23046 open, unmerged (owner merges). Items 1-3: no new PR — already live from ROUND 191 (#23033/#23034/#23036), re-verified this round.

## Item 0 — pushed, PR opened, stopped. One conflict + one concern flagged, not resolved.
Found the Lead's commit in the separate clone `/Users/jorgemunoz/IH35-TMS-claude`
(`b019ad4425`, branch `lead-r195-cashflow-delivery-date-is-income-date`) — a real, local commit, not
on GitHub. Pushing directly from that clone hit `husky pre-push: branch:precheck-push FAIL
category=dirty` — that clone's working tree carries a large pile of pre-existing, unrelated
untracked Lead-workspace files (docs/bus/00-*.md notes, ops scripts, etc.), none of which are mine
to touch or clean up. Fetched the one commit into my own clean worktree instead and pushed from
there — no rewrite, no `--no-verify`, no disturbance to the Lead's checkout.

**PR #23046 opened, NOT merged** (per the order: "the owner merges"). It is unmodified —
commit `b019ad4425` pushed byte-for-byte.

**Two things flagged in the PR body, neither resolved (per "do not rewrite it, stop"):**
1. **It's `CONFLICTING`** (`gh pr view --json mergeable` → `CONFLICTING`, `mergeStateStatus: DIRTY`).
   Expected: ROUND 195.1 (already merged separately as PR #23043, commit `b05801bf4a`, currently live
   on `main`) touches the exact same lines in `receivable-lag.ts`/`receivable-lag.test.ts` from the
   same much-older common ancestor.
2. **A real correctness difference, not just a duplicate.** This commit's `receivableLagDays()`
   returns `0` for **every** input, including non-factored customers, and zeroes
   `DEFAULT_NET_TERMS_DAYS` (30 → 0). The owner's ruling ("Faro buys the invoice at delivery, no
   lag") is about factored loads — Faro is the factor. A non-factored customer's payment timing has
   nothing to do with Faro and should keep running on its own real net terms. My already-merged
   ROUND 195.1 scopes the zero-lag to factored loads only and leaves `DEFAULT_NET_TERMS_DAYS` at 30.
   Flagged in the PR description for the owner to see before merging; not fixed here, not argued
   further — the order said stop, so I stopped.

## Items 1-3 — settlement_lines posting_account_id / item_id / guard. Already done, from ROUND 191.
This is the same ask as ROUND 191 items 2-4, which I completed and merged (#23033 backfill,
#23034 guard-and-reconciliation write-up, #23036 status report) before this order arrived. Re-verified
live just now rather than redone — nothing has regressed:

```
line_type            total  with_posting_account_id  with_item_id
deadhead_pay          73    73                        39
deduction              7     5                         0
earnings              129   129                       100
escrow_contribution    72    72                         0
extra_pay              59    59                         0
reimbursement          13     0                         0
```
330 of 345 addressable rows have `posting_account_id` (same 15 sourceless reimbursement/deduction
rows as before — no upstream `driver_reimbursements`/`driver_settlement_deductions` record exists
for any of them; confirmed again, not re-guessed). `item_id` remains correctly NULL wherever
quantity/rate/unit are also NULL (the live check constraint requires it) — still expected state, not
a gap, per ROUND 191's own finding.

**Accrual tie — exact match, re-measured live:**
```
CLOSED   51 settlements   gross 80,608.41   deductions 5,243.21   net 75,629.80
OPEN     13 pre-settlements  gross 13,867.93   (was 12/$13,867.93 in the order — one more
                                                 opened since, gross unchanged)
```
Matches the order's own cited CLOSED figures to the cent. `driver_settlements.gross_pay/
deductions_total/net_pay` are the header fields the backfill never touches (it only writes
`posting_account_id`), so this reconciliation was never at risk from that write.

**Guard re-run live, fresh:**
```
verify-settlement-line-posting-account-complete: 15 known, non-failing gap(s) — [named, unchanged]
verify-settlement-line-posting-account-complete: PASS — every CLOSED settlement's active line has
posting_account_id, except 15 named, sourceless gap(s) above (not guessed, per owner 2026-09-10 ruling).
```
Already wired into `money-pr-local-gate.mjs` (verify-step 11695) since ROUND 191. No new PR needed.

## What's next
Item 0: waiting on the owner to resolve the conflict and decide between the two versions (or merge
mine, already live) before merging #23046. Items 1-3: closed, nothing outstanding. Standing by.

Tier used: mid (git forensics across a separate clone, live re-verification, no new code authored
for items 1-3).
