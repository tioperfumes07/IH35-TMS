# INBOX-CC-3 — Claude Lead · written 2026-10-06

READ THIS FILE AT THE START OF EVERY ROUND. The Lead writes here directly; the owner does
not paste orders any more. If it is not in this file or in your OUTBOX, it was not ordered.

RULE: write every result to docs/bus/OUTBOX-CC-3.md. The Lead reads the bus from origin/main.
If it is not in the bus, it did not happen and the Lead cannot see it.

## YOUR OPEN ORDERS — full text in these files, same content, both locations:

  ~/Downloads/10-06-2026-CC-3-LEGAL-CONTRACTS-PDF-AND-FILING.md
  ~/Downloads/10-06-2026-CC-3-MONEY-ENGINES-NOW.md
  ~/Downloads/10-06-2026-CC-3-VISUAL-CLOSEOUT.md
  ~/Downloads/10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md

CC-3 — LEGAL CONTRACTS: PDFs, CATEGORIES, AND FILING TO THE RIGHT PLACE · ROUND 435-CC3

OWNER, 2026-10-06: "IN LEGAL CONTRACTS THERE ARE DRAFTS AND VOIDED, BUT THERE ARE NOT PDFS TO SEE
THE CONTRACTS. ALL CONTRACTS SHOULD BE SAVED HERE, AND WE SHOULD VIEW THEM BY CATEGORIES... A DRIVER
CONTRACT SHOULD HAVE THE CONTRACT IN THE DRIVER'S FILE, INSURANCE SHOULD BE SAVED ALSO IN THE
INSURANCE BILL, FIRST BILL. EVERYTHING TO ITS CORRECT PLACE."

1. EVERY CONTRACT INSTANCE HAS A PDF, AND IT IS VIEWABLE. Today legal/contracts lists drafts and
   voided with no document to open. Generate the PDF at the moment the instance is created, store it
   in docs.files, and link it both ways. A contract you cannot open is not filed.

2. VIEW BY CATEGORY. The list groups by contract category, not one flat table.

3. FILE IT WHERE IT BELONGS -- the linkage law, applied:
   - a DRIVER contract appears in that driver's file (mdata.drivers -> docs.files, both ways)
   - an INSURANCE contract appears on its first insurance BILL (accounting.bills), both ways
   - every other category names its hub the same way
   A contract filed in Legal only is HALF filed. The owner's words: everything to its correct place.
   Declare the linkage in the PR body -- Rule 14, a block with no linkage declaration is not done.

4. NOTHING IS SEEDED. The owner is creating real settlements right now specifically so the data is
   real. Do not write a sample contract, not even to prove the PDF renders. Prove it on a real
   instance or prove it in a test fixture that never touches USMCA.

DONE LINE: PR · squash sha · deploy id · one real contract opened as a PDF from Legal AND from its
hub record · the linkage declaration · the guard PASS line verbatim.
CC-3 — MONEY ENGINES, RELAY + 2170 LANE · ROUND 432-CC3
Owner order 2026-10-06: all money engines fixed now. Deadline 2026-10-06 20:00 Laredo (2026-10-07 01:00Z).
CI is down account-wide. Local gates ARE the record.

1. PUSH YOUR TWO READY BRANCHES TODAY. cc-3/bill-payment-post-failure-never-swallowed (the 2170
   engine fix) and cc-3/relay-fill-link-engine (ACCT-F403 linker) have been sitting local since
   10-05. Owner law: nothing stays local. You reported the gate red only on two post-purge empty
   guards that are not yours — name them in the PR body with their exact output and push anyway.

2. THE 69 RELAY BANK LINES THAT WERE NEVER POSTED. Your own 10-03 measurement: all on the Relay Fuel
   Wallet, each matched 1:1 to its own integrations.relay_fuel_transactions row, all matched
   2026-09-28 16:08–21:28Z by one user, $31,438.15, and ZERO reach the ledger — no posting sources to
   them and no spine link reaches them. NOTE, measured by me 2026-10-05: AUTH-400 released all 69 at
   00:24:15.475Z (release_kind='purge_reset', 69 of 69 distinct bank lines), and every one of those
   bank lines is alive and now pending_categorization. So the match is gone but the $31,438.15 of
   fuel is still unposted. Make the engine post it, or state in one line why it must not.

3. relay_fuel_transactions.posted_to_gl = true ON 75 USMCA ROWS while no posting and no spine link
   reaches any of them. A stored flag that contradicts the ledger is worse than no flag. Derive it or
   refuse to store it. You already shipped the derived version in #25400 — prove the 75 now read
   false, or say what still stores true.

4. 2170 BILL PAYMENTS WITH NO GL. Engine fix, not data.

5. 367.7 — the three-way split of the 167, DIRECT endpoint, SQL pasted. Gates the purge.

DO NOT
- Do not hold a finished branch for a red that is not yours. Name it and push.
- Do not change a Samsara record. Many Samsara users map to one driver; names are never changed.

DONE LINE, per item: PR number · squash sha · deploy id + deployed sha · the live query and its
pasted result · the guard PASS line verbatim.
CC-3 — VISUAL CLOSEOUT: NATURAL SIGN AND CLICK-THROUGH · ROUND 433-CC3
Owner 2026-10-06: close every visual item. Deadline 2026-10-07 20:00 Laredo.
STILL FIRST, TODAY: push your two READY branches (bill-payment-post-failure-never-swallowed,
relay-fill-link-engine). They have been local since 10-05 and owner law is that nothing stays local.
Name the two reds that are not yours in the PR body and push anyway. Then take this.

1. NATURAL-SIGN RENDERING — U27. Measured: grep for naturalSign / natural_sign / renderNaturalSign
   across apps/frontend/src AND apps/backend/src returns NOTHING. There is no implementation
   anywhere. Every balance surface must render the natural sign of the account — a liability with a
   credit balance does not read as negative, and an expense does not flip sign because of how the
   posting was stored. This is yours because it is a ledger-meaning question before it is a UI
   question: the sign comes from the account type, not from the raw debit/credit. Build ONE helper
   that takes (account_type, debit_cents, credit_cents) and returns the display value, put it beside
   the existing placement logic, and repoint every balance surface. Guard it with cases per account
   type. Missing renders as an em dash — never 0, never -$0.00.

2. THE 89 UNWIRED MONEY CELLS. verify-money-cells-click-through is green at a shrink-only ceiling of
   89 — green because the ceiling MATCHES, not because the work is done. Every money cell drills to
   its transaction (U29, "everything clickable"). Bring the ceiling down and report the number each
   PR moves.

3. CashFlowStatementPage CANNOT DRILL AT ALL — it carries no account_id, so its cells have nothing to
   link to. That is a BACKEND field, which is why it is yours: add account_id to the cash-flow
   statement payload, then wire the cells.

4. U25 — DIESEL BECOMES REEFER DIESEL in the four places the owner named. You already own account
   5015 and the role reefer_fuel_expense, so the labels should follow the accounts you built.

DO NOT
- Do not define palette hexes. CC-1 owns the tokens PR.
- Do not infer a sign from the posting alone. The account type decides.
- Do not raise the money-cell ceiling.

DONE LINE per item: PR number · squash sha · deploy id + deployed sha · for the cells, the
before/after count · the guard PASS line verbatim.
