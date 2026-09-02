# CODEX — Two-date payment/clearing parity: NetSuite · McLeod

**Date:** 2026-09-01  
**Scope:** fresh primary-source parity research plus current-source grading. No production financial record, browser write, database write, migration, or posting change.  
**Owner-locked QuickBooks baseline:** payment initiation/issue date controls its accounting period and tax year; bank-cleared date only controls the statement reconciliation in which it is checked off.

## Executive verdict

| Reference | Payment/transaction date → GL | Bank-cleared/statement date → reconciliation | Settlement's own period → GL |
|---|---|---|---|
| NetSuite, ordinary payment run | **MEETS with configuration caveat.** The run explicitly carries Payment Date and Posting Period; generated payments inherit both. NetSuite permits administrators to configure whether transaction date may differ from posting period, so it is not an unconditionally date-derived invariant. | **MEETS.** Cleared/matched transactions are separately included in a reconciliation whose immutable Statement End Date becomes its Close Date and drives reconciliation history. | **No.** The selected bills/expenses do not supply the payment GL period; the payment run supplies Payment Date and Posting Period. |
| NetSuite, optional In-Transit Payments | **REFUTES the absolute rule for that optional mode.** Confirmation uses the bank-processing/deposit date and may update posting date and posting period; confirmation can also mark the payment cleared. | **MEETS, but confirmation and clearing may occur together.** | **No.** The originating payable/settlement period still does not drive the payment posting; the confirmation event's date/period does. |
| McLeod LoadMaster | **UNVERIFIED from public official documentation.** McLeod exposes distinct settlement `pay_date`, `loadpay_process_date`, `loadpay_transaction_date`, and `transfer_date` fields, and its paid-settlement endpoint filters by pay date. Its public accounting brochure confirms subsidiary-journal-to-GL integration. Neither source documents which field controls the GL posting period. | **UNVERIFIED from public official documentation.** Public sources reviewed do not document McLeod's bank-reconciliation cleared/statement-date mapping. | **Not publicly evidenced.** McLeod's API separates paid-settlement pay/transaction/process dates from operational ship/delivery and settlement-history fields, but that is insufficient to claim the GL mapping. |

## Primary-source findings

### NetSuite ordinary payment path

Oracle documents Payment Date and Posting Period as independent payment-run fields. Generated vendor payments inherit both from the run; they do not inherit a source bill's or expense report's period. Oracle also documents an accounting preference that may disallow, warn, or allow a transaction date outside its posting period. Therefore NetSuite supports the required separation from the source payable, but a configured Posting Period—not the date alone—is the actual GL-period authority.

Sources:

- [Creating a Payment Run](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_1145327665.html)
- [Payment Run Results and Errors](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_1145327668.html)
- [General Accounting Preferences](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1385293.html)

### NetSuite reconciliation path

Oracle documents clearing/matching as a state submitted to reconciliation. The Reconcile Account Statement workflow selects a Statement End Date; when the statement closes, that date becomes the immutable Close Date used by reconciliation and reconciliation-history reports. A register-cleared transaction without a statement date is not yet part of reconciliation history. This is a distinct date/state axis from the payment's posting date and period.

Sources:

- [Reconciling Transactions](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_20260810009.html)
- [Marking Transactions as Cleared](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_61132825793.html)
- [Troubleshooting Reconciliation History Reports](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1554407.html)

### NetSuite exception: In-Transit Payments

Oracle's optional two-stage payment feature is a material exception to the owner's expected universal rule. The initial intent-to-pay stage uses a Cash-in-Transit path. At confirmation, the bank-processing/deposit date can update the payment's posting date, posting period, and exchange rate; the same action may mark it cleared for reconciliation. NetSuite therefore does **not** universally preserve the original initiation date as the bank/AP posting date in this mode.

Sources:

- [In-Transit Payments](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1535398724.html)
- [Confirming an In-Transit Payment](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1539969060.html)

### McLeod

