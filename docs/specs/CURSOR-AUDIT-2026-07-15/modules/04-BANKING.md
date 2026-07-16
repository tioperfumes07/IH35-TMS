# 04 — BANKING

**Verdict:** Strong categorize shell (newer chrome); Bank Register from Banking is WRONG TARGET; sort/group ≠ QBO; feed health thin.

## Live evidence (2026-07-15)
- TMS: `https://app.ih35dispatch.com/banking` · `/banking/transactions` — For review ·737 on Amex ···5007; Post/Categorize expand with Match, payee, COA, class, location, item, customer, driver/unit/trailer/load, Split.
- TMS Bank Register button → `/accounting/account-register` → **“Select an account…”** (empty).
- QBO: `https://qbo.intuit.com/app/banking` — Pending/Posted/Excluded; Bank vs Posted cards; Go to bank register → `/app/register?accountId=…` pre-bound; expand: Create rule, Exclude, Upload, Categorization history.

## Surface / button inventory
| Surface | Control | Route / behavior | Status |
|---------|---------|------------------|--------|
| Banking Home | Tabs Accounts / Transactions / Reconciliation / Driver Escrow / Reports | `/banking/*` | HAVE (5 ≠ design 12) |
| Header | Bank Register | → GL picker empty | FAIL vs QBO |
| Header | Chart of Accounts | `/lists/accounting/chart-of-accounts` | HAVE |
| Header | + Manual JE, + Record Transfer, + Pay Credit Card, View Transfers | modals/pages | HAVE |
| Accounts | Plaid chips (5), Link account, Connect via PlaidLink | | PARTIAL vs QBO rail |
| KPI tiles | Cash posting, DIP, Uncategorized, Recon, Factoring, Escrow | | HAVE — KEEP |
| Transactions | For review / Categorized / Excluded | counts: Cat/Excl often 0 | FAIL truth |
| Transactions | Filter All/Spent/Received, By month, Category/Item | | PARTIAL |
| Row | Post, ▾, expand Categorize/Match | | HAVE (newer chrome) |
| Expand | +Add vendor/category/class/service/customer (code) | ReferenceSelect | HAVE code |
| Expand | Create rule / Exclude (QBO) | | MISSING |
| Design view | Go to bank register | `/banking/accounts/:id` (feed, not GL) | DRIFT naming |

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** Categorize expand + truck dims; Factoring/Escrow tiles; Plaid sync.  
**MISSING:** Bank/Posted cards; feed error banners; Money in/out group; Create rule; Exclude; flat total sort default; pre-bound GL register.  
**DRIFT:** Design 12 tabs vs code 5; two “registers.”  
**WILL FAIL:** Operator expects QBO “Go to register” for current account → empty picker; sort by date ASC still month-banded newest-first.

## Professional recommendation
1. Add “Go to account register” pre-bound to selected bank’s CoA cash/CC account (QBO pattern). Keep GL Account Register page.  
2. Add Money in/out grouping + flat list; fix pipeline to sort full set before group (or group-off when sorting).  
3. Wire Post → move Categorized/Excluded counts.  
4. Add Create rule + Exclude. Never delete Factoring/Escrow/DIP.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `BankingHome.tsx` · `BankingTransactionsDesignView.tsx` · `BankAccountDetail.tsx`

### Header / tabs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Tabs Accounts/Transactions/Reconciliation/Driver Escrow/Reports | BankingHome.tsx:40-46,251-268 | NavLink | HAVE (5 ≠ design 12) |
| Bank Register | BankingHome.tsx:186 | → `/accounting/account-register` **no accountId** | WILL FAIL vs QBO |
| Chart of Accounts | :187 | → lists CoA | HAVE |
| + Import Statement | :195 | → Transactions | HAVE |
| + Create/Manage Accounts | :197 | ManageAccountsModal | HAVE |
| Connect Bank / CC / Other | :198-221 | PlaidLinkButton | HAVE |
| + Manual JE / Transfer / Pay CC / View Transfers | :225-228 | modals / `/banking/transfers` | HAVE |
| + Reconcile / Open Reconcile Queue | :232-233 | modal / `/banking/reconcile` | HAVE |
| KPI tiles Cash/DIP/Uncategorized/Recon/Factoring/Escrow | :303-347 | navigate | HAVE — KEEP |

### Transactions DesignView
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Account chips | DesignView:776-790 | select | HAVE |
| Link ▾ Upload / Manage / Go to bank register | :793-828 | Go to register → `/banking/accounts/:id` **feed not GL** | DRIFT naming |
| For review / Categorized / Excluded | :853-867 | client heuristics :385-407 | DRIFT vs server review_state |
| Filter All/Spent/Received, date, month, categorize-by, page, print/export | :877-1082 | local | PARTIAL |
| Bulk Categorize | :1099 | toast “coming next” | STUB |
| Row Post | :1431-1433 | postTransaction | HAVE |
| ▾ Accept match | :1447-1456 | MatchDrawer | HAVE |
| ▾ Split | :1459-1468 | Split modal | HAVE |
| ▾ Create backdated check | :1469-1478 | **toast only** | STUB |
| ▾ Create rule | :1479-1485 | → categorization-rules | HAVE route |
| ▾ Exclude | :1486-1496 | skip API | HAVE |
| Expand Match candidates | :1944-2001 | **display only** — no Accept on cards | WILL FAIL vs QBO |
| ReferenceSelect vendor/category/class/service/customer | :1576-1763 | +Add | HAVE |
| Driver/Unit/Trailer/Load + Recover from driver | :1778-1902 | flag-gated | PARTIAL |
| Paperclip / MessageSquare | :1380-1381 | **no onClick** | DEAD |
| Files drag/drop | :1923-1925 | static placeholder | DEAD |

### Register link map
| Label | Target | Truth |
|-------|--------|-------|
| Header Bank Register | `/accounting/account-register` | unbound picker |
| DesignView Go to bank register | `/banking/accounts/:id` | Plaid feed |
| CoA View register | `/accounting/chart-of-accounts/register/:accountId` | **pre-bound** (correct pattern) |
