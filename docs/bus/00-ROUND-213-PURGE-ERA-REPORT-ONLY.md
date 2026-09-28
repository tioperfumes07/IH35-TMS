# ROUND 213 — verify-purge-era-closures-still-hold IS REPORT-ONLY
Owner ruling 2026-09-28. Effective immediately.

## OWNER'S WORDS
> "we are not closing books reconciling — we create the documents, match what is possible to match, we fix the app."
> "we have cash basis, but we report in accrual and cash like quickbooks."

## THE RULING
`scripts/verify-purge-era-closures-still-hold.mjs` is **REMOVED from the blocking gate**.
It becomes **REPORT-ONLY**. It still runs, still prints every arm and every number, every run.
Nothing is silenced. No baseline grows. No exclusion list is created. No arm is weakened.
It just stops blocking unrelated work.

## WHY
The guard's own header was written against the purge-era EMPTY book. That book is gone.
It now asserts a closed-books steady state against a system mid-build, and fires on normal
operating data:
- **arm 21** counts proforma as open A/R. Every dispatched load creates one under the owner's
  cash-flow law. Guaranteed red forever. $61,375 of the $114,335.
- **arm 39** fires on loads dispatched hours ago whose mileage isn't computed yet.
- **arm 31** fires on 4 expenses totalling $28.00.

A gate that blocks every seat over $28.00 and over projections working as designed is not
protecting the company. It is stopping the work that does.

## WHAT DOES NOT CHANGE — NON-NEGOTIABLE
Every other money guard stays a hard blocking gate. No baselines grow. No `--no-verify`.
No exclusion lists. Anyone reading this as licence to bypass a different guard is wrong.

## SEAT ROUTING
| Arm / work | Seat | Note |
|---|---|---|
| Unwire from money-pr-local-gate + arm 21 proforma exclusion | **Devin-B** | ONE PR. Then B1/B2/B4. |
| arm 39 mileage via app Google engine | **CC-3** | AFTER pre-settlement editor merge (ROUND 212). Sequence unchanged. |
| arm 31 four Check Creator test expenses ($28) | **Cursor** | Void via app path. AUTH-124. |
| Faro invoice 87 | **CC-1** | Unchanged. Still the P0. |

### arm 31 ids (Cursor)
- `a7671a67-6b8a-4282-901a-2fd6dd7991ca` $1.00
- `9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9` $1.00
- `7728cf89-6ca2-4819-b610-7a013e4dbd61` $1.00
- `f9c5b0e4-644c-4b03-b7c2-424d540ea65f` $25.00 Smithfield trace 2099

Three $1.00 rows and a draft-but-posted check, all from Check Creator.
Test records must never be written into USMCA.

### arm 21 (Devin-B only)
Ships the proforma exclusion only. The remaining $52,960 is NOT a defect to chase.
Owner reports both cash and accrual like QuickBooks. Question already answered. Stop raising it.

## CURSOR MUST NOT
- Steal Devin-B's gate unwire or arm 21 proforma exclusion
- Steal CC-3 mileage / pre-settlement editor sequence
- Steal CC-1 Faro 87
- Weaken any other money guard
