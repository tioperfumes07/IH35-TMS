# CODEX — Match Window UI Inventory

Measured read-only on live production at `https://app.ih35dispatch.com/banking/transactions`, USMCA, 2026-09-23 20:46–20:55 CT. No match, unmatch, categorize, split, accept, POST, or other write was performed.

## Executive measurement

- Expanded live row `CRICKET WIRELESS`, 2026-09-23, spent `$60.00`: **`MATCH CANDIDATES 50 found`**.
- The visible match register columns are **Date · Type · Ref no. · Payee · Description · Open balance · Amount · Difference · Days off · Best match · Match action**. Source: `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx:217-365`; live screen showed those column headers and 50 candidate rows.
- The live filter bar contains all six type checkboxes, payee, date from/to, amount from/to, text search, **`Search all`**, and a conditional **`clear filters`**. Source: `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx:2970-3047`.
- Match selection is **single-record acceptance**, not multi-select. Each candidate has its own `Match` action; the drawer uses one radio selection. Source: inline action `BankingTransactionsDesignView.tsx:327-363`; drawer state/radio `apps/frontend/src/pages/banking/components/MatchDrawer.tsx:82-84,238-269`.
- There is no selected-total or remaining-difference counter in either match surface. The only per-candidate variance display is the `Difference` column / `Amount gap`. Source: `BankingTransactionsDesignView.tsx:280-303`; `MatchDrawer.tsx:301-305`.

## 1. Bank-row suggestion UI and candidate window

### Bank transaction row

The register has one `Match/Categorize` column. It renders a single mode pill — `Match` or `Categorize` — rather than candidate columns on the collapsed row (`apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx:2082-2092`).

The toolbar action **`Suggest matches`** populates at most one exact-cents, ±5-day expense/bill suggestion per bank transaction. When present the row renders one **`Suggested`** badge; its title contains the suggested kind and date gap, and clicking it only opens the existing match drawer (`BankingTransactionsDesignView.tsx:658-663,2110-2127,3546`). It does not accept a match.

On the live collapsed register today, the row suggestion UI also showed categorization-rule suggestions such as **`SUGGESTED: CRICKET WIRELESS (6100)`**. That is a categorization suggestion, not a bank-reconciliation candidate.

### Expanded match window

Opening a bank row exposes the full ranked candidate register. Live measurement on the `$60.00` Cricket Wireless row: **50 candidates** and `1–25 of 50`. The panel itself displays its live result count as **`MATCH CANDIDATES 50 found`** (`BankingTransactionsDesignView.tsx:2957-2962`).

Columns, left to right, are defined at `BankingTransactionsDesignView.tsx:217-365`:

1. Date
2. Type
3. Ref no.
4. Payee
5. Description
6. Open balance
7. Amount
8. Difference
9. Days off
10. Best match indicator
11. Match action

The “find other matches” equivalent is exactly **`Search all`** (`BankingTransactionsDesignView.tsx:3037-3047`). Its help text says **`Search all widens to a year.`** (`BankingTransactionsDesignView.tsx:2965-2969`). The separate drawer uses the same exact label and also offers **`Reset to recommended`** after widening (`apps/frontend/src/pages/banking/components/MatchDrawer.tsx:185-231`).

## 2. Match-window filter inventory

Present in the live expanded window:

- **Show**: six independent checkboxes — `Bills (open)`, `Bill payments`, `Expenses`, `Customer payments`, `Transfers`, `Journal entries` (`BankingTransactionsDesignView.tsx:170-182,2973-2995`).
- **Payee (vendor / customer)**: free-text input, placeholder `e.g. Holiday Inn` (`BankingTransactionsDesignView.tsx:2997-3000`).
- **Date from** and **Date to** (`BankingTransactionsDesignView.tsx:3001-3008`).
- **Amount from** and **Amount to** (`BankingTransactionsDesignView.tsx:3009-3016`).
- Free-text search with placeholder **`Search payee, memo, ref…`** plus **`Search all`** (`BankingTransactionsDesignView.tsx:3023-3047`).
- Conditional **`clear filters`** control (`BankingTransactionsDesignView.tsx:3017-3021`).

Not present:

