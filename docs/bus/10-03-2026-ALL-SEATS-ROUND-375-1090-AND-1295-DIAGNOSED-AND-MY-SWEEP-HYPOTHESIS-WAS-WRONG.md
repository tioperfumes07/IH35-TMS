# ROUND 375 — ALL SEATS — 1090 AND 1295 DIAGNOSED ON PRODUCTION, AND THE LEAD'S OWN HYPOTHESIS WAS WRONG
Lead · 2026-10-03 · measured on the DIRECT endpoint as `ih35_ci_readonly`, BEGIN READ ONLY, USMCA only

---

## 375.0 — I WAS WRONG ABOUT 1090 AND I AM SAYING SO FIRST

In ROUND 374 I told CC-2 to test this hypothesis first: that `sweepMatchedReceiptToBank` credits 1090 at match
time with no debit behind it.

**I measured it. There is not one sweep posting in 1090. The hypothesis is dead.** Had CC-2 spent the evening
on it, that would have been my error costing a seat its night. The real causes are below and they are
different in kind.

---

## 375.1 — 1090 UNDEPOSITED FUNDS, NET CREDIT 151,736.34 — THREE CAUSES, NOT ONE (CC-2 · CC-1)

```
source_transaction_type     n        debits       credits    first → last
fuel_event                255     16,485.10    108,602.28    2026-07-29 → 2026-09-21
journal_entry             160     92,242.18          0.00    2026-08-05 → 2026-09-24
escrow_account             16          0.00        500.00    2026-09-24
customer_payment            7     15,507.60          0.00    2026-08-26 → 2026-09-21
manual_je                   2          0.00    166,868.94    2026-09-24
TOTAL                     440    124,234.88    275,971.22    net  -151,736.34
```

**Read the first column before the amounts.** Undeposited Funds is one thing: **where a customer receipt waits
until it is deposited.** In QuickBooks exactly two things touch it — a receive-payment puts money in, a
deposit takes it out. Here, **only 7 of 440 postings are `customer_payment`.**

### (a) `manual_je` — 2 postings, credit **166,868.94**, all on 2026-09-24 — CC-1

Two hand-written journal entries carry more than the entire wrong balance. This is the **166,868.94 plug**
already named in `09-28-2026-ROUND-153-CORRECTED-1090-AND-THE-166868-PLUG.md`.

**A plug is not an explanation. It is the absence of one**, and it is the single most expensive line on this
board. Name what it was plugging, in what document, and why 1090 was chosen as the place to put it. Then it is
**reversed and voided** — never adjusted by a second hand-written entry. **No plugs. Ever.** If it turns out to
be load-bearing for something real, that real thing gets its own correct posting.

### (b) `fuel_event` — 255 postings, net credit **92,117.18** — CC-2

**A fuel purchase has nothing to do with Undeposited Funds.** Nothing about buying diesel involves a customer
receipt waiting to be banked. This is a **role mis-binding**: whatever resolves the credit side of a fuel event
is landing on `undeposited_funds` / `cash_clearing` instead of the fuel card or bank account the fuel was
actually paid from.

This is 365.1 exactly — **the role is the contract.** Find which role the fuel poster resolves for its credit
leg, what that role is bound to in `accounting.chart_of_accounts_roles`, and whether the binding or the poster
is wrong. Note 1090 is bound to **two** roles, `undeposited_funds` **and** `cash_clearing`. A poster reaching
for "cash clearing" and landing in Undeposited Funds is the most likely shape of this bug, and it would be an
honest mistake with a dishonest result.

### (c) `escrow_account` — 16 postings, credit **500.00**, all 2026-09-24 — CC-1

Escrow is a **liability held in trust** (2100 and its `2100-00-nnn` sub-accounts). It has no business crediting
Undeposited Funds. Same date as the plug and the same 09-24 window as the 3,908 unlinked postings — these were
very likely written by the same run. Name it, reverse it, void it.

### (d) `journal_entry` debits 92,242.18 against the fuel credits — CC-2

Nearly offsetting (b). That reads as someone having already corrected the fuel leg **with another journal
entry** rather than fixing the poster. **That is the patch pattern the owner has forbidden**: the symptom is
cleaned, the writer survives, and it comes back on the re-upload. Confirm whether these 160 postings are
corrections of the 255, and if so they are **reversed together with their cause**, not left as a second layer.

**Required value, before the purge:** 1090 holds **only** `customer_payment` debits and `deposit` credits.
Every other source is named, reversed and voided. The balance that remains is a **debit** — money genuinely
received and not yet banked — or zero.

## 375.2 — 1295 RELAY FUEL WALLET, NET CREDIT 33,839.80 — CONFIRMED: NOTHING FUNDS IT (CC-2)

```
source_transaction_type     n        debits       credits    first → last
expense                   128      2,228.17     36,067.97    2026-08-04 → 2026-09-24
TOTAL                     128      2,228.17     36,067.97    net  -33,839.80
```

**One source type. That is the whole finding.** A prepaid fuel wallet is an **asset**: you wire Relay money, the
wallet holds it, fuel draws it down. The draws are here — 128 expense postings crediting the wallet. **The
funding is not here at all.**

So **wallet funding has no posting path.** Every wire to Relay is either unposted or landing somewhere else,
and the book currently says we **owe** 33,839.80 on an account that should show what we **own**.

CC-2, Relay ingest is yours and you rebuilt it this session:

1. Where does a Relay **wallet funding / top-up** land today — a bank line categorized to an expense, an
   unmatched line still in For Review, or nothing at all?
2. Build the funding posting: **debit 1295, credit the bank account** the wire left from. That is the mirror
   of the draw, and it is the whole fix.
3. Reconcile 1295 against **Relay's own wallet balance** on the date, from Relay's statement — the outside
   number is theirs and we label it as theirs (store-vs-derive, case 5). If our derived balance and Relay's
   statement disagree after the funding posts, that difference is named, not plugged.

**Required value:** 1295 holds a **debit** balance equal to funding minus draws, and it ties to Relay's own
wallet balance on the date, with any difference named.

---

## 375.3 — WHAT THIS CHANGES ABOUT THE PURGE

Three of these four causes are dated **2026-09-24** — the same day as the 3,908 unlinked postings and the
AUTH-177 purge era. The purge will delete the settlement-created rows **but not the writers**, and the owner
re-uploads the same data within hours.

**So the order stands and it matters:** name every writer, fix the writer, reverse and void what it produced,
**then** purge. A balance corrected today by a hand-written entry comes back tomorrow with the data.

**Measured by:** `scripts/lead-pre-purge-baseline.mjs` and a per-account source breakdown on the direct
endpoint. Both committed. Anyone can re-run them; nothing here is remembered.
