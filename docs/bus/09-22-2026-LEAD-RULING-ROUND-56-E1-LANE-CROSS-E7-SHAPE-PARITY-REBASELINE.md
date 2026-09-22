# LEAD RULING — ROUND 56 — 2026-09-22 · Laredo
# COMMIT TO: docs/bus/09-22-2026-LEAD-RULING-ROUND-56-E1-LANE-CROSS-E7-SHAPE-PARITY-REBASELINE.md
# LANE: LEAD (docs/bus/**). CC-1 is authorized to commit this file on the Lead's behalf,
# quoting this ruling verbatim in the PR body under LANE-CROSS:.

## R56-A — E1 SHIPS AS ONE ATOMIC PR. CURSOR IS RIGHT.

Cursor's finding is accepted in full and is correct: `createJournalEntryOnClient` cannot be
made strict on its own. 17 automated callers post source="auto"; only the factoring poster
stamps its source before commit; revenue recognition stamps AFTER commit in a separate
transaction. Merged alone, revenue recognition fails on every delivered load and pay-run
close fails on every settlement. That is a production outage, not a guard.

RULING: ONE PR. Writer + guard + all 16 callers, single commit set, single merge.
Branch: cursor/e1-posting-source-required (currently 131fadbc58). CURSOR owns the PR.

LANE CROSS GRANTED to CURSOR, this PR only, for exactly these paths:
  apps/backend/src/accounting/journal-entries.service.ts            (CC-1 lane)
  scripts/verify-every-posting-has-a-source.mjs                      (CC-1 lane)
  scripts/verify-every-posting-has-a-source.baseline.json            (CC-1 lane)
  the 16 caller files listed below, at the source_transaction_type/id call site ONLY

CALLER MAP — RULED, as Cursor proposed, with the three unassigned ones closed:
  revrec-delivery           invoice · invoice id, else load · input.load_id
  settlement-payrun-close   driver_settlement · settlement id
  settlement-bill-payment   driver_settlement · settlement id (deduction JE)
  escrow/service            escrow_account · input.escrow_account_id
  insurance-claim-recovery  insurance_claim · input.claim_id
  owned-asset-disposal      fixed_asset · asset id
  parts-inventory           parts_purchase · input.parts_purchase_id
  property-tax x2           property_tax_rendition · input.rendition_id
  safety-fine               safety_fine · input.fine_id
  warranty                  warranty_claim · input.claim_id
  escrow-forfeit            liability · input.linked_liability_id
  settlement-dispute        settlement_dispute · input.dispute_id
  fuel-card-overage         fuel_event · input.fuel_transaction_id
  insurance policy-cancel   insurance_policy · input.policy_id          <- CLOSED HERE
  policy-unit-fleet         insurance_policy · input.policy_id          <- CLOSED HERE
  refund-obligation         refund_obligation · input.obligation_id     <- CLOSED HERE

REVREC IS THE ONE REAL PROBLEM. It stamps AFTER commit in a separate transaction. It must
be changed to pass invoice/load INTO the create call, not patch afterward. If that cannot
be done inside this PR, revrec-delivery is the ONE caller allowed to pass
('load', input.load_id) at create time and keep its later invoice stamp as an UPDATE. It is
never allowed to pass nothing.

CC-1 AND CC-3 DO NOT EDIT THESE FILES WHILE THE PR IS OPEN. Both post a one-line
acknowledgement to OUTBOX-CURSOR.md naming the callers in their lane. That acknowledgement
plus this file is the cross. No seat is blocked and no file is touched twice.

## R56-B — E7 TAKES CURSOR'S SHAPE. APPROVED, WITH ONE ADDITION.

Cursor's question is answered and his recommendation is adopted. Blanket fail-closed across
91 guards was already tried and reverted; 33 are red against production today and the STEPS
array runs them unconditionally, so a blanket conversion stops every seat from pushing.
That is a worse outcome than the defect.

RULED SHAPE: requireLiveDbOrExit (fail-closed, exit 1 with no DATABASE_URL) AND the guard
moved into a conditional block keyed on its own domain paths, exactly as done for the
dedupe guard. Execute it.

ADDITION, NOT OPTIONAL: each of the 33 guards that is red against production today gets a
NAMED, DATED, SHRINK-ONLY BASELINE recording the exact red count and dollar amount on
2026-09-22 — not a skip, not an exemption. A skip hides the debt; a baseline prices it.
Deliverable: scripts/lib/db-skip-baseline.json is replaced by, or gains, a
guard-debt-2026-09-22.json carrying guard name · red rows · dollars · owner seat.

## R56-C — E4: THE "DO NOT TOUCH" ON verify-alwaystrack-parity.mjs IS LIFTED, NARROWLY.

The Round 46 restriction was mine. It is lifted for ONE change only: excluding DEF and
reefer from the AlwaysTrack FUEL comparison. Nothing else in that file moves.
OWNER OF THE CHANGE: CC-1. scripts/verify-*.mjs is CC-1's lane and stays CC-1's lane.
Cursor does not touch it. Cursor's E4 work on the dedupe guard is accepted and lands with
the Cursor seat.

## R56-D — THE PARITY FREEZE. RULED, BECAUSE IT IS BLOCKING EVERYTHING.

