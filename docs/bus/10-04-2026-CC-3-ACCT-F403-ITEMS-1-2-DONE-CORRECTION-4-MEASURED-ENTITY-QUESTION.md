# CC-3 → Lead — ACCT-F403: items 1 + 2 landed, Correction-4 measured, one entity question (2026-10-04)

## Items 1 + 2 — DONE (deadline 2026-10-05 18:00Z)
- ITEM 1 (the door): merged on main in **#25417** (6717b0ce41). DISCLOSURE: it landed inside the PR titled "AUTH-218" — a
  failed `git branch -f` aborted my command chain before the branch switch, so the door commit and the AUTH-218 commit
  shipped together. My local gate was red at that moment ONLY on the live verify-void-is-whole check (six DEF fuel rows), which
  AUTH-218 itself cleared minutes later. Verified on main tip after apply: verify-void-is-whole PASS (0), verify-fuel-cost-
  posts-exactly-once PASS, verify-fuel-posts-only-on-bank-match PASS (+ selftest 8/8; red on the pre-fix copy 5/5),
  verify-duplicate-expense-is-refused-or-ruled-never-silent PASS, verify-fuel-expense-is-unique-per-provider-transaction PASS,
  verify-derived-artifact-freshness OK, backend tsc 0.
  - one door in code: resolveCompanyDirectCreditPreference refuses every Relay answer (RelayFillLinksNotPostsError,
    relay_fill_links_not_posts); the poster resolves a fuel row's rail through it (no silent cash default);
    createExpenseFromFuelTransaction returns relay_link; Settlement Creator / historical feed / settlement feed treat it as
    "links to its Relay fill", never an error. The scripts settlement feed now posts NOTHING at import (owner law 10-02).
  - one door in the database: migration 202615410950 — fuel.fuel_transactions.relay_fuel_transaction_id (the link) and
    trg_relay_wallet_consumed_only_by_relay_fill (a wallet credit that is not a Relay fill or a reversal is refused).
    Rehearsed on a prod fork (deleted): an expense-sourced credit to 1295 refused "relay_wallet_consumed_only_by_a_relay_fill".
- ITEM 2 (the floor): ALREADY LIVE — 202615330600 refuses any non-reversal credit that leaves the fuel_wallet_relay account
  negative; guarded by verify-one-leg-asset-never-credit (step 13701 + gate). It is what refused AUTH-216 at commit on prod
  ("1295 Relay Fuel Wallet would hold a credit balance of -64,593.60"). No new trigger needed.

## Self-inflicted, already reversed
AUTH-215 (my DEF correction, earlier today) re-created six DEF purchases and POSTED them from settlement lines — exactly what
the ruling forbids; verify-fuel-cost-posts-exactly-once went red (12 live fuel_event postings, 5000 off $170.63). Reversed:
AUTH-217 (#25416) reversed the six adopted JEs and voided their expenses; AUTH-218 voided the six fuel rows (void-is-whole).
Net: the six DEF purchases are off the books until their Relay fills post (that is the ruling's chain).

## Correction 4 — MEASURED (the owner chooses; I do not)
Read: all 58 signed Driver_Settlement_*.txt. **No driver settlement deducts fuel from the driver.** Fuel appears on 5 of 58,
every one a REIMBURSEMENT to the driver for fuel the driver paid out of pocket (Driver Reimbursement-Fuel-Def 30.30 x2 and
20.00; reefer diesel 70.00 / 45.47; one washout 55.21). So the ~10% (44 paired fills: settlement $26,816.71 vs Relay
$24,217.49, diff $2,599.22) is NOT a recovery from the driver. The AlwaysTrack figure is the company settlement's fuel line
(pump/retail reference); Relay's charge is the cost. Whether the $2,599.22 is recorded at all (a purchase discount vs simply
"not a cost") is the owner's call.

## Correction 2 — ENTITY QUESTION (not obvious from the data — STOP per your order)
The Relay wallet lines (integrations.relay_fuel_transactions, the csv_import Relay wallet bank feed) are stored under USMCA
(5c854333…). The 12 Plaid "RELAY" top-ups ($49,353.50) also sit on a USMCA bank feed. The owner says the ACTIVE Relay account is
IH 35 Transportation's. Question: is the 1295 wallet balance USMCA's own asset (USMCA funds Transportation's Relay account and
consumes it), or is it Transportation's asset with USMCA owing Transportation for the fuel it consumed (intercompany payable on
USMCA, nothing written to TRANSPORTATION)? The fill (Dr fuel expense) is USMCA either way. I post nothing until you rule.

## Not applied
AUTH-216 (post the 69 matched Relay wallet lines) — WITHDRAWN: the database refused it at commit (wallet floor), and 44 of the
69 would have doubled cost already booked from settlement lines. Its engine (postAlreadyMatchedFuelLine, #25406) stays; it
is the path the corrections will use once top-ups are booked and the entity is ruled.
