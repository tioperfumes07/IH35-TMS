# LEAD RULING — ROUND 84 — 2026-09-22 — committed by Cursor on the Lead's behalf, verbatim as relayed by the owner.
# Cite as LANE-CROSS: LEAD RULING ROUND 84 (this file).
#
# M2 BELOW IS RETRACTED by ROUND 85 (Lead, same day), verbatim: "RETRACTED — CURSOR M2. Round 84 M2 told Cursor to count
# live USMCA money lines stored amount-only, per table, in dollars. EVERY ONE OF THOSE ROWS DIES IN THE PURGE. ... STOP. Do
# not start it, do not finish it if started. ... Cursor: your order is now M1, then E7 batch 2. Two rows, not three."

# CURSOR — ROUND 84 — BOTH MEASUREMENTS ASSIGNED. E7 BATCH 2 CROSS GRANTED.

Round 82 delivered: E17 #22309, E7 batch 1 #22310, I2 #22313. Your read of Round 83 is correct —
nothing in it was yours, and you were right to leave #22297 to CC-3.

You asked for assignment on two. Both are assigned. They are measurement, which is your lane,
and nobody else is doing them.

## M1 — DUPLICATE ACTIVE ACCOUNT NAME IS A DEFECT
Owner ruled account NUMBERS hidden everywhere by default. The NAME is now the only identifier a
human sees, so two active accounts sharing a name is a real ambiguity, not a cosmetic one.
Build the guard: fail on any two rows in catalogs.accounts for USMCA with
deactivated_at IS NULL and the same account_name, case- and whitespace-insensitive.
Known live pair to baseline or fail on: "Office Expense" (OFFICEEXPENS815299) vs
"Office & Administrative Expense" (6210) are NOT a name collision — look for true collisions and
report what you actually find. Also flag near-collisions that differ only by "(hired unknown)",
since CC-3 is stripping that string from 30 driver account names in E13-B D5.
Shrink-only ceiling, fail-closed with no DB, selftest with planted duplicates.

## M2 — MONEY LINES STORED AMOUNT-ONLY
Round 83 R3: every money line is item · description · QTY · RATE · AMOUNT, amount computed.
Measure the gap before CC-1 builds it. Across accounting.bill_lines, accounting.invoice_lines,
the driver_finance settlement lines and the load-cost line: how many live USMCA rows carry an
amount with no quantity, no rate, or no item reference. Count and dollars, per table.
Detection only. Do not add columns — that is CC-1's E13-A addendum. Your number is the baseline
his migration has to move.

## E7 BATCH 2 — CROSS GRANTED
Round 82 (b) was one PR. This is the new cross: E7 batch 2 — the 124 verify-steps-only guards and
the 18 red ones with priced baselines — is yours, same terms as batch 1. Fail-closed,
domain-conditional, every baseline priced from live. Do not wait for another ruling.

## ORDER
M1 and M2 first — they are small and they price the purge. Then E7 batch 2.

## DEPLOY — MEASURED BY LEAD 23:51Z, NOT YOUR WATCHER
srv-d7rpem7avr4c73fhp4n0:
  dep-dapgljpc3rtc73da06q0  f73636667c  live
  dep-dapgoi2auudc73ef7ukg  f7103ecd    update_in_progress   <- THIS IS THE #22297 DEVIATION
  dep-daph6opi4t5s73ajseb0  72b3e367af  queued               <- E17
f7103ecd carries the withdrawn 5160/5170 account codes and is going live BEFORE CC-3's
correction. It is an extractor script, not a posting path, so nothing writes 5160 or 5170 to the
chart — but do not let any seat cite that file's ACCOUNT_KEY as law while it is live.
