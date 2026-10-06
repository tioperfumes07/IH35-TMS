# INBOX-CURSOR — Claude Lead · written 2026-10-06

READ THIS FILE AT THE START OF EVERY ROUND. The Lead writes here directly; the owner does
not paste orders any more. If it is not in this file or in your OUTBOX, it was not ordered.

RULE: write every result to docs/bus/OUTBOX-CURSOR.md. The Lead reads the bus from origin/main.
If it is not in the bus, it did not happen and the Lead cannot see it.

## YOUR OPEN ORDERS — full text in these files, same content, both locations:

  ~/Downloads/10-06-2026-CURSOR-BACK-ARROW-AND-MODULE-INTEGRITY.md
  ~/Downloads/10-06-2026-CURSOR-MONEY-UI-ENGINES-NOW.md
  ~/Downloads/10-06-2026-CURSOR-VISUAL-CLOSEOUT.md
  ~/Downloads/10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md

CURSOR — BACK ARROWS AND MODULE INTEGRITY, EVERY MODULE · ROUND 435-CUR

OWNER, 2026-10-06: "NOT ALL MODULES TABS HAVE THE CORRECT BACK ARROW... IT SHOULD NOT TAKE YOU TO
ANOTHER MODULE, IT SHOULD TAKE YOU TO THE SECTION, BUT WE SHOULD BE IN THE BANKING MODULE."

THE LAW, stated once: a back arrow NEVER crosses a module boundary. From anywhere inside Banking you
land somewhere inside Banking. Same for Accounting, Dispatch, Fleet, Safety, Maintenance, Legal,
Drivers, Customers, Vendors, Factoring. If a leaf has no parent inside its own module, the module
home is the answer -- never another module, and never history-back.

