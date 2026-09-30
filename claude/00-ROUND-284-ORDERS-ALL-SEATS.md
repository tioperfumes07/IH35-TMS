# ROUND 284 — ORDERS, ALL SEATS
# Claude Lead · 09-30-2026 · Obey 00-SEAT-CONTRACT.md. Cite the number.
# The canonical 17 guards live in 00-ROUND-282-CANONICAL-GUARDS-AND-VOID-CONSTRAINT.md.
# ANY 17 named in chat that differs from that file is a paraphrase and does NOT govern.

## 284.1 — CC-1 — the $166,868.94 plug: HAND OFF, DO NOT PROCEED. Answer is (a).
You root-caused it right and stopped in the right place. Dr 1000 / Cr 1090 as one aggregate manual
JE is exactly what the owner's rule forbids: money moves by document or categorization, never a JE,
never an aggregate standing in for real deposits. banking.*/factoring.* is CC-2's lane.
Deliver to CC-2, then stop:
1. The 12 bank_transaction ids with date, amount_cents, description.
2. JEs ACCT-F20260925i and j with full line detail.
3. Your arithmetic: 191,929.68 vs 166,868.94. State the 25,060.74 difference and say plainly
   whether you know what it is. Do NOT pick a subset of the 12 that adds to 166,868.94 — that is
   plugging with extra steps.
Do not reverse the JE, match anything, or touch banking.*.
Your next items are 282.1 (owner APPROVED the apply — deferred to COMMIT, rehearsed against a real
282.4-shaped transaction, no VALIDATE of the legacy 1,065) and 282.2. 282.2 lands BEFORE 282.4.

## 284.2 — CC-2 — you receive the plug. This is your lane.
1. Match each of the 12 Faro wire-ins INDIVIDUALLY through the suggestion engine. Owner law: only
   100% identical gets categorized. No batch, no automatch, no bulk accept on these 12.
2. Explain the 25,060.74 delta BEFORE step 3.
3. Then reverse ACCT-F20260925i and j. Never delete. Reversal dated the reversal date, linked both
   ways, original untouched at full amount.
4. Prove: 1090 reads 0, trial balance balances. Paste both.
This does NOT release AUTH-140 and does NOT start 282.4. Run it now, in parallel.

## 284.3 — CC-3 — engine_state is wrong at INGEST, not in the UI.
Measured live: 231 fresh telematics.vehicle_locations pings carry engine_state='unknown', 171 of
them MOVING up to 76.1 mph, against only 166 reporting 'on'. Every idle/off ping had speed 0.0.
a. Prove from the raw provider payload which it is: provider actually sent 'unknown' / our default
   for an absent field / a failed mapping of a value we don't recognize. Paste one raw payload for
   a moving-but-unknown ping next to the row we stored. No guessing between the three.
b. Fix at ingest. Map what the provider sends. If the field is absent, store NULL — 'unknown' and
   'the provider did not say' are not the same thing, and one of them is a lie in a column.
c. Normalize at ingest, never at read. Paste engine_state grouped counts, last 24h, before/after.
DO NOT touch TruckLineBoard.tsx — Lead owns it this round and it is already committed.

## 284.4 — CURSOR — 283 is closed and you closed it.
8915dd1d81 beat my fix and mine is withdrawn. I added a third scope value "all"; you made the
non-Dispatch surfaces issue two explicit scoped calls and merge. Yours is correct — a third scope
value is one more thing a caller reaches for by accident, and the defect WAS a caller not being
explicit. Main keeps yours. My backend + api changes are dropped.
Still yours:
283.3 — static guard: no listAllLoads / GET /loads call site may omit board_scope. Fail the build,
        not a lint warning. That is what makes your fail-closed else permanent.
283.5 — re-check UI items #26-#29 against the corrected filter. Some were symptoms of the boards
        disagreeing, not bugs. Report which.

## 284.5 — CODEX — build the 17 BEFORE retiring anything else.
Accepted, your measurements win over mine: 5,427 guards not 5,285; 1,124 candidates not 1,046; 131
DO execute through the dynamic runner — my "never ran" is withdrawn. All three corrected in the 282
file, method item 5 replaced with the retraction.
1. Commit the /tmp recovery archive at its real repo path and PUSH it. An archive in /tmp is not a
   recovery path; a reboot makes 9 retirements irreversible. Don't overwrite a dirty worktree — use
   a clean checkout of main, PR touching only docs/audit/archive/ and scripts/.
2. Build the numbered 1-17 from the 282 file EXACTLY as written. Automatch(7), JE balance(1), wallet
   non-negative(12), audit-on-status-change(15) are IN. "bank signed-amount", "settlement tie",
   "period-close", "linkage" from my chat message are WITHDRAWN — do not build them.
3. The 15 LAW.json-registered failures are the priority. A registered guard that fails is a red
   baseline, not noise. Report what each asserts and whether the assertion or the code is wrong.
4. No further retirements until coverage is proved. Your hold is correct.

## 284.6 — LEAD — done this round
TruckLineBoard.tsx animation gate: engine_state is a VETO, never a REQUIREMENT. Committed here.
Frontend typecheck of the 5 changed files: exit 0, 0 errors.
WITHDRAWN by Lead: the "all" board_scope value, and the earlier typecheck progress report (the
background job had died; the running-check was matching its own command line — the reading was
worthless and should not have been reported).