- no match-state/confidence/score filter;
- no reference-only filter separate from the combined text search;
- no amount “exact” toggle;
- no date preset control inside the match window;
- no selected-filter chip row (only `clear filters`);
- no vendor picker/combobox in the match filter row — Payee is free text.

## 3. Selection and totals contract

The live match register is single-candidate action, not multi-select. Every candidate row owns a single `Match` button; exact non-bill candidates may be enabled, while variance and bill candidates are disabled (`BankingTransactionsDesignView.tsx:327-363`). The side drawer is explicitly radio-based with one `selectedId` (`MatchDrawer.tsx:82-84,238-269`).

Therefore the match window has **no running selected total** and **no remaining-difference counter**. Exact rendered variance strings are per candidate: `Difference` values such as **`+$1.29`**, and disabled Match help **`Amount does not match exactly — open the match drawer to review the variance`** on the live `$60.00` row. Source: `BankingTransactionsDesignView.tsx:280-303,348-353`.

Do not confuse this with Split: the separate split drawer renders **`Remaining: $…`** (`apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx:263-285`).

## 4. Resolve difference reachability

**NOT REACHABLE from the transaction match window.** The inline match action disables every non-exact candidate and instructs the operator to open the drawer; the drawer also disables non-exact confirm and displays **`Variance posting proven balanced (Tier-1) — awaiting owner go-ahead to enable Confirm`** (`BankingTransactionsDesignView.tsx:334-353`; `apps/frontend/src/pages/banking/components/MatchDrawer.tsx:22-34,242-335`). The match window has no variance-account picker, reason field, or materiality warning.

A separate `/banking/reconciliation` surface does expose a **`Variance account (required if variance exists)`** account picker (`apps/frontend/src/pages/banking/BankReconciliationPage.tsx:412-429`) and sends `variance_account_id` through accept/manual-match (`BankReconciliationPage.tsx:219-230,487-504`). It has **no reason field and no materiality warning** in the selected-transaction action panel.

Backend handlers exist at:

- `POST /api/v1/bank-recon/accept-match` — `apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts:75-110`
- `POST /api/v1/bank-recon/manual-match` — `recon-worklist.routes.ts:156-191`

Both require `variance_account_id` when the difference is non-zero (`recon-worklist.routes.ts:97-99,178-180`). The difference poster is `postDifferenceJournalEntry` at `apps/backend/src/accounting/bank-recon/match.service.ts:793-932`; it posts the variance against the selected difference account, but the transaction match window does not expose that path.

## 5. Categorize split

Split exists and is reachable from a transaction’s action menu as exact label **`Split`** (`BankingTransactionsDesignView.tsx:2153-2173`) and from the expanded categorize editor (`BankingTransactionsDesignView.tsx:2942-2944`). It opens the `Split transaction` drawer (`apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx:263-266`).

It supports N lines and N accounts/categories. Each split line has its own Category/GL account, Product/Service, memo, amount, and — when the operator expands exact label **`+ Add detail/links`** — its own Driver, Unit, Trailer, and **Trip (load)** linkage (`BankTransactionSplitModal.tsx:323-439,492-570`). Vendor is per line in `Multiple vendors` mode, or one vendor inherited by every line in `One vendor, multiple categories` mode (`BankTransactionSplitModal.tsx:288-320,345-367`). The persisted payload carries `vendor_id`, `customer_id`, `driver_id`, `unit_id`, `trailer_id`, and `load_id` per line (`BankTransactionSplitModal.tsx:195-215`).

An unbalanced split is **blocked**, not merely warned:

- UI renders **`Remaining: $…`** and disables both **`Save split`** and **`Save and close`** while `remainingCents !== 0` (`BankTransactionSplitModal.tsx:281-285,582-595`).
- Server rejects it with exact error **`Split lines total <sum> cents but the transaction is <total> cents. Lines must sum exactly to the transaction amount.`** and code `amount_mismatch` (`apps/backend/src/banking/bank-transaction-splits.service.ts:265-305`).

## Addendum — frontend/backend filter contract

### What the frontend sends

The live caller is `getMatchCandidates` inside `BankingTransactionsDesignView` (`BankingTransactionsDesignView.tsx:839-860`). It sends:

