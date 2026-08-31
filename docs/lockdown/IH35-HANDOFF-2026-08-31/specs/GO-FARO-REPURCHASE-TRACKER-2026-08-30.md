# GO — MAKE THE SYSTEM TRACK THE FARO REPURCHASE OBLIGATION
**Owner 2026-08-30: "Well have the system track it." Approved. Build it.**
Source of truth: the **executed Faro agreement**, text embedded in `~/Desktop/CPA ANSWERS.docx`.
Stop asking for the contract — it is that file, and the operative terms are transcribed below.

## Why this exists
A customer short-pay does **not** close the Faro obligation. The agreement's own example is the
owner's exact scenario:

> *Repurchased Account, Example 2 — "If the Net Amount … is $1,250.00, if there are neither any
> Transaction Fees … nor any Default Interest, and payment is received by Faro in the amount of
> $1,200.00, then the Purchased Account **remains a Purchased Account and does not become a
> Repurchased Account** at that time."*

Today nothing in the system knows that. The account looks handled, interest quietly accrues, and
the 95-day repurchase wall arrives with no warning.

## Operative terms (transcribed — do not re-derive)
| Term | Value |
|---|---|
| Security Reserve | 1.5% of Net Amount of each Purchased Account |
| Purchase Price | Net Amount − (Factoring Fee + Security Reserve) |
| Purchase Price Proceeds | Purchase Price − Transaction Fees |
| **Repurchase Price** | **Net Amount + unpaid Transaction Fees + Default Interest − credits** |
| Repurchase Term | 30 calendar days |
| Grace Period | 5 calendar days → interest starts **day 35** |
| Default Interest Rate | **0.067%/day, compounded daily** |
| **Repurchase Deadline** | **95 calendar days from Purchase Date** |
| Transaction Fees | wire, NSF, credit-card, UCC filing, UCC search, **costs of collection, attorneys fees, postage, court costs** |
| Reserve release | Only when Faro is paid the Repurchase Price **and** Seller not in default **and** Equity Holder not in default. Faro has **no obligation** to release reserve on an account not converted to cash. |
| Seller warranty | Every account sold is **"FREE FROM ANY CLAIM, DISPUTE, DEDUCTION AND/OR OFFSET."** |

> ⚠️ **Do not "correct" the interest rate.** The term sheet says **0.067%/day**; the illustrative
> example in the same document computes with 0.066%. The operative rate is 0.067%, which is what
> `poster.service.ts` already uses (0.00067/day after day 35, compounded). Leave it alone.

> ⚠️ **Never accrue an expected reserve release.** Release is conditional and discretionary.
> Recognize on receipt only.

## What is written and ready to run
| File | What it does |
|---|---|
| `db/migrations/202613301700_faro_repurchase_obligation_tracker.sql` | Adds the contract's three clocks to `factoring.factor` (30/5/95 + 0.00067) and seeds Faro. Adds `purchase_date` + `repurchase_deadline_date` to `accounting.factoring_advances`, backfilled from `advanced_at`. Creates `accounting.factoring_transaction_fees` (10 fee types, RLS forced, WORM void). |
| `db/migrations/202613301800_faro_repurchase_obligation_view.sql` | Creates `views.factoring_repurchase_obligation` — the **live Repurchase Price** per account, plus `accruing_default_interest`, `past_repurchase_deadline`, `partially_paid_still_open`, `days_to_repurchase_deadline`. |

**Design note worth keeping:** the view derives `Net Amount − credits` from the **outstanding 2150
balance**, not by re-deriving credits. That is deliberate — it reuses the same figure
`poster.service.ts::linkedOutstandingLiabilityCents` already proves, so the view and the poster
cannot drift apart. Review that join before merge; it is the one place I would want a second pair
of eyes.

**Two honesty columns, on purpose:** `is_trackable` is false when `purchase_date` is NULL rather
than silently aging from nothing, and `interest_basis_note` states on every row that unpaid
interest is "active accruals only" because no per-accrual paid flag exists yet. Do not strip them.

## Guards to author (Cursor; owner approves before merge)
| Guard | Fails when |
|---|---|
| `no-purchased-account-past-repurchase-deadline` | any account is `past_repurchase_deadline` — the 95-day wall, where the money actually leaves |
| `default-interest-accrues-from-day-35` | an account is `accruing_default_interest` with no accrual rows, or accruals started on the wrong day |
| `repurchase-price-ties-to-faro-statement` | summed `repurchase_price_cents` ≠ Faro's statement outstanding — **tolerance 0** |
| `partial-payment-leaves-account-open` | a partially-paid account was marked settled — the Example-2 rule, enforced |
| `no-accrued-reserve-release` | any entry recognizes reserve release before cash receipt |

## Follow-on work this exposes
1. **Transaction Fee capture path.** The table exists; nothing writes to it yet. Every Faro
   statement line that is not the discount fee is a Transaction Fee and raises the Repurchase Price.
2. **A Repurchase Obligation screen** — every open Purchased Account, its live Repurchase Price,
   days to the 95-day deadline, and whether interest is running. This is the screen that would have
   made the owner's problem visible a year ago.
3. **Partial-payment credit path** (spec §3a in `docs/specs/DEDUCTION-AND-DILUTION-CONTROL-SPEC-2026-08-30.md`)
   — customer payment credits both A/R and 2150; the account stays open. **Do not loosen
   `policy_partial_or_ambiguous_recourse`** — under this agreement repurchase genuinely is
   all-or-nothing, so the existing fail-closed behavior is correct.

## Correction on the record
My earlier draft entry (`DR 2150 3,000 / CR A/R 3,000` at short-pay time, charging the shortfall to
reserve) is **withdrawn**. It retired a liability the contract keeps open and skipped default
interest entirely — an understatement of liabilities. The corrected model is in the spec's
CORRECTION section. Nothing was posted on the bad draft.
