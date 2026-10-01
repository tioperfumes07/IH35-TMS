# ORDERS 2026-10-01 — BANKING REGISTER SET (owner click-through of QBO, recorded by the Lead)
Owner, verbatim: "this is how the register for each account, expense, liability, bank should be like,
functioning connectivity etc." · "very important to build, follow for the batch transactions".
Source of truth: docs/design/2026-10-01-QBO-REGISTER-MECHANISM-SPEC.md (§1–§24d). Read it whole first.
Owner: CURSOR, end to end (screen + route + read model + any migration in HH 12–23), under
2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md. No handoffs. No business-data writes
beyond what the user does through the screens (this IS the app the owner will seed through).
Where it sits in your queue: after the MAINTENANCE module (in flight), before Driver profile — the
owner called it very important; the Lead will confirm the order with him and post it in NOW-CURSOR.

## B-1 ACCOUNT REGISTER (one component, every account type) — spec §1–§4, §11
- Chart of accounts page: No. | Name | Type (+feed badge) | Detail type | Description | Book balance |
  Bank balance | [View register ▾ · Edit · Make inactive · Run report]. Two balances side by side.
- Register header: account selector · Bank balance (feed) vs ENDING BALANCE (book) · "Reconciled
  through <date>" · [Bank transactions] [Reconcile] · paging 100/page with "Go to page N of M" ·
  filter chip (status / type / date / payee) · print / export / gear (column chooser).
- Row = two lines: DATE | REF NO. | PAYEE | CLASS(unit) | PAYMENT | DEPOSIT | ✓ | 📎 | BALANCE over
  TYPE | ACCOUNT (full path) | LOCATION. ✓ = blank / C / R only. BALANCE runs only in date order
  ("n/a" otherwise). Sort by any header.
- Row click = inline edit of the same fields + attachments block + [Delete] [Edit] [Cancel] [Save].
  Edit opens the ORIGINAL DOCUMENT (expense / bill / bill payment / deposit / transfer / check /
  JE / invoice / payment) with its "online banking match" banner (§5) and [Unmatch].
- ✓ click toggles blank↔C; R is locked behind a warning (reconciliation report shows the change).
- Register must work for: bank, savings, cash, credit card, loan, factoring reserve, A/P, A/R,
  expense, income, liability, equity. Linkage: every row resolves to accounting.journal_entry_postings
  + its source document; class → mdata.units; payee → mdata.vendors / customers / drivers.

## B-2 RECONCILE — spec §6, §8
- Start: account + statement ending date + ending balance (+ service charge / interest optional).
- Header arithmetic always visible: STATEMENT ENDING − CLEARED = DIFFERENCE (orange until $0.00);
  cleared = BEGINNING − N PAYMENTS + N DEPOSITS, counts shown.
- Grid: DATE | CLEARED DATE | TYPE | REF NO. | ACCOUNT ("- Split -" when multi-line) | PAYEE | MEMO |
  PAYMENT | DEPOSIT | ● cleared. Tabs Payments / Deposits / All. Filter popover: Find (memo, ref,
  $amt, >$amt, <$amt) · Cleared status · Transaction type (our full document-type list) · Payee ·
  Date From/To · Reset / Apply. JE lines on the account are reconcilable too.
- Row click opens the document; coming back recomputes. [Save for later] keeps partial state (C).
  [Finish] only at $0.00 → rows R, "Reconciled through" updates, reconciliation report stored and
  reopenable (beginning, cleared payments/deposits, ending, uncleared as of date).

## B-3 BANK TRANSACTIONS (feed) + MATCH — spec §16–§21
- Banking home: one card per connected account (feed balance · updated-ago · for-review count ·
  book balance) + per-account connection-error strip with provider error and fix / disconnect /
  request actions. Never a silently stale feed.