1. EVERY MODULE, EVERY LEAF. CC-1 mounted the breadcrumb app-wide from route-parent data (#25541) and
   Devin's guard reports 542/542 routes carry a structural parent. So the DATA to do this correctly
   already exists -- use that same structural parent for the back arrow instead of navigate(-1).
   Devin already found two routes doing history-back (SafetyLayout, NotificationPreferencesPage);
   assume there are more and sweep for the pattern, not for those two files.

2. CUSTOMERS AND VENDORS specifically -- owner named them. Click every tab on /customers/:id and
   /vendors/:id and confirm each renders, each stays in its module, and the back arrow returns to the
   list, not to Accounting. Report any tab that renders nothing.

3. GUARD IT: a back arrow whose target resolves to a different module's route prefix than the page it
   sits on is a FAIL. That is a static check against the route manifest and it must be shrink-only.

DO NOT use navigate(-1) anywhere. History-back is not a back arrow -- it takes you wherever you came
from, which is exactly the owner's complaint.

DONE LINE: PR · squash sha · deploy id · the count of routes whose back target changed · the guard
PASS line verbatim · and say plainly the owner confirms in Chrome.
CURSOR — MONEY UI, MEASURED OPEN ITEMS · ROUND 432-CUR
Owner order 2026-10-06. You reported idle 10-05 20:25Z. Here is the board row.
Deadline 2026-10-06 20:00 Laredo (2026-10-07 01:00Z). CI is down; local gates ARE the record.

EVERY NUMBER BELOW I MEASURED ON TIP MAIN ebfe7eb91 TODAY. Do not re-derive; do close.

1. MULTI-SELECT IS NOT APP-WIDE. MultiSelectDropdown appears in 28 of 1,222 page files. The owner has
   asked for multi-select in banking filters, match candidates, status filters and account filters
   repeatedly. Sweep the money surfaces first: banking transactions, match candidates, bills,
   expenses, invoices, settlements, register. One PR per surface group, each with a guard that counts
   coverage and is shrink-only in the wrong direction.

2. CATEGORIZE / MATCH IS STILL INLINE. The only Modal in BankTxCategorizationPage is
   "Skip / investigate". The owner's words: in QuickBooks it is a popup; here the rows above and below
   plus the categorize and match boxes all stay on screen and the competing numbers confuse. Make it
   a modal, or dim everything else. This is B5 and it has been open since 10-03.

3. NATURAL-SIGN RENDERING HAS ZERO IMPLEMENTATION. grep for naturalSign / natural_sign across
   apps/frontend/src and apps/backend/src returns nothing. Every balance surface must render the
   natural sign. Missing renders as an em dash, never 0, never -$0.00.

4. NO QBO DATE OR NUMBER FORMAT LAYER. apps/frontend/src/utils has no format/money/date helper, and
   no date picker in apps/frontend/src/components offers a year selector (no captionLayout, no
   showYearDropdown, no yearSelect) — which is exactly the owner's "calendars cannot change the
   year". Build ONE format module (date, number, money, tabular-nums) plus a year-selectable date
   picker, and repoint the money surfaces to it. One PR, one guard.

5. BILLS PAGE STILL RENDERS TWO TABLES. BillsPage.tsx names driver_bills 5 times alongside
   accounting.bills. Two tables with different columns on one screen. Presentation decision: tabs or
   two pages. Pick one and ship it. Also: filter boxes not uniform height, date filters wrong.

6. r392 AND r388 ARE NOT ON MAIN. git grep TILE_BUCKET_LIMIT on origin/main returns nothing
   (banking KPI tiles QBO-style) and so does suggestionIsAction (the QBO action column where the
   suggestion IS the action). Both were built by a seat and never landed. Rebuild them on main.

7. 89 MONEY CELLS STILL UNWIRED. verify-money-cells-click-through is green at a shrink-only ceiling
   of 89 — green because the ceiling matches, not because the work is done. Every money cell drills
   to its transaction. CashFlowStatementPage carries no account_id so its cells cannot drill at all;
   that one needs a backend field.

CONTEXT YOU NEED: 368 of 1,222 page files have sortable headers and 79 have onRowClick. The owner's
"everything clickable, sortable headers" is a long sweep, not a fix. Report the count each PR moves.

DO NOT
- Do not touch the palette per component. D1/D2 (white boxes too white, unselected state must stop
  being pure white) is ONE PR: a tokens file plus the verify-section7-palette-financial baseline
  change together. That guard is green at 7 off-palette classes, frozen — change it deliberately or
  not at all.
- Do not raise a shrink-only ceiling to pass.

DONE LINE, per item: PR number · squash sha · deploy id + deployed sha · the before/after count the
guard prints · and for a visual change, say plainly that the owner must confirm it in Chrome.
CURSOR — VISUAL CLOSEOUT, THE HARD FOUR · ROUND 433-CUR
Owner 2026-10-06: close every visual item. This is first; the money-UI box 432-CUR items not listed
here stay behind it. Deadline 2026-10-07 20:00 Laredo. CI is down; local gates ARE the record.
Read 10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md before the first line of code.

1. CATEGORIZE / MATCH BECOMES A POPUP. Measured: the only Modal in BankTxCategorizationPage is
   "Skip / investigate"; the categorize and match boxes are still inline with rows above and below.
   Owner, 10-03: "in quickbooks it is a pop up window here we have it in the same screen and that
   confuses with so many numbers." Modal, or dim everything else. Open since 10-03.
   Also in the same PR: B6 every box in Categorize fully linked, and B3 match candidates filterable
   BY TRANSACTION TYPE (all transactions / expense / bill / invoice / …) with a multi-selector.

2. ONE QBO FORMAT LAYER + A CALENDAR THAT CHANGES THE YEAR. Measured: apps/frontend/src/utils has no
   format / money / date helper, and NO date picker in apps/frontend/src/components offers a year
   selector (no captionLayout, no showYearDropdown, no yearSelect). That is exactly the owner's
   "calendars cannot change the year", and it is why number and date formats drift per page. Build
   ONE module (date · number · money · tabular-nums) plus a year-selectable picker, repoint every
   money surface, and guard it so a page cannot format money by hand again.

3. REBUILD r392 AND r388 — both were built by a seat and NEVER landed. git grep on origin/main:
   TILE_BUCKET_LIMIT -> nothing (banking KPI tiles, QBO style). suggestionIsAction -> nothing (the
   QBO action column where the suggestion IS the action). Rebuild on main, with a guard each.

4. BANKING MATCH DESCRIPTION CARRIES JUNK — B7. Owner saw `session 7a7d1da9-aa5b-4de7-b` inside a
   match recommendation description. I could not find it in link-suggestions.routes.ts, so it is
   either fixed or built somewhere else. CHECK IT IN CHROME on /banking, and if an internal id still
   reaches a description, kill it at the writer and guard the shape.

DO NOT
- Do not touch the palette. CC-1 owns the single tokens PR; you consume the tokens.
- Do not build a second format module. If one lands from another seat first, use it.
- Do not raise a shrink-only ceiling to pass.

DONE LINE per item: PR number · squash sha · deploy id + deployed sha · the guard PASS line verbatim ·
and for each visual, say plainly that the owner confirms in Chrome.
