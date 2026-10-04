# CC-1 → Lead — AUTH-397-UNWIND: dry run pasted, one ruling needed before any write (2026-10-04 ~19:00Z)

**Precondition met.** Prod runs `a9aa921` (built 18:36Z). It contains ACCT-F397 (#25318, squash of 753d1b614d). Checked with `git merge-base --is-ancestor`.

**Engine defect found and fixed first (ACCT-F9978, #25360).**
- The purge engine's FK walk treated the posting self-FKs `reversal_of_line_id` / `reversed_by_line_id` as ownership.
- For the 61 entries it planned **366** lines, not 122. It pulled in the lines of the 122 entries each one chains to and kept those entries' headers.
- The printed balance came from the headers, so the over-reach did not show.
- Now: back-pointers are not walked. A line without its header, or a row outside the plan pointing in, is a BLOCKER, and APPLY refuses on any BLOCKER.
- Composite-FK false UNHANDLED reports (4,439 / 355 rows) are fixed.

## Dry run A — exactly your scope (`--scope=unwind397`, prod read-only)
```
PLAN: journal_entries 61 · journal_entry_postings 122 · transaction_source_links 122
LEDGER before DR 218234625 = CR 218234625, 0 unbalanced; removed DR 297763 = CR 297763
EFFECT: 2000 A/P -297663 · 9000 Ask My Accountant +297663 · 1000 BofA -100 (BANK) · 5400 +100
! BLOCKER journal_entry_postings.reversed_by_line_id: 122 lines in 61 entries OUTSIDE the plan point at a planned line
! BLOCKER journal_entries.reversed_by_je_id: 61 entries OUTSIDE the plan point at a planned entry
! BLOCKER bank 1000 -100 cents (ALLOW_BANK_EFFECT under the AUTH — named in AUTH-397-UNWIND)
```
**FINDING (a refusal, not worked around).** Each of the 61 is the reversal of a reversal (call the middle entry b). Every b-line still carries `reversed_by_line_id` pointing at its line in the 61, and every b header carries `reversed_by_je_id` pointing at its entry. Removing only the 61 needs an UPDATE of 122 posting back-pointers and 61 headers. Your order forbids that ("no UPDATE on a posting"), and the posting fact triggers refuse it.

Reversing the 61 is refused too: `posting_line_is_already_a_reversal` ×61, because a 4th level would result.

## Dry run B — the whole chain (`--scope=unwind397-chain`, prod read-only)
```
PLAN: journal_entries 183 (the 61 + the 61 they reversed + the 61 originals) · postings 366 · source links 122
LEDGER removed DR 893289 = CR 893289 (every entry balanced)
EFFECT: IDENTICAL to A — 2000 -297663 · 9000 +297663 · 1000 -100 · 5400 +100
BLOCKERS: only the $1.00 bank effect (covered by AUTH-397-UNWIND)
```
The originals are the orphaned GL you named, whose documents are gone (60 of 61), and each middle entry is a reversal of its original. Removing all three levels changes no balance beyond A. It also clears the orphans that ROUND 390 (b) requires removed.

## RULING NEEDED (one word)
- **CHAIN** (recommended): widen AUTH-397-UNWIND to the 183 entries / 366 lines of dry run B. Same GL effect, no posting UPDATE, no orphan left behind.
- **61-ONLY**: authorize clearing 122 `reversed_by_line_id` and 61 `reversed_by_je_id` back-pointers under the AUTH. That needs a new WORM arm (migration); it is not built.

On the ruling: fork rehearsal (APPLY then prove 0/0, on the fork) → paste → prod APPLY under the AUTH → re-measure 0/0 → paste.

## Also done
- **bed20058 deactivated** (prod, 19:00:31Z): `deactivated_at` set and the row kept. I verified first that the user is integration.owner@test.invalid. The test owner still has ONE active grant, **TRANSP** (`41e5b1ca`, since 06-02). It is untouched because TRANSP is frozen and outside your authorization; rule it if you want it off too.
