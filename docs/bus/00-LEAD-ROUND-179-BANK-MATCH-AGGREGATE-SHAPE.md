# CURSOR — ROUND 179 (Updated 2) — THE MATCH ENGINE IS LOGIC, NOT FUZZY RANKING
2026-09-28, Laredo Central. Lead. Supersedes both earlier Round 179 boxes. After Round 175 merges.

Owner corrected Lead on two points. **Both corrections are right and both were verified live.**
The consequence: almost none of this is a "best guess ranked list". It is arithmetic.

---

## CORRECTION 1 — **RELAY IS PREPAID.** DO NOT MATCH RELAY BANK LINES TO FUEL PURCHASES.
Lead previously said Relay matches ~1:1 to fuel documents. **That was wrong.**

Relay is a **prepaid** card. A Relay bank draft is **not a payment for fuel** — it is a **top-up
funding the card balance**. That is why it is spread over all seven days at ~$455 average: it is
funding on demand, not a statement settling.

**Correct accounting shape — three separate things, never conflated:**
1. **Relay bank draft → DEBIT a prepaid asset** (prepaid fuel card / funds on deposit with Relay).
   It is a transfer between asset accounts. It is **not** an expense and **not** a fuel document match.
2. **A Relay fuel purchase → CREDIT that prepaid asset, DEBIT fuel expense**, coded to the load.
   It draws the balance down. It has **no** bank line of its own.
3. **Reconciliation is the balance, not a pairing:**
   `opening prepaid + sum(top-ups) − sum(purchases) = closing prepaid`, and that closing figure must
   equal the balance Relay reports. **Never pair a Relay draft to a single fuel purchase.**

**Dreamline is the opposite — postpaid.** Charges accrue, the statement closes, the draft pays the
accrued set. Owner's cadence confirmed live: **19 of 24 Dreamline drafts fall Tuesday (11, avg
$7,406.63) or Friday (8, avg $8,546.23)** — closes Monday pays Tuesday, closes Thursday pays Friday.
The 5 outliers (3 Wed, 2 Mon) are holiday/bank shifts — resolve by **nearest preceding close**, never
by dropping them.

**So: Dreamline = statement-window batch match. Relay = prepaid balance reconciliation. Loves direct
= per-transaction. Three different rules. Getting this wrong misstates both the fuel expense and the
cash position.**

---

## CORRECTION 2 — FARO IS DETERMINISTIC. THE APP ALREADY COMPUTES THE EXACT NET.
Owner: *"our app when we send the invoices to factor already gives us how much they will pay etc all
fees, so it should be by logic as well."* **Correct, and Lead verified it holds perfectly:**

```
advanced advances (USMCA)                     : 95
where net_advance = invoice_total
                    − reserve − fee − wire_fee − cash_rsv : 95      ← 95 of 95, ZERO variance
```

Sample, live:
| FAC | Faro ref | Invoice | Reserve | Fee | Wire fee | Net advance | Computed | Variance |
|---|---|---|---|---|---|---|---|---|
| FAC-2026-00138 | 101 | $4,300.00 | $64.50 | $64.50 | $10.00 | $4,161.00 | $4,161.00 | **0.00** |
| FAC-2026-00139 | 103 | $6,250.00 | $93.75 | $93.75 | — | $6,062.50 | $6,062.50 | **0.00** |
| FAC-2026-00136 | 096 | $4,019.72 | $60.30 | $60.30 | — | $3,899.12 | $3,899.12 | **0.00** |

**The expected wire is known at submission time, to the cent, on every row.** So a Faro wire is not
ranked against candidates — it is **looked up**: the wire equals the **sum of computed nets** for the
invoices in that submission. No confidence score. No fuzzy window. Arithmetic.

### JOB A — THE ONLY THING BLOCKING THAT: THE BATCH REF IS FAKE
```
factoring_advances (USMCA): 144   with submission_batch_ref: 144   DISTINCT refs: 143
```
143 distinct refs across 144 advances — **every advance got its own unique ref**, so it is a row id
wearing a batch's name. The app therefore cannot say which invoices went in one submission, which is
the one fact the deterministic match needs.

**Fix the submission, not the matcher.** When we factor in the app and send to Faro, stamp **ONE
`submission_batch_ref` across every invoice in that submission**, with the submission timestamp, the
total submitted, and the **total expected net** (sum of the computed nets above). Then:
`Faro wire amount == batch expected net` → matched, deterministically, at the moment the wire lands.

Backfill history from `~/Downloads/faro daily purchase report.csv` — invoices Faro purchased on the
same date form one purchase group. **Where history cannot be reconstructed, leave it null and report
it. Never manufacture a batch ref to make a join succeed.** Also fill `faro_invoice_number` on the
**47 advances missing it** (97 of 144 have it) from that same report.

---

## THE ENGINE — TWO PHASES, QUICKBOOKS ORDER. DO NOT COLLAPSE THEM.
**Phase 1 — MATCH** the bank line to its document set. **Phase 2 — APPLY** the payment across those
documents, with the app computing the sums.

**Classify the bank line first, then apply that counterparty's rule — classify before offering:**
- **FARO** → batch lookup. `wire == batch expected net`. Deterministic. Any difference is a named
  chargeback, reserve release or wire fee — **prove it line by line, never absorb it silently.**
- **DREAMLINE** → statement window from the close day (Mon close → Tue draft; Thu close → Fri draft);
  sum the fuel documents in the window; the draft should equal that sum.
- **RELAY** → **no document pairing.** Post the draft to the prepaid asset. Reconcile by balance.
- **LOVES direct** → per-transaction, amount + date ±3 days + location.

Multi-select with a **running remainder that is visible at all times** and re-ranks after each pick.
The remainder ends at zero or is **explicitly named** — fee, discount, chargeback, wire fee, reserve
release. Never silently absorbed.

**Phase 2 — APPLY:** allocate the bank amount across the selected documents, post the clearing entry,
mark each document paid or partially paid, carry any named remainder to its own account. Reversible
through the **Round 175 reinstate engine** — an unapplied payment leaves a trail.

## GUARDS
- `verify-faro-batch-ref-is-shared-across-submission.mjs` — fails if a submission stamps a unique ref
  per advance. **This is what stops the 143-of-144 defect recurring.**
- `verify-faro-wire-equals-batch-expected-net.mjs` — wire == sum of computed nets, or the difference
  is a named, posted line.
- `verify-relay-prepaid-balance-reconciles.mjs` — opening + top-ups − purchases = closing, and no
  Relay bank line is ever matched to a fuel document.
- `verify-match-remainder-is-zero-or-named.mjs`
- `verify-bank-match-has-clearing-entry.mjs`
- `verify-match-is-reversible.mjs`

## PROOF
`banking.reconciliation_matches` off zero. One Faro wire matched to its batch by computed net, pasted.
One Dreamline statement window matched with remainder zero, pasted. The Relay prepaid balance
reconciled and tied to Relay's reported balance. Distinct batch refs moving from 143 toward the real
submission count. All guards exit 0.

**Never match on amount alone. Never auto-accept without a threshold the owner has set.**
