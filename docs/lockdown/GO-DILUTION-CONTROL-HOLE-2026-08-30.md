# GO — DILUTION / CUSTOMER SHORT-PAY CONTROL HOLE (PERMANENT FIX)
**Owner-approved 2026-08-30. Author: Claude (claude-4d). Cursor: distribute + assign.**
**This supersedes the 016-only framing. 016 is one instance of this.**

## OWNER'S STATEMENT OF THE PROBLEM (verbatim intent, this is the requirement)

> We invoice say 3,000. Faro pays us 2,910. The customer pays Faro in 40 days
> and only pays 2,800 — late fees, interest, no lumper receipt, we arrived late.
> We usually find out when they begin deducting from the reserves.
> **We do not have control.**

That is **dilution** (a.k.a. customer short-pay / broker deduction). It is discovered
at **reserve-settlement time**, not invoice time. It is not the same event as recourse.

---

## THE FINDING — PROVEN IN CODE, NOT ASSERTED

**There is no path for a partial customer payment to close out.** Verified on `main`
this turn in `apps/backend/src/accounting/factoring-posting/poster.service.ts`:

| Line | What it does | Consequence |
|---|---|---|
| L425 | `WHEN $2 > 0 THEN 'partial'` | a 2,800-of-3,000 payment posts and the invoice goes `partial` |
| L402 | guards `factoring_customer_payment_over_invoice_face` | **over**-payment guarded |
| L1402 | guards `factoring_customer_payment_overpayment` | **over**-payment guarded again |
| L2026-2028 | *"Full recourse only — amounts must match exact linked outstanding (no guess / partial)"* | the 200 **cannot** go through recourse |
| L1842, L1848, L1851, L2234 | `policy_partial_or_ambiguous_recourse` | it **fails closed** |

**Net effect today, for the owner's exact example:**
- the 2,800 posts as a partial payment;
- the **200 stays as open A/R forever**, against a customer who will never pay it
  (Faro already closed the invoice and took the 200 out of our reserve);
- the reserve reduction on Faro's statement has **no matching GL entry**;
- A/R and revenue are **both overstated** by the dilution, permanently;
- nothing ages, nothing alerts, nobody is accountable.

Every under-payment is guarded to death; every over-payment is caught. That asymmetry
**is** the control hole, and it is in the code, not in the office.

---

## WHAT IS MISSING IN THE CHART OF ACCOUNTS

Verified live, USMCA opco `5c854333-6ea5-4faa-af31-67cb272fef80`, `catalogs.accounts`.

**Present and correct — do not duplicate these:**
`1210` A/R – Assigned to Faro · `1220` Factoring Recoursed Invoices ·
`1230` Factoring Reserves · `1296` Faro Factoring – USMCA (`faro_factoring_wallet`) ·
`2150` Factoring Advance · `4000/4100/4200/4210/4220/4230/4240` freight + accessorial income ·
`6400` Factoring Fees · `6830` Factoring Default Interest.

**MISSING #1 — no contra-revenue account for money given back.**
Every 4xxx account records revenue *earned*. There is nothing for revenue *conceded*.
Today a short-pay has literally nowhere to land.

**MISSING #2 — no reason codes.** `credit-memos.routes.ts:18` allows only
`damage · shortage · rate_dispute · duplicate_billing · detention_dispute · other`.
The owner's two most common causes — **late delivery** and **missing lumper receipt /
paperwork** — have no code. Neither does "unknown, backup not received yet."

**MISSING #3 — DUPLICATE RESERVE ACCOUNTS. ADJUDICATE BEFORE ANY POSTING.**
`1200` "Factoring Reserve / Holdback" **and** `1230` "Factoring Reserves" both exist,
both `is_postable = true`, **both with `system_purpose = NULL`**.
The TASK-4 tie-out names **1230**. `1200` looks like an orphan that will silently split
the reserve balance. **Cursor: adjudicate and deactivate the loser (never delete).**

**MISSING #4 — no `system_purpose` on any factoring account.**
`1200/1210/1220/1230/2150/6400/6830` are all `system_purpose = NULL`, so the poster is
resolving them by number or name. That is how an account gets renamed and the money
quietly moves. Stamp `system_purpose` on each.

---

## APPROVED COA ADDITIONS — CONTRA-REVENUE BLOCK

`account_type = 'Income'`, `account_subtype = 'Discounts/Refunds Given'` — the QBO-native
way to carry a debit-balance revenue-reduction account, so COA↔QBO parity holds.