- For review / Categorized / Excluded tabs. Money in / Money out grouping (toggle). Columns: DATE |
  BANK DETAIL (verbatim) | PAYEE (guess, editable) | CATEGORIZE OR MATCH (suggestion or "N match
  found" + candidate type/date/amount/payee) | SPENT | RECEIVED | 📎 | ACTION [Add]/[Match].
- Row expand: ○ Categorize (payee, category, class, memo, split, attachment) · ● Match ·
  ○ Record as transfer · ○ Record as credit card payment · [Exclude]. "Suggested matches" filter.
- FIND OTHER MATCHES modal (§19): bank row header + amount; chips Suggested / by type; Search ·
  Date range (default ±90 d) · Record type · Filters · Customize; candidate grid ☐ Date | Ref No. |
  Transaction Amount | Payee | Open Balance | Payment (editable); multi-select; arithmetic box
  "Bank transaction amount / Selected amount / Difference"; "If needed, resolve the difference" rows
  (date, payee, category, class, location, memo, amount — our bank_transaction_splits); [Match]
  enabled only at difference $0.00. Matching sets ✓=C and the document's banking-match banner.
- Categorized tab: ADDED OR MATCHED provenance ("Added to: Expense <date>" / "Matched to: multiple
  transactions" / "-Split-") + RULE + [Undo] that unwinds the match or deletes the auto-created doc.
- Gear: columns, grouping, editable date, copy bank detail to memo, suggested categorization, page size.

## B-4 CHECK CREATOR + BILL PAYMENT — spec §9, §10, §13, §14, §15
- "+ Create" global menu grouped Customers / Vendors / Drivers-Team / Loads / Other (§12).
- New check: Payee ("Who did you pay?") → mailing address fills; Bank account with live balance;
  Check no. = next for that bank; Payment date; Print later; Location; Settlement No; category
  lines; item lines; memo; attachments; [Cancel] [Clear] · Print check · Order checks · Make
  recurring · More(Void, Delete, Transaction journal, Audit history) · [Save] [Save and close ▾].
- Choosing a payee with open documents opens the "Add to Check" drawer: cards per open bill /
  driver bill / settlement balance (number, date, open amount) with [Add] [Open] and [Add all].
  Add converts the check into a Bill Payment: "Outstanding Transactions" grid ☐ DESCRIPTION (bill #
  + date, link) | DUE DATE | ORIGINAL AMOUNT | OPEN BALANCE | PAYMENT (editable, partial ok);
  "Amount to Apply / Amount to Credit / Clear Payment"; header amount recomputes live.
- Driver bill = settlement (§14): header custom fields NB-Load Number, Settlement No, Truck No
  (+trailer), Pick Up / Delivery dates, Empty / Loaded miles, Origin, Destination, Work Order;
  one category line per pay component on its own account; "N payment made ($x)" badge; open balance.
- Auto-draft per user on every creator with "Restore draft" banner.

## B-5 RECLASSIFY / BATCH — spec §23–§24d
- Reclassify page: left = chart of accounts tree with PERIOD BALANCES (From/To); right = filters
  Type · Class · Filters · chips; [Find transactions]; grid of GL LINES ☐ DATE | TYPE | ACCOUNT NO. |
  ACCOUNT | MEMO/DESCRIPTION | NET AMOUNT; select-all per page; bar "N transaction lines selected:
  $sum"; [Reclassify] → modal Change account / class / location / vendor-customer (each optional,
  Apply disabled until one chosen) → each document re-posted through its own engine, one audit row
  per document carrying the batch id, batch undo.
- Batch transactions creator (+ Create → Other): spreadsheet grid, one row per document (expense /
  check / bill / deposit / settlement), paste from sheet, fill-down, per-cell validation, one Save →
  each row a real document via the single creator's engine; failed rows stay with the reason.

## DONE MEANS
Every section above live on ih35-tms-web, Chrome-verified by the Lead with one real USMCA row per
screen; linkage declaration in the PR; gate exit 0; no stub data; no money written by the build.