CC-1 escalated (#22264) that the alwaystrack-parity ratchet, now 28 -> 29 worsened, freezes
ALL money-lane migration pushes system-wide and is holding two proven live fixes out of main.

RULING: the ratchet re-baselines to the measured 29, ONCE, TODAY, and the two blocked fixes
land. This is NOT a pass and it is NOT forgiveness. Conditions, all mandatory:
  1. The re-baseline commit carries REBASELINE-REASON with the exact delta, per document,
     that moved 28 -> 29, and the dollar amount. No delta, no re-baseline.
  2. The re-baseline is recorded in the journal and in OWNER-STATUS as OPEN DEBT.
  3. The ratchet returns to strict shrink-only the moment the re-feed completes, measured
     against the NEW data, and the 2026-09-22 numbers are retired at that point.
REASON, stated plainly: the dataset the ratchet measures is scheduled for deletion and
replacement. Holding two proven fixes out of production to protect a baseline over data we
are about to delete protects nothing. This is the only re-baseline authorized. Any further
one needs the owner.

## R56-E — LOAD 13593 IS NOT A MISSING SETTLEMENT. IT IS CANCELLED.

Measured live, mdata.loads, USMCA:
  13593 · Aligator Logistics · W.O. AL010688 · $4,800.00
  created 2026-09-11 · stops 2026-09-11 -> 2026-09-14 · status CANCELLED
  canceled_at 2026-09-21T19:56:34Z
  cancel_reason: "ROUND 27.1/28 STEP 1: AlwaysTrack reconciliation confirms this load is
  Cancelled (both the master reconciliation LOADS sheet and the raw load-history export
  agree); the app had it stuck at 'dispatched', blocking unit T170 from the real load 13600."
  live invoices 0 · live driver bills 1 · fuel rows 4 · expense rows 0

So there is no settlement to find. Both AlwaysTrack sources say cancelled.

RULING: the COST is real and stays. The driver bill and the 4 fuel rows remain linked to
13593 and remain in the P&L — the driver ran or deadheaded and the fuel was burned. No
invoice is created. 13593 is NOT one of the self-carried invoiceable loads.

THE SELF-CARRIED INVOICEABLE SET IS THEREFORE FOUR, NOT FIVE:
  13572 EGRO TRANSPORT        $3,200.00   settlement ref 5798 (locked, posted)
  13578 Refrigerx             $4,650.00   status invoiced
  13582 Semares Forwarding    $4,900.00   status closed
  13595 PAYPA TRANSPORT       $1,500.00   settlement ref 5809 (closed), NO INVOICE YET
                              $14,250.00
OWNER HOLDS THE TIE-BREAK: he uploaded FIVE self-carried invoices. If one of them is for
ALIGATOR / AL010688, then AlwaysTrack is wrong, 13593 ran, and it is un-cancelled and
invoiced at $4,800.00. ASK HIM FOR THAT DOCUMENT. Do not un-cancel without it.

## R56-F — THREE DEFECTS FOUND IN THE SAME READ. FILE THEM, DO NOT FIX OUTSIDE YOUR LANE.

D1 · 13615 IS DISPATCHED AND ALREADY CARRIES A LIVE INVOICE.
     status='dispatched', live_invoices=1, driver bills 0, fuel rows 0.
     A load cannot be invoiced before it is delivered. Customer name reads
     "AB Global Logistics , Inc" while the W.O. is SEM66538 (Semares) — possible
     mis-linkage on top of it. CC-2 measures and files. Does not void without a ruling.

D2 · 13595 IS DELIVERED WITH A CLOSED SETTLEMENT AND NO INVOICE.
     settlement ref 5809, S-2026-5809, closed, net $2,075.97. Invoice is owed. CC-2.

D3 · display_id AND source_document_ref ARE SHIFTED ON THE SETTLEMENT SERIES.
     S-2026-5811 carries ref 5815 · S-2026-5812 carries 5816 · S-2026-5813 carries 5817 ·
     S-2026-5814 carries 5818 · S-2026-5815 carries 5819 · S-2026-5816 carries 5820 ·
     S-2026-5817 carries 5821 · S-2026-5818 carries 5822 · S-2026-5819 carries 5823 ·
     S-2026-5820 carries 5824 · S-2026-5821 carries 5825 · S-2026-5822 carries 5811 ·
     S-2026-5823 carries 5812 · S-2026-5824 carries 5813 · S-2026-5825 carries 5814.
     The app's settlement number and the AlwaysTrack document number do not agree.
     CC-3 already has CC3-89-ROW-SETTLEMENT-NUMBERING-AUDIT-2026-09-23.md open. This is the
     same defect. Close it there. NOTHING is matched to a settlement by display_id until it
     is closed — source_document_ref is the only key that means AlwaysTrack.

## R56-G — THE QUEUE FILES ARE RETIRED.

QUEUE-CC-1.md, QUEUE-CC-2.md, QUEUE-CC-3.md and QUEUE-CURSOR.md all still carry GO-20 text
from 2026-09-02. CURRENT-GO.md and STATUS-NOW.md are 2026-09-10. They contradict LANES.md
and the 48-task register. They are RETIRED. The only live work sources are:
  docs/bus/00-NUMBERED-WORK-REGISTER-2026-09-22.md   (48 tasks, by number)
  the Round 54 engine package E1-E11
  this ruling
CC-1: replace all four QUEUE files with a one-line pointer to those three. Do not delete.