| # | Name | Postable | `system_purpose` |
|---|---|---|---|
| 4900 | Customer Deductions & Short-Pays | **no** (parent) | `customer_deduction_parent` |
| 4910 | Short-Pay — Service Failure / Late Delivery | yes | `shortpay_service_failure` |
| 4920 | Short-Pay — Missing or Invalid Paperwork (lumper receipt, POD, BOL) | yes | `shortpay_paperwork` |
| 4930 | Short-Pay — OS&D / Damage / Shortage | yes | `shortpay_osd` |
| 4940 | Short-Pay — Rate or Accessorial Dispute | yes | `shortpay_rate_dispute` |
| 4950 | Short-Pay — Detention / Layover Denied | yes | `shortpay_detention_denied` |
| **4960** | **Short-Pay — UNKNOWN / Backup Not Received** | yes | `shortpay_unknown` |

**4960 is the honest default and it is the most important account in this table.**
Nothing may be coded to a *cause* without the broker's or Faro's backup in hand. An
aging balance in 4960 is the number that measures the control hole. It is supposed to
be uncomfortable to look at.

**Accounting basis (for the CPA/auditor reading this later):** a post-invoice deduction
taken unilaterally by the customer is a reduction of the transaction price under
ASC 606, not an operating expense — so it belongs in the revenue block as contra-revenue,
which also keeps gross freight revenue comparable period over period.
**One deliberate exception:** an OS&D claim settled *separately* from the freight invoice
(billed, insured, or litigated on its own) is a cargo-claim **expense**, not contra-revenue
— route those to the claims/insurance path (`6155 Insurance Claim Recovery` already exists),
**not** to 4930. 4930 is only for OS&D deducted *from the freight invoice itself*.

---

## APPROVED REASON-CODE ADDITIONS

`credit-memos.routes.ts:18` `CREDIT_MEMO_REASONS` — add, keeping all existing values
(WORM: extend, never redefine):
`late_delivery` · `missing_paperwork` · `lumper_receipt_missing` · `detention_denied` ·
`factoring_dilution` · `unknown_pending_backup`

Mirror the same list in `apps/frontend/src/api/credit-memos.ts` with human labels.
Each new code maps 1:1 to its 49xx account. `unknown_pending_backup` → **4960**.

---

## THE ENTRY — PROPOSED, MUST BE VALIDATED AGAINST THE FARO AGREEMENT BEFORE MERGE

Owner's example: invoice 3,000 · advance 97% · fee 1.5% · reserve 1.5% · customer pays 2,800.

**1 — Invoice**
```
DR  1210  A/R – Assigned to Faro        3,000
    CR  4000  Freight / Line-haul Income      3,000
```
**2 — Faro funds (ASC 860 secured borrowing; A/R stays on-book)**
```
DR  1296  Faro Factoring – USMCA        2,910
DR  1230  Factoring Reserves               45
DR  6400  Factoring Fees                   45
    CR  2150  Factoring Advance                3,000
```
**3 — Day ~40: customer pays Faro 2,800; Faro charges the 200 to our reserve**
```
DR  2150  Factoring Advance             3,000     (borrowing fully retired)
    CR  1210  A/R – Assigned to Faro          3,000     (receivable closed)

DR  4910  Short-Pay — Service Failure      200     (or 4960 if cause unproven)
    CR  1230  Factoring Reserves                 200     (reserve absorbed it)
```
Both legs balance independently. Result: A/R closes, revenue is reduced by the amount we
actually conceded, the reserve reduction has a cause, and the 200 is **visible**.

> **CC-2 / Cursor: do not take this entry on my authority.** Validate the reserve-charge
> leg against the executed Faro agreement (`scripts/ops/fact-04-faro-owner-seed-2026-07-27.sql`
> and the agreement PDF) before merge. If Faro instead re-bills the shortfall rather than
> charging reserve, leg 2 of step 3 changes and I want that caught here, not after posting.

---

## ASSIGNMENTS

