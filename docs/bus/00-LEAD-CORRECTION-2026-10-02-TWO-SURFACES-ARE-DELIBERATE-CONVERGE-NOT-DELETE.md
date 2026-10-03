# LEAD CORRECTION — 2026-10-02 — DO NOT DELETE A SURFACE. ROUND 298's ORDER IS WITHDRAWN.

## I WAS WRONG TWICE ON THIS AND I AM FIXING IT BEFORE ANYONE BUILDS

**ROUND 297:** I wrote *"clicking a customer name does nothing."* FALSE — verified in the live DOM, the
button navigates to `/customers/684f5776-403b-422d-bc5e-2b44ae3b6a2c`. Retracted already.

**ROUND 298:** I wrote that the owner *"has never seen"* his customer/vendor changes because PartyBoard
renders by default, and told CC-3 to **collapse the two surfaces and delete one.** **That order is
WITHDRAWN. Do not delete anything.** `PartyListSwitch`'s own comment says it plainly:

```
/** One toggle, same position on every list: Regular (the board) is the default; Master-detail is the
    existing page. */
```

**Two views is DELIBERATE DESIGN, and the toggle is on the owner's screen.** I read a deliberate
feature as an accident and nearly had a seat delete it. Had CC-3 executed that order we would have
destroyed working behaviour to fix a problem that did not exist in the form I described.

## WHAT IS ACTUALLY TRUE — NARROWER, AND IT STANDS

Two surfaces for one entity, **diverging**:

| | PartyBoard (default, "Regular") | CustomersListView (behind the toggle) |
|---|---|---|
| Customer columns | **8** | **27** |
| Vendor columns | **8** | VendorsListView's full set |
| Money formatting | its own `toLocaleString` locals | `lib/money` |
| Export | its own CSV | the house export |
| Column chooser | its own gear | the house chooser |

The 27 include exactly the work the owner has been asking about: `reserve_held_cents`,
`factoring_fee_cents`, `factoring_interest_cents`, `late_fee_cents`, `finance_cost_total_cents`,
`finance_cost_pct`, `avg_days_to_pay_us`, `avg_days_to_pay_factor`, `avg_days_late`, `credit_limit`,
`health_tier_label`, `quality_flag_label`, FMCSA.

**So his changes are real, merged and ONE CLICK AWAY — behind a button labelled "Master-detail", which
is a layout word that says nothing about the 27 columns behind it while he is looking at 8.** That is
the actual defect: not hidden, *undiscoverable*, and the two views disagree on formatting.

## WHAT I ALREADY FIXED (UI-F9641, `4994ffa840`, tsc exit 0, not deployed)

PartyBoard carried four hand-rolled formatting locals in the file that renders the DEFAULT list, and
one of them was a real bug:

```js
const money = (cents) => (cents ? usd(cents) : "—");   // falsy-tests a NUMBER
```

**A real $0.00 rendered as an em dash** — a customer who has genuinely collected zero read as "no
data". C-37 is the opposite: missing is —, a measured zero is $0.00. On the Collected column that is
the difference between "nothing has been collected" and "we do not know". All three helpers now
delegate to `formatUsdCentsTable` / `formatNumberTable`, so both surfaces format money identically and
cannot drift. The toggle is renamed **"All columns"** with a title naming what is behind it.

## THE PERMANENT SOLUTION — CONVERGENCE, NOT DELETION. **CC-3, 1 of 1.**

1. **ONE COLUMN SOURCE.** Both surfaces derive their columns from one exported definition per entity —
   the governed set. The board renders a chosen SUBSET of it, declared as a list of keys, never its own
   parallel column array. A column added to the governed set is then automatically available to both,
   and the owner's next change cannot land in only one place.
2. **ONE EXPORT PATH.** The board's CSV and the list's export are the same function over the same
   columns. Two exports of the same roster that disagree is an audit problem.
3. **ONE COLUMN CHOOSER**, the house gear, both surfaces.
4. **Formatting is done** — UI-F9641 above. Do not re-do it; do not re-add a local formatter.
5. **ONE GUARD, replacing the deletion I wrongly ordered:** a module's list surfaces must draw from the
   same exported column definition. The push fails if a second parallel column array is declared for an
   entity that already has one. That is what stops them diverging again — not deleting one of them.

**Nothing is deleted. Both views stay.** The owner chose to have a fast 8-column board and a full
27-column list; our job is to make them the same data, the same money format and the same export —
not to take one away.

## STANDING

Factoring at $0.00 reserve / $0.00 purchased / 0 posted wires is CORRECT — the owner has created no
purchase. Not a defect; nobody "fixes" it into existence. Nobody posts, seeds, feeds, matches or
categorizes. Build only. The owner verifies in Chrome when every build is complete.
