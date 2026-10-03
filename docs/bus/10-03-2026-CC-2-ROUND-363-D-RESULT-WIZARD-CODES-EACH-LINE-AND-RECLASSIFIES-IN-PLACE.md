# CC-2 — ROUND 363-CC2-D RESULT — THE WIZARD CODES EVERY LINE AT CREATION, AND RECLASSIFIES IN PLACE

2026-10-03 · one PR.

## What the owner gets in the Settlement Creator

- **Fuel, company-expense and driver-reimbursement lines** carry three fields, picked as ids and never typed:
  - **Item:** fuel lines gain it; expense lines already had it.
  - **Account:** the whole chart, both sides, zero balances included. It reads the same account tree as
    Accounting › Reclassify (363-CC2-A rules). Blank means the item's default account.
  - **Load:** the load picker replaces the free-text "Load No." box.
- **After Post the drawer stays open on the posted lines.** Select any of them, pick the account they belong in, give a
  reason, and Reclassify. It goes through `applyReclassify`, the one engine: same writer, same batch, same audit record,
  and undo from Accounting › Reclassify. There is no wizard-local copy. The drill map and the "not reclassifiable" rule
  moved to `lib/reclassifyDrill.ts`, so both surfaces share them.

## Defects closed on the way (measured in source)

| # | Defect | Fix |
|---|---|---|
| 1 | The drawer **stripped `item_id`** before sending; the item picked on a company expense was thrown away. | It is sent. |
| 2 | Every company expense and driver reimbursement **posted to a hard-coded 6100**, whatever item was picked. | The account now comes from the pick: the account, else the item's default account, else the documented 6100 fallback. One resolver, `accounting/line-item-account.ts`, serves both the post and the preview. |
| 3 | The **preview showed fuel against `company_fuel_advance_expense` / 5000** while the post used the fuel item's account. | The preview now uses the post's own rule (`resolveFuelLineAccount`). |
| 4 | **Driver-reimbursement settlement lines carried no load and no account.** At close, the load was assigned by date and the account by a NULL reimbursement type. | The line carries `load_id` and `posting_account_id`, and the close reads the line's account first. |

## Guard

`verify-wizard-and-reclassify-share-one-writer.mjs` (static) checks:

- one reclassify writer, and one API caller;
- the drawer renders the panel, and the panel uses the engine;
- no local copy of the drill rule;
- Post does not close the drawer;
- `item_id` is not stripped;
- preview and post share the resolver;
- the reimbursement account reaches the close.

Negative controls fail as designed: Post closing the drawer, and a second POST to `/reclassify/apply`.

## Answer to the owner: does the register show BOTH legs of a reversed pair?

**Yes.** Both legs are listed, labelled "reversed" and "reversal", and are not selectable for reclassify. Measured on
USMCA (direct endpoint):

- 3,083 reversal pairs; 1,554 have both legs inside the default window (2026-09-01 .. 10-03).
- **0 pairs are split across the window edge.** When a different window does split one, the outside leg sits in the
  opening balance.
- `verify-reclassify-list-sums-to-its-balance` PASSES live: for all 37 accounts with activity, the listed rows sum to
  the balance. A reversed account therefore never shows a phantom balance.

## Not in this PR (next, in order)

The register's Truck / Driver / Unit / Trailer / Vendor columns, each filterable and multi-select with the same
component as the account and status filters, plus a column chooser. The order arrived cut off at its start, so
items (1)–(3) of it are not known to CC-2.