McLeod's official API exposes a paid-settlement history search keyed by `pay_date`, and its settlement-history row exposes separate `pay_date`, `loadpay_process_date`, `loadpay_transaction_date`, `transfer_date`, ship/delivery dates, and payment status/number fields. Its official LoadMaster brochure states that operational activity flows through subsidiary journals into the integrated GL. Those sources establish that McLeod models multiple dates and an integrated accounting spine. They do **not** establish which date controls the GL period or which cleared date assigns a bank statement/reconciliation. No `MEETS` verdict is awarded without a licensed manual or live licensed walkthrough.

Sources:

- [McLeod Settlement History API](https://tms-dsly.loadtracking.com/ws/docs/services?operation=getSettlementHistory&role=-1&service=SettlementService)
- [McLeod settlement-history row](https://tms-dsly.loadtracking.com/ws/docs/types?type=com.tms.common.loadmaster.tablerows.RowDrsSettleHist)
- [McLeod LoadMaster Enterprise — Back Office](https://assets-global.website-files.com/5eec27d7f84527188bccb9c4/5f9b03a7917ad04358efc239_LoadMasterEnterprise_20200831_Email%20%281%29.pdf)

## IH35 current-source grade

### `GAP → BLOCK` — `SETL-GL-DATE-DERIVED-FROM-SETTLEMENT-PERIOD-END`

The current settlement posters use the settlement's own work period as the GL date:

- `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts` inserts the settlement JE with `entry_date = settlement.period_end`.
- `apps/backend/src/driver-finance/settlement-payrun-close.service.ts` passes `entry_date: settlement.period_end` to the posting path.

That is precisely the prohibited model. A settlement period says which work is included; it is not the date the payment was issued. NetSuite's ordinary payment path independently supplies Payment Date and Posting Period, so IH35 is below that reference.

**Required block:** introduce one canonical immutable payment-issued/business date at the authorized pay/send transition, use it for bill-payment and cash/clearing JE dates and closed-period validation, and forbid `settlement.period_start/period_end` from supplying a payment JE date. The settlement period remains descriptive/source scope only. Guard both posters, planted mutation: replace payment-issued date with `settlement.period_end` and require failure. Financial design/build owner: CC-1.

### `GAP → BLOCK` — `SETL-TAX-YEAR-USES-CLEARED-DATE`

`apps/backend/src/tax-documents/box1-aggregation.service.ts` groups compensation into a tax year using `COALESCE(s.payment_cleared_at, s.paid_at)`. A payment issued on December 31 and cleared January 2 is therefore moved into the later tax year once `payment_cleared_at` is populated. This contradicts the owner-confirmed QuickBooks baseline and makes reconciliation timing rewrite tax classification.

**Required block:** annual paid-compensation aggregation must use the immutable payment-issued/paid date, never cleared/reconciled date. Cleared date remains reconciliation evidence only. Guard the year-boundary case (issued Dec 31, cleared Jan 2) and require the amount to remain in the issue-year bucket. Financial/tax owner: CC-1.

### `MEETS structurally, proof incomplete` — reconciliation session axis

IH35 reconciliation sessions have independent `period_start/period_end`, while bank worklists use `banking.bank_transactions.transaction_date` and matching does not rewrite journal-entry dates. That is the correct two-axis shape. However, the schema currently names the imported bank date `transaction_date`, not `cleared_date`, and this audit did not run a production mutation or create any financial record under the no-seat-fixtures law. Live proof remains blocked on an owner-created money-out row.

## Answer to the owner's direct question

- **NetSuite:** no, the settlement/source payable's own period does not drive the payment GL date. Payment Date and Posting Period come from the payment run. Optional In-Transit confirmation may instead use the bank-confirmation date/period.
- **McLeod:** public official evidence reviewed is insufficient to confirm the GL-date driver. Its distinct pay/process/transaction dates make a settlement-period driver unlikely, but that is an inference and is not credited.
- **IH35 today:** yes, two settlement posting paths incorrectly use `settlement.period_end` as the JE date. This is a confirmed source-level gap and must be removed; no product fix was authored in this parity pass.