- `kinds[]`: yes — `kinds: [...matchKinds]` when fewer than all six are selected (`:851-853`);
- `dateFrom`: yes (`:854`);
- `dateTo`: yes (`:855`);
- amount minimum: yes, but the frontend API names it `amountMin` and serializes query parameter `amount_min` (`:856`; `apps/frontend/src/api/banking.ts:504-533`);
- amount maximum: yes, via `amountMax` / `amount_max` (`BankingTransactionsDesignView.tsx:857`; `api/banking.ts:504-533`).

The backend converts the dollar query values to integer cents with **`Math.round(parsed.data.amount_min * 100)`** and **`Math.round(parsed.data.amount_max * 100)`** before calling `findCandidates` (`apps/backend/src/banking/p7-wave2.routes.ts:230-240`). Therefore `findCandidates` receives `amount_min_cents` / `amount_max_cents` integers.

All six kinds are selectable live and in source:

| Backend kind | Live UI label | Selectable? |
|---|---|---|
| `payment` | Customer payments | Yes |
| `bill_payment` | Bill payments | Yes |
| `transfer` | Transfers | Yes |
| `je` | Journal entries | Yes |
| `bill` | Bills (open) | Yes |
| `expense` | Expenses | Yes |

Source: `BankingTransactionsDesignView.tsx:170-182,2973-2994`.

### Type-input behavior

The type control is **multi-select**: six checkboxes backed by `Set<BankMatchCandidateKind>` (`BankingTransactionsDesignView.tsx:641-649,2973-2995`). The owner cannot type into it; it is checklist-only. The separate Payee and combined payee/memo/ref controls are typable.

### Amount parse

Amount From/To inputs are decimal number inputs (`BankingTransactionsDesignView.tsx:3009-3016`). The component first calls `Number(matchAmountMin)` / `Number(matchAmountMax)` (`:856-857`), so the intermediate frontend value is a JavaScript floating-point number. **Defect named:** the frontend does not itself produce integer cents; it sends dollar floats. The route repairs this at the boundary with `Math.round(value * 100)` (`apps/backend/src/banking/p7-wave2.routes.ts:239-240`). The transport contract is dollars (`amount_min`, `amount_max`), while the service contract is integer cents.

### Live count and clear contract

The window shows a live count as filters change: **`N found`** in `banking-match-candidates-count` (`BankingTransactionsDesignView.tsx:2957-2962`). It has **`clear filters`** when any structured filter differs from default (`:3017-3021`). It does not render filter chips.

### Bill-candidate trap

`PERSISTABLE_MATCH_KINDS` omits `bill` (`apps/backend/src/accounting/bank-recon/match.service.ts:25-37`), and the accept path throws **`match_kind_not_acceptable:bill`** (`match.service.ts:1087-1091`).

The UI partially protects this:

- open bills are fully selectable as a filter and returned/rendered as normal candidate rows;
- a bill row has the same normal Type/Ref/Payee/Description/Open balance/Amount/Difference/Days-off presentation as other candidates;
- its Match button is disabled, with tooltip **`Recording the bill payment is CHAIN-04 (Part 2b)`** (`BankingTransactionsDesignView.tsx:334-353`);
- the drawer row itself remains selectable by row/radio, but its Confirm button is disabled and shows **`Posting available after CHAIN-04`** (`apps/frontend/src/pages/banking/components/MatchDrawer.tsx:242-335`).

Live read-only reproduction: on both the `$60.00` Cricket Wireless row and `$890.00` Check Image 1033 row, selecting only `Bills (open)` yielded **`MATCH CANDIDATES 0 found`** / **`No match candidates found for this transaction.`** No bill candidate existed for those two rows, so the disabled bill-row state could not be screen-observed without probing more rows. No accept was clicked. The protection/appearance claim above is source-proven rather than falsely labeled live-proven.

## Bottom line

The production expanded match window already has the requested multi-select kinds, payee text, date range, amount range, combined search, live result count, and clear-all. It is single-candidate acceptance with no aggregate selected total. Resolve-difference is not reachable there. Split categorization is N-line with per-line linkages and hard balance enforcement. The two concrete contract defects are: (1) amount filters are dollar floats until the backend converts them to cents, and (2) bills can be displayed/selected as candidates but are deliberately non-persistable; the UI disables acceptance rather than explaining the backend error in a persistent warning.
