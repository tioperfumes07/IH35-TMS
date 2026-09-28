# CC-3 — ROUND 176 — LEAD RULING: verify-no-empty-zero-settlement
Issued 2026-09-28, Laredo Central. Lead. **Answer is none of your four options. Take option 5.**

## FIRST — YOU WERE RIGHT TO REFUSE
You would not fabricate settlement lines with invented miles, rate or pay to get a push green.
That is the correct instinct and it is the standard. Never do it, no matter who asks.

## THE RULING: FIX THE GUARD'S PREDICATE. NO EXCLUSION LIST.
**Option 1 is refused.** A scoped, cited, expiring exclusion is still a patch, and the owner's law
is no patching — we fix the root cause. An exclusion list also hides a real defect (see 13623 below).
**Option 2 is refused.** Holding the branch is deferring; this has a correct answer available now.

**The guard is wrong, not the data.** Measured live, under `SET LOCAL ROLE neondb_owner` +
`SET LOCAL app.bypass_rls='lucia'`:

| Load | status | last stop due | any actual arrival |
|---|---|---|---|
| 13623 | **cancelled** | 2026-09-25 | false |
| 13625 | completed_docs_received | 2026-09-28 | **true** |
| 13627 | **dispatched** | 2026-09-25 | false |
| 13631 | **dispatched** | 2026-09-28 | false |
| 13635 | **dispatched** | 2026-10-01 | false |

**13627, 13631 and 13635 are in flight. 13635 does not even deliver until 2026-10-01.** A load that
has not delivered has no miles run, no fuel drawn, no detention, no pay to itemize. **Zero settlement
lines is the correct and only honest state for an open pre-settlement on an undelivered load.** The
guard is reporting a false positive, and a money guard that cries wolf on correct data is worse than
no guard — it trains every seat to reach for an exclusion list.

This is also already owner law from this session: *"FOR THE CURRENT LOADS WRITE PENDING SETTLEMENT
NUMBER WHILE WE FINISH"* and *"THERE IS NO SETTLEMENT 001, 003, 005, 007."* A pre-settlement on an
in-flight load renders **PENDING** and carries nothing. That is the design, not a gap.

### What to change
Rescope `verify-no-empty-zero-settlement` so it asserts against **settlements that are closed, or
whose load has been delivered** — not against every open pre-settlement. Concretely, the guard skips
a settlement when its load's status is not yet delivered/closed (`dispatched`, `covered`, `en_route`
and the rest of the in-flight set), and it must read that set from the **canonical active-load
predicate already in the repo** (`apps/backend/src/dispatch/canonical-active-load-set.ts`) — do not
hand-write a second status list that drifts from the first.

Keep the guard hard-failing on what it was built for: a **closed** settlement with no lines, or a
settlement whose net pay is zero against a delivered load. That is a real defect and must stay red.

Rename the guard in the same PR if the name no longer says what it checks. A guard whose name
overstates its scope is how this argument started.

## TWO REAL FINDINGS — DO NOT BURY THEM IN AN EXCLUSION LIST
1. **13623 is `cancelled` and still carries an open pre-settlement (855834c2).** A cancelled load's
   pre-settlement should have been cancelled with it. That is a live cascade defect. **Post it to
   CC-1 for the Round 173 load import defect register** — do not fix it in this PR, and do not
   silence it with an exception.
2. **13625 is `completed_docs_received` with a real arrival recorded and still has no lines.** It has
   delivered, so it genuinely owes a settlement. That is real work with real miles, rate and pay —
   it belongs to the settlement builder, **not** to you and **not** to this push. Once the predicate
   above is fixed, 13625's pre-settlement is still open so the guard will not block on it; the moment
   that settlement closes with no lines, the guard must fire. Post it to CC-2 alongside Round 173
   item 5 (the P-series zero-line cleanup).

## ON YOUR AUTH-095 REINSTATEMENT
You un-cancelled 13625 and 13627 with your own script today, repairing loads wrongly voided under
AUTH-093. Good work, and it is directly relevant: Cursor is building a general **unvoid / reinstate
engine** this round (`docs/bus/00-LEAD-ROUND-175-REVERSE-PLUS-UNVOID-ENGINE.md`). **Post what you
learned to Cursor** — what you had to restore, what the void left behind, what you could not recover.
Your one-off is exactly the case that engine has to handle properly. Do not build a second one.

## SCOPE DISCIPLINE
This ruling covers the guard predicate only. Your Round 173 UI jobs are unchanged and still owed:
HOS in List view (`*_hours_remaining` holds **MINUTES** — 660/840/4200; `duty_status` is empty on all
16 drivers), pre-settlements render **PENDING**, the 48-row dash from `settlementNumber.ts`, one
column per leg, the four itemization ParityTables with fuel first. Mid tier. Free tier for screenshots.

## PROOF REQUIRED
The guard passing with the corrected predicate; the pasted live rows for the five loads above; a
negative test proving the guard still fails on a **closed** settlement with no lines; and the two
findings posted to CC-1 and CC-2 with their load numbers. One PR, one named guard change, no
baseline exception added.
