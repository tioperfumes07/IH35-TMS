# ROUND 363 — CC-2 — THE RECLASSIFY ENGINE, ITS OWN ACCOUNTING TAB, AND THE WIZARD SURFACE
Lead · 2026-10-03 15:13Z · read `10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md` first

The owner measured the current screen live and it is not built. Clicking Fuel opens nothing. Clicking Diesel
opens nothing. No header sorts. The account pane is too narrow to read an account name. There is no
P&L / Balance Sheet selector. There is no by-item option. This round closes all of it.

**One engine, two surfaces.** The engine is the document-edit service (CC-1's posting side, 363-CC1-D). You
build the surfaces and the batch orchestration. You never write a posting directly.

---

## 363-CC2-A — RECLASSIFY TRANSACTIONS AS ITS OWN TAB IN ACCOUNTING

- Its own tab in the Accounting subnav. Not a panel inside another screen.
- **P&L / Balance Sheet toggle**, driven by the account's QBO **account type**; detail type travels with it.
  - Balance Sheet: asset, liability, equity.
  - Profit & Loss: income, cost of goods sold, expense, other income, other expense.
- **LAW 363.8 — every account in `catalogs.accounts` appears, including accounts at 0.00.** An account is never
  hidden because nothing posted to it. The owner must be able to see Reefer Diesel at 0.00 *before* he
  reclassifies 40 loads into it. Hierarchy shown as a hierarchy: sub-accounts indented under their parent, the
  parent's own balance separate from the rolled-up total, QBO-style.
  - Inactive accounts: hidden by default, revealed by an explicit "include inactive" toggle, labelled inactive
    when shown. Inactive is not zero. `is_active = true` is the canonical column — never substitute another.
  - Every balance is **derived from the GL postings.** No stored total, anywhere.
- **by-account / by-item switch on the transaction list itself**, not only on the account tree. The owner needs
  both: a wrong categorization and a wrong itemization are both fixable in this one screen.
- **Everything clickable.** Every account name, document number, item and amount opens the actual transaction.
  This is the app-wide standard: in QuickBooks everything is clickable and goes somewhere. **Required value:**
  zero non-interactive cells on this screen that name a record.
- **Sortable headers** on every column, ascending and descending, with the sort indicator visible.
- The account-and-balance pane **wider** — account names are cut off today. Measure the longest account name in
  `catalogs.accounts` and size for it; do not pick a number and hope.
- **Every QBO document type** present in the batch, with a type filter inside the batch: invoice, sales receipt,
  receive payment, estimate, credit memo, refund receipt, bill, bill payment, check, expense, purchase order,
  vendor credit, journal entry, transfer, deposit.
- **Multi-select account filters, and not only here — everywhere in the app.** A single-select account filter is
  a defect wherever it appears. Sweep every filter bar and report the count you changed.

**PR:** one. **Guards:** `verify-reclassify-shows-every-coa-account-including-zero.mjs` (live: the count of
accounts rendered equals the count in `catalogs.accounts` for that side, zeros included) and
`verify-account-filters-are-multi-select.mjs` (static, every filter bar).

## 363-CC2-B — THE THREE SELECTORS (LAW 363.3)

| Selector | Example | What moves |
|---|---|---|
| by account | Repairs -> Tires | the debit account on the document line |
| by item | Diesel -> Reefer Diesel | the item, its mapped account, and all of 363.4 |
| by load | 13515 -> 13520 | the document's load and the `load_id` stamp on its postings |

Same mechanism for unit and driver.

- **We pass QBO deliberately here.** QBO's Reclassify tool changes account and class only and refuses
  item-based lines. We allow items, in batch. State that in the PR so nobody "fixes" it back later.
- Every reclassify is **one transaction** through the document-edit service: restate the line, reverse the old
  posting, re-post the new one, both sides audited. **Never a direct UPDATE on a posting.**
- Refusals are narrow (LAW 363.5): A/R and A/P account lines, inventory, payroll. **A paid bill's expense line
  is freely reclassifiable** — no void, no unmatch, no re-apply, no re-match. Refused rows show the **reason on
  the row**, greyed, QBO-style, never silently omitted.
- **Owner override button** on the refused classes. Audited: who, when, from, to, and the refusal it bypassed.

## 363-CC2-C — DIESEL -> REEFER DIESEL MOVES FOUR THINGS (LAW 363.4)

Owner confirmed reefer fuel is not used to calculate IFTA. One transaction moves all four:

1. the item,
2. the expense account it maps to,
3. the **IFTA-taxable flag** -> not taxable,
4. the **unit linkage** tractor -> **trailer**, and the cost basis **engine hours, not miles** — a reefer fuel
   line must not divide into a cost-per-mile figure at all.

**Do not wire the IFTA treatment from memory.** Verify against the IFTA agreement text and Texas's own rules,
cite the source in the PR. If you cannot get the source, leave the flag unwritten and report it. We do not
build a tax position out of recollection.

**PR:** one. **Guard:** `verify-reefer-fuel-is-not-ifta-taxable-and-costs-the-trailer.mjs` — live, on real
reefer fuel lines after a reclassify.

## 363-CC2-D — THE SAME ENGINE INSIDE THE SETTLEMENT WIZARD CREATOR

This is the one that matters for the re-upload. The owner is recreating every load and expense through the
wizard within hours.

- The wizard's fuel, expense and charge lines expose the **item**, the **account** and the **load** at creation,
  with the same account tree rules as 363-CC2-A — all accounts, zeros included, both sides.
- Reclassify is reachable **from inside the wizard**, on a line the owner has already entered, without leaving
  the wizard.
- Same engine, same writer, same audit record. Not a wizard-local copy of the logic. **If a second
  implementation exists, that is the defect.**

**PR:** one. **Guard:** `verify-wizard-and-reclassify-share-one-writer.mjs` — static.

## 363-CC2-E — ALSO YOURS FROM THE GATE RE-MEASURE (LAW 363.7)

These executed for the first time when the gate got its own credential, and they are surface guards:

`verify-combobox-listbox-z-index-above-drawers` · `verify-no-nested-modal-frames` ·
`verify-no-double-encoded-api-body` · `verify-qbo-connection-status-honest`

Plus still open from ROUND 360: the bank-feed state machine's eight transitions, the fuel gallon cap per unit
with **no automatic driver receivable** (the owner's rule: a fuel receivable against a driver is always asked,
never assumed; Relay and Dreamline fills normally run 120–150 gallons), and the Relay `dtstart`/`dtend` ingest
correction.

---

**Deadline:** 363-CC2-D by **2026-10-04 06:00Z** — the owner cannot re-upload correctly without it.
363-CC2-A, B and C by **2026-10-05 06:00Z**. E by **2026-10-06 06:00Z**.

**NOBODY SEEDS ANY DATA ANYWHERE** — not for proof, not for a test, in any entity. Prove on real USMCA rows or
report that you cannot.

**Linkage declaration required in every PR.**
