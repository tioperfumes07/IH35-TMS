
---

# OWNER RULING — 2026-10-02 — FUEL CARDS ARE BANK ACCOUNTS. BANKING POSTS THEM. NOTHING AUTO-POSTS.
Claude Lead. Measured live on br-fancy-credit-akjnd07a under bypass_rls. This CANCELS part of CC-2's
stated plan before it is built.

## THE OWNER'S WORDS, VERBATIM

> "THEY ARE IMPORTED AND WORK AS A BANKING OR CREDIT CARD BANK. THEY MUST BE MATCHED TO A TRANSACTION
> OR CATEGORIZED IN BANKING."

## WHAT THAT MEANS — AND WHAT IT CANCELS

Relay and Dreamline are **bank / credit-card accounts**. Their fills are **bank lines**. A bank line
is not a document and it does not post itself. It posts **only** when it is matched to a transaction
or categorized in Banking. That is the same path every other bank line takes.

**CC-2 — these two items in your plan are CANCELLED. Do not build them:**

1. ~~"Every Relay fill posts... It posts in the same database transaction as the save, and posts on
   arrival through a Relay webhook receiver."~~ **No.** A fill arriving does not post. It arrives as a
   bank line and waits to be matched or categorized. Build the receiver so the line **lands**; the
   posting is Banking's, triggered by the match or the categorization.
2. ~~"A catch-up run for the existing 119 fills... goes through an AUTH block before it runs."~~
   **No.** That is seeding, and the owner has said more times today than I can count that nobody
   seeds. The 119 fills become 119 bank lines to be matched or categorized. He does that in Chrome.

**What you DO build:** the categorize-and-match engine, for every bank account including the two
cards. A line is matched to the document that created it, or categorized to an account with its
unit, driver and load — and *that* is what writes the GL entry, in the same transaction as the match.
This is the same engine the 2170 clearing problem needs. One engine, every account.

## YOUR NUMBERS, VERIFIED — AND WHERE YOU AND CC-1 DISAGREED

CC-2's Relay figures are **exact**: `integrations.relay_fuel_transactions` USMCA = **119 rows,
$53,654.14, and 75 carry `posted_to_gl = true`**. The lying flag is real: 75 rows claim posted with no
journal entry behind them. That flag is a defect in its own right — a boolean that asserts a GL fact
it cannot prove. Fix it so it is derived from the existence of the entry, never set by hand.

CC-1 and CC-2 reported different bank-line counts (946 vs 951). Measured now, USMCA across all
accounts: **951 bank_transactions**, 853 `for_review`, 98 `matched`, **105 with `categorized_at`
set, only 6 with a `categorization_gl_account_id`, and 0 with `reconciliation_cleared`.** Use those.

## THE BANK ACCOUNTS, MEASURED — ONE THING CC-1 FLAGGED IS ALREADY HANDLED

```
account_name            class        GL     lines   balance      state
Amex-Scentsx            credit       2500       0         0.00   active
Dreamline Diesel Card   credit       2510     397         0.00   active
Faro Cash Reserve       depository   1235       0         0.00   active
Faro Escrow Reserve     depository   1236       0         0.00   active
Faro Factoring - USMCA  depository   1296       0         0.00   active
Petty Cash              (null)       1005       0         0.00   active
Relay Fuel Wallet       depository   1295      76      -123.45   active
USMCA FREIGHT           depository   (none)     0        92.68   INACTIVE + HIDDEN
USMCA FREIGHT           depository   1000     478    12,152.73   active
```

**CC-1: the "second USMCA FREIGHT with no GL account, which looks like a duplicate" is already
deactivated and hidden, with 0 lines.** It is not a live defect and it is not yours to fix. Leave it.
This is what getting current prevents — a day spent on a row somebody already retired.

**NEW FINDING, CC-2, AND IT TOUCHES YOUR FACTORING WORK:** Faro Escrow Reserve's bank account points
at GL **1236**, but your `factoringBookReserveCents` helper reads **1230 + 1235**. 1235 is Cash
Reserve, 1236 is Escrow Reserve, and I see no 1230 in the bank-account map at all. Either the helper
is reading the wrong account for escrow or 1230 is a third reserve account. Measure it and say which.
Every reserve figure on Factoring and Banking depends on that answer. Do not guess it.

**`Relay Fuel Wallet` balance −$123.45 is a placeholder**, as CC-2 said, and `Petty Cash` has
`account_class` NULL while every other account has one. Both are reported, neither is fixed by
seeding a value.

## CC-1 — YOUR BANK-VS-GL FINDING IS THE REAL ONE. KEEP GOING.

> USMCA FREIGHT (1000): feed 473 lines net −$2,938.87 · GL +$152,394.11 · GL fed by expenses only
> (1,464 postings), 12 advances, 5 manual JEs. No deposits, no settlement payouts, no factoring.

That is the single most important number anyone has produced today. The operating bank's GL is built
**entirely from app-created documents** and **nothing from the feed has ever been matched**, so the
two sides were never going to agree. Your own conclusion is the right one and I am endorsing it:

> "changing settlement or advance posting now, before banking is connected, would make it worse."

**Correct. Hold.** Banking connects first. Then 2170, then the settlement chain. You already know
2170's −$71,215.96 has an unproven cause; this is why. Finish the rulings read, then give me the one
grounded state-and-plan you promised. Build nothing before that.

## WHAT I GOT WRONG, SO NOBODY REPEATS IT

I carried the 09-28 gap register into live orders without re-measuring it. G-02 "accounting.bills = 0,
there is no A/P subledger" and G-03 "bill_payments = 0" were true on 09-28 and are false now — there
are 93 USMCA bills and 130 bill payments, and 136 per-load driver bills numbered as their loads. CC-1
was about to rebuild a working subledger because I told it to. That is drift I caused.

The rule from here: **no order cites a register, a doc or a prior round as its evidence. Every order
carries a live measurement taken the same hour, or it does not go out.** That applies to me first.

## STANDING
Nobody seeds, feeds or backfills anything, anywhere, for any reason including proof — the owner
verifies and seeds himself in Chrome when every job is fully and totally done. No handoffs; each seat
completes its own build. ROUND 43 lifted. Factoring empty and staying empty. Manual JE `43d6f4bf`
($166,743.94) still to be voided then purged. Do not touch posting `4cf4ab49` (CR 4200 $4,000, real
self-carried revenue).
