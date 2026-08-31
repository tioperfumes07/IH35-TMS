# CODEX — Four-law reference parity: Search · Void · Money columns · Sort

**Date:** 2026-09-01  
**Scope:** parity research and current-spec/source grading only; no money mutation, no browser write, no migration.  
**References:** QuickBooks Online/Desktop, Oracle NetSuite, and McLeod LoadMaster/MPact.IQ. Public vendor documentation is cited inline. Where McLeod does not publicly document a behavior, this report says so rather than inferring it.

## Executive verdict

| Law | Strongest reference bar | IH35 verdict |
|---|---|---|
| Search | QuickBooks one-box financial search + McLeod Order/BOL/reference retrieval | **GAP → BLOCK** |
| Void | NetSuite reversal-aware reconciliation state machine | **GAP → BLOCK** |
| Money columns | QuickBooks zero-value void + NetSuite/QuickBooks open-item aging | **GAP → BLOCK** |
| Sort | NetSuite saved primary/secondary/third server ordering | **GAP → BLOCK** |

IH35's WORM/reversal-by-UUID rule is stronger than QuickBooks' permitted hard-delete path. That design advantage is not yet delivered consistently in list/detail/reconciliation behavior, so it does not erase the gaps below.

## 1. SEARCH

### What the references do

**QuickBooks.** QuickBooks Online's single Search field accepts combinations of transaction type, reference number, contact, date, and amount. Its documented searchable transaction fields also include memo, description, address, tracking number, product/service, class, location, and—on the full/advanced surface—account and custom fields. A phrase such as an invoice over a dollar amount from a contact/date period is parsed into preselected filters. The account register's Find field accepts amount, reference number, or memo. Numeric amount is therefore a first-class search input, not text compared against a formatted currency label. Sources: [Search transactions and other data](https://quickbooks.intuit.com/learn-support/en-ca/help-article/bank-transactions/search-transactions-quickbooks-online/L4hBemuUP_CA_en_CA), [Find transactions in account history](https://quickbooks.intuit.com/learn-support/en-ca/help-article/bank-registers/find-review-edit-transactions-account-history/L2zTRtQRZ_CA_en_CA).

**NetSuite.** Global Search searches account records/fields from one header box; it supports record-type prefixes and multiple keywords. It finds both document numbers and system transaction numbers, controlled by role/user preference. Numeric keywords are exact by default and `%` supplies prefix/contains matching. For more precise transaction retrieval, Quick Find accepts Name, Date, and Number, while Advanced Transaction Search exposes arbitrary criteria/result fields. The public documentation does **not** establish that a bare dollar amount in the one global box searches transaction amount, so amount parity is credited to Advanced Transaction Search, not claimed for Global Search. Sources: [Global Search overview](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_161899349589.html), [Global Search by document number](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1554367380.html), [Tips for effective global searches](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N637092.html), [Finding transactions](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N560124.html).

**McLeod.** LoadMaster's Customer Service view publicly documents search by **Order number, BOL, or reference number**. McLeod's Order Creation contract models reference numbers as typed values and explicitly distinguishes BOL (`BM`), purchase order (`PO`), customer order (`CO`), customer reference (`CR`), booking, delivery order, pickup reference, PRO/invoice, shipment, seal, and other reference classes. This is a richer freight-reference contract than treating every external number as generic text. McLeod's public material does not evidence single-box amount search. Sources: [Pricing & Order Management](https://www.mcleodsoftware.com/solutions/pricing-order-management/), [Order Creation reference-number qualifiers](https://innovationhub.mcleodsoftware.com/OrderCreationDataCodeLists).

### IH35 grade

Current invoice list search on `origin/main` matches only `accounting.invoices.display_id` and resolved customer name (`apps/backend/src/accounting/invoices.routes.ts`, list handler). It does not match total/open amount, PO, BOL, load/order number, memo, tracking/reference number, customer invoice reference, or typed freight references. The current Search law assignment says “shared search builder; amount parsed dollars→cents,” but the locked specification does not yet define:

- currency grammar (`1200`, `1,200`, `$1,200.00`, negative/parenthesized values), exact versus range behavior, or cents rounding;
- typed reference priority and collision display for invoice/order/PO/BOL/PRO/load numbers;
- whether one token searches both financial documents and freight orders;
- permission/entity filtering before ranking;
- an explanation when a numeric token is interpreted as amount versus document number.

### Block: `SEARCH-PARITY-01 — ONE-BOX-TYPED-FINANCIAL-AND-FREIGHT-SEARCH`

Build one company-scoped search grammar shared by invoice lists and universal search. It must search document/display number, customer, memo/description, exact normalized amount in cents, load/order number, and typed PO/BOL/PRO/customer-reference records; label the matched field in results; never conflate an amount with a document number silently; and guard split entity data. Acceptance: the QuickBooks field set above plus McLeod Order/BOL/reference behavior, with planted tests for `$1,200.00`, `1200`, `PO:123`, `BOL:123`, duplicate reference types, deactivated counterparties, and cross-company collisions.

## 2. VOID

### What the references do

**QuickBooks.** A void retains the transaction, changes its amount to zero, and marks it VOID/Voided. Delete removes it everywhere except the audit log and cannot be recovered. QuickBooks recommends void over delete for recordkeeping. Access is role/action controlled: administrators have full access; Advanced custom roles can separately grant transaction actions; accountant/bookkeeper roles receive accounting capabilities according to role. A wrong bank match can be undone/unmatched, returning the downloaded line to pending. If already reconciled, QuickBooks warns that changing it materially affects the books and requires unreconciliation/correction workflow. Sources: [Void or delete transactions](https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/void-delete-transactions-quickbooks-online/L5sZV8GYh_US_en_US), [User roles and access rights](https://quickbooks.intuit.com/learn-support/en-us/help-article/access-permissions/user-roles-access-rights-quickbooks-online/L66POfRrI_US_en_US), [Unmatch downloaded bank transactions](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-registers/unmatch-downloaded-bank-transactions-move-another/L71oaBb86_US_en_US).

**NetSuite.** NetSuite distinguishes two void mechanics. With “Void Transactions Using Reversing Journals,” it retains the source and creates an opposite journal; without it, it sets the source amount to zero. The document status becomes **Voided**. Record permissions govern whether the Void button appears (for example, edit permission for vendor prepayments). The bank behavior is explicit: a reversing-JE void leaves the original matched/cleared/reconciled and sends the reversing JE to Transactions to Match; a zero-amount void unmatches/unclears and unreconciles the original. Applied-payment voiding immediately removes the application and reopens the source transaction. Sources: [Voiding a check](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_3951602420.html), [Troubleshooting reconciliation issues](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_20260810010.html), [Effect of voiding applied payments](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1556144790.html), [Voiding a vendor prepayment](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_159541401977.html).

**McLeod.** McLeod's public Track and Trace contract exposes `Void` as an order status. Public McLeod documentation reviewed for this report does not specify delete versus reverse semantics, the voided-detail presentation, void permissions, or bank-match effects. No parity credit is inferred beyond retained Void status. Source: [McLeod Track and Trace API contract](https://innovationhub.mcleodsoftware.com/apis/683f2936362626000137d574/documentation/raw).

### IH35 grade

The locked IH35 rule—financial void is reversal, nothing financial is deletable, UUID not display ID, reason/actor/time plus audit—is **stronger than QuickBooks deletion semantics** and conceptually matches the safer NetSuite reversing-JE mode. Delivery is below reference:

- the systemwide sweep found 8/8 audited detail surfaces without a top void banner containing status, actor/time, and reason;
- list filters are inconsistent for bill payments, settlements, and loads;
- `BANK-ORPHAN-01` records four categorized bank transactions still linked to voided payments;
- the law does not yet specify NetSuite-grade deterministic transitions for `matched`, `cleared`, and `reconciled` state when a source is reversed;
- “Owner + Accountant” is a product decision, but the reference bar is action-level permission plus a visible request/escalation path—not merely hiding the control.

### Block: `VOID-PARITY-01 — REVERSAL-AWARE-DOCUMENT-AND-BANK-STATE-MACHINE`

Centralize void/reverse through one service. Retain source amount and identity, create a linked reversing document/JE, expose **VOIDED** plus actor/time/reason/reversal drill on every detail, and expose void as a filterable list status. Define and enforce bank transitions: reversing-JE void preserves the original reconciliation record and creates a new unmatched reversing item; a nonposting cancellation cannot leave a live match; an applied-payment reversal reopens its invoice/bill. Owner/Accountant may execute; other authorized roles see a disabled action plus workflow-request path. Guard all document classes and the four known orphan matches.

## 3. MONEY COLUMNS

### What the references do

**QuickBooks.** Because a voided transaction's amount becomes zero, its displayed amount/open effect is zero while the retained record is marked VOID. QuickBooks A/R Aging reports are defined around outstanding balances and “how much is still due”; Open Invoices exposes an Open Balance column. A void cannot remain an outstanding collectible. Sources: [Void or delete transactions](https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/void-delete-transactions-quickbooks-online/L5sZV8GYh_US_en_US), [Run an A/R aging report](https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_US_en_US), [QuickBooks Open Invoices report](https://quickbooks.intuit.com/content/dam/intuit/quickbooks/QBDT-Level-1-Manual-new.pdf).

**NetSuite.** A zero-amount void shows zero; a reversing-JE void retains the historical source and neutralizes its GL effect with a linked reversal. NetSuite's A/R Aging Detail is an open-item report: it lists unpaid invoices/charges and Amount Due, grouped and summed by customer. Voiding an applied payment reopens the underlying source immediately, so aging changes according to the reopened document rather than hiding the reversal. Sources: [Voiding a check](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_3951602420.html), [A/R Aging Detail](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1532837.html), [Effect of voiding applied payments](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1556144790.html).

**McLeod.** McLeod MPact.IQ publicly promises point-in-time A/R aging, an interactive collections screen, and order-level aging/history, including unbilled orders. Public material does not disclose the money columns shown specifically on a voided order/invoice, so zero-on-void is not attributed to McLeod without evidence. Sources: [McLeod 26.1 financial clarity release](https://www.mcleodsoftware.com/why-mcleod/resources/press-releases/mcleod-software-launches-new-release-advancing-smarter-operations-faster-decisions-financial-clarity/), [McLeod IQ A/R dashboard case study](https://www.mcleodsoftware.com/docs/case-study/McLeod_Case_Study_Kingsgate_McLeod_IQ.pdf).

### IH35 grade

`accounting.invoices.amount_open_cents` is generated as `total_cents - amount_paid_cents` and ignores `voided_at`. The current register records 33 voided invoices with **$45,837.34 phantom open**, and consumers include collections, cash forecast, month close, customer financials, reconciliation, and reports. The invoice list alone masks this with display-only `Open = $0`; detail and downstream readers do not consistently do so. The sweep also found the requested **Total · Open · Variance** triad and variance absent across all eight audited document families.

The spec is also underspecified: “variance” must name its operands per document type. References universally support Total/Amount and Amount Due/Open; they do not establish one universal variance formula. IH35 may surpass them, but only with typed definitions such as `total - applied - open = 0`, `debits - credits = 0`, or `expected - actual`, never one mislabeled generic column.

### Block: `MONEY-PARITY-01 — CANONICAL-OPEN-BALANCE-AND-TYPED-VARIANCE`

Make canonical open balance void-aware at the data/service boundary, not in one renderer. A voided invoice must have collectible open of zero and must not enter A/R aging, collections, cash forecast, customer balance, or reconciliation as open. Preserve original total separately for audit and show `Original total`, `Open $0`, and linked reversal. Define variance by document family and render Total/Open/Variance on every applicable list/detail. Mutation-prove all named consumers and the 33-row phantom-open class.

## 4. SORT

### What the references do

**QuickBooks.** QuickBooks transaction windows support sorting by date, number, amount, customer, due date and, depending on transaction type/version, open balance, aging, PO number, paid date, and other operational fields. The cited UI documents one selected “Sort by” field and ascending/descending direction; public documentation reviewed here does not establish multi-column or cross-session persistence for the ordinary transaction list. Source: [Sort saved transactions](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/sort-saved-transactions/L3gjCeIul_US_en_US).

**NetSuite.** Saved Search explicitly supports **primary, secondary, and third sort fields**, including independent descending choices. Searches are saved and rerun against dynamically updated data; customized quick-search settings can be saved for future results. Oracle warns that nonunique single-field sorting can reorder between runs and recommends multiple fields—this is a correctness requirement, not cosmetic preference. Sources: [Defining order for search results](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N651604.html), [Defining a saved search](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N676039.html), [Using Search Customization](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/bridgehead_N640928.html).

**McLeod.** McLeod publicly documents sortable report columns and Tailor-based personalization of fields, tables, and grids. Public material reviewed here does not prove multi-column sorting or persistence rules across pages/sessions, so those capabilities are not credited without private product documentation or a live licensed walkthrough. Sources: [LoadMaster reporting](https://www.mcleodsoftware.com/docs/whitepapers/McLeod_White_Paper_Make_Best_Use_Of_Assets_LoadMaster_Reporting.pdf), [System Personalization](https://www.mcleodsoftware.com/solutions/system-personalization/).

### IH35 grade

The locked `GLOBAL-SORT-RULE` requires every data header to toggle ascending/descending. It does **not** require:

- secondary/tertiary keys or a deterministic unique tie-breaker;
- persistence across page navigation, pagination, reload, or user sessions;
- server-side ordering before pagination;
- stable null/currency/date/case collation;
- a full-header hit target.

The current sweep proves the implementation is worse than the spec: `ParityTable` uses a label-sized hit target, and internal sorting frequently orders only the fetched page. Invoices can sort at most the first API-capped 100; server-paginated pages silently produce a different “sorted” order on each page. Against NetSuite, both the law and implementation are below parity.

### Block: `SORT-PARITY-01 — SAVED-STABLE-MULTIKEY-SERVER-SORT`

Extend the shared table contract to ordered sort keys (`[{key, direction}, …]`) with a mandatory unique final tie-breaker. Apply ordering server-side before limit/offset/cursor pagination. Make the entire header cell the hit target while preserving resize behavior. Persist sort in URL for share/reload/page navigation and in per-user view preferences for later sessions; define reset-to-default. Guard page 1/page 2 consistency, duplicate primary values, nulls, currency/date fields, and primary/secondary/third ordering.

## Ranked parity disposition

1. **P0 — `VOID-PARITY-01`**: current bank links can remain attached to voided money; below NetSuite reconciliation safety.
2. **P0 — `MONEY-PARITY-01`**: voided invoices remain collectible to downstream consumers; below both accounting references.
3. **P1 — `SEARCH-PARITY-01`**: invoice search omits amount and freight references; below QuickBooks and McLeod.
4. **P1 — `SORT-PARITY-01`**: page-local sorting is correctness theater; below NetSuite stable saved-search behavior.

## Honest limits

- This is the requested **parity layer**, not a new Live Chrome defect pass.
- McLeod public sources are strong for Order/BOL/reference search and order-level aging, but do not publicly specify financial void/reconciliation or multi-sort persistence. Those cells remain **not publicly evidenced**.
- “Variance everywhere” is not credited merely because it is named. It becomes a surpassing IH35 capability only after each document family has an explicit accounting equation and guard.
