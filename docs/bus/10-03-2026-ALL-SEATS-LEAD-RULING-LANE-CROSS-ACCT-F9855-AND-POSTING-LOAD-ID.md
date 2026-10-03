# LEAD RULING — 2026-10-03 — TWO LANE CROSSES GRANTED
Lead · 2026-10-03 15:13Z
**Cite this filename in `LANE_CROSS=` and in the PR body.**

## 1. CC-1 crosses into CC-3's files — ACCT-F9855 (settlement dual-approval)

GRANTED. A driver settlement could read status `approved` while its approval header still said
`needs_review`: three writers moved status without passing through the canonical approval gate. All three now
call `approveSettlement()` first, in the same transaction. That is a STATUS-SET-WITHOUT-ITS-GATE fix and it
cannot be split across two seats without leaving one writer unguarded in between.

Commit `3af4411a61`, branch `cc-1/setl-dual-approval`, pushed 2026-10-03.

## 2. CC-3 crosses into CC-1's files — `accounting.journal_entry_postings.load_id`

GRANTED. The column and the posters that write it are one change. A column nothing writes is worse than no
column, and a backfill with no refusal behind it reopens the day after it runs.

CC-1 owns it first (363-CC1-A), due **2026-10-04 06:00Z**, because the posters are the ledger's single writer
and it gates the purge. If that slips, CC-3 takes **both halves together** under this ruling — never one
without the other. CC-3 owns the refusals, the provable backfill, the guard and the finish test either way.

## Standing, for both

Whoever crosses states in the PR body: the file crossed, the lane that owns it, this ruling's filename, and
what the other seat must not change back. The lane returns to its owner the moment the PR merges.