**CURSOR (owns the permanent fix)**
1. **P0 — factoring pledges the wrong base.** `factoring-advances.routes.ts:375-398` sums
   `accounting.invoices.total_cents` with **no join to `accounting.credit_memo_applications`**,
   while `ar-aging.service.ts:110,146` **does** subtract them. Two modules, same receivable,
   different answer. Pledge on net-of-applied-credits using the *same* expression ar-aging
   uses, so they cannot drift again. Without this, a credited invoice over-pledges (on 016:
   face +400.00, escrow +6.00, fee +6.00 — right formula, wrong base, the #18318 family).
2. **P0 — dilution close-out path.** A partial customer payment must be closeable: remaining
   balance → reason-coded 49xx contra-revenue + reserve leg, invoice `paid`, A/R relieved.
   Not recourse. Do **not** loosen `policy_partial_or_ambiguous_recourse` — recourse stays
   full-only; this is a separate event and needs its own source type
   (`factoring_dilution`), its own poster path, and its own idempotency key.
3. **P1 — COA migration** for the 49xx block above + `system_purpose` stamps on
   `1200/1210/1220/1230/2150/6400/6830`.
4. **P1 — adjudicate 1200 vs 1230.** One survives with `system_purpose = factoring_reserve`;
   the other is deactivated (never deleted) with a note. Report which and why.
5. **P1 — reason-code enum extension**, backend + frontend, WORM-extend only.
6. **P1 — `QBO-MIRROR-STALE-16D`.** `mdata.qbo_ar_invoices` last mirrored
   `2026-08-14T17:04:28.643Z`, max doc `013`; live QBO runs to `036`. No seat may cite the
   mirror as authority for an absence until `last_seen_at` is inside 24h.
7. **Guard `one-load-one-open-invoice`** (already agreed).
8. **New guard `no-orphan-partial-invoice`:** fails when an invoice sits `partial` past the
   agreement's recourse window with no dilution record and no recourse. **This is the guard
   that makes the control hole impossible to re-open.** It is the deliverable that actually
   answers the owner's "nobody checks emails."

**CC-1 (books, tonight — not blocked by the above)**
- L13512 full 12-step specimen, then the Faro 32 in date order, USMCA only.
- **016: create the invoice at $4,200** (what AlwaysTrack billed), then the $400 credit memo.
  Until the enum ships, use reason `other` with this note **verbatim**:
  `UNVERIFIED $400 difference between AlwaysTrack billed 4,200.00 and Faro purchased 3,800.00 on load 13524 / Faro 016. Owner believes a post-invoice broker deduction, likely late delivery. NOT SUBSTANTIATED — no MPH or Faro remittance advice on file as of 2026-08-30. Reason code 'other' used because no late-delivery code exists yet (see GO-DILUTION-CONTROL-HOLE). Reclassify to 4910 or 4960 when backup arrives.`
- Then factor 016. **If the factoring screen pledges 4,200 instead of 3,800, STOP — that is
  Cursor item 1 confirming, it is a P0 FINDING, not a CC-1 miss.** Leave the 400 open and
  move on. **Never** fall back to booking a 3,800 invoice to make it tie.

**CC-2 (grades, does not build)**
- Faro expected face stays **95,075.00**. Do not shrink it. Re-verified to the cent:
  escrow 1,426.13 · fee 1,426.13 · wire 120.00 · cash 92,102.74 · NFE 88,648.87.
- Grade the **cause**: 016 missing because CC-1 skipped = CC-1 miss; missing because
  factoring cannot pledge net = **P0 against factoring**.
- Add to the register: `FACTORING-PLEDGE-IGNORES-CREDIT-MEMOS` (P0),
  `NO-DILUTION-CLOSEOUT-PATH` (P0), `COA-NO-CONTRA-REVENUE-BLOCK` (P1),
  `RESERVE-ACCOUNT-DUPLICATE-1200-VS-1230` (P1), `QBO-MIRROR-STALE-16D` (P1),
  `CREDIT-MEMO-REASON-ENUM-INCOMPLETE` (P2).

**CC-3 / CODEX / CASCADE** — not the books. Unchanged.

---

## STANDING — UNCHANGED
Bar-1 tonight, bar-2 is the gate, **no `complete: true` off data entry**. All six Urgent-6
modules currently read `complete: false`; that board is honest, keep it that way.
Crosswalk only; never AlwaysTrack `Total`, use `Charges`. One load, one TMS invoice
(3-digit QBO, not the duplicate `13xxx`). QBO's +$24,800 duplicate billing is owner/Martin
**in QuickBooks**; **no TMS→QBO write-back, ever**. QBO company is *USMCA Freight Solutions, Inc.*
007 has no AlwaysTrack load and that is correct (QBO $250 vs Faro $350). 009/010 unfactored,
named. 026 IM Specialized direct-pay, closed.
