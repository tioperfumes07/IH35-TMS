# CODEX — D / E / G / H audit supplement

Audit date: 2026-10-12, America/Chicago. Pinned main SHA `3cad5d74d3e750005c988f531315e61a026c1c59`. Read-only source inspection; no application or database writes. All production observations in this supplement are **PROD CHECK PENDING** until the coordinating audit attaches executed SQL/results. Old counts in source comments are not current evidence. This is a bounded deep trace of the listed paths, not certification of every route in these four domains.

## Confirmed source findings

| ID | Severity | Evidence | Finding / minimum root-cause correction | In flight |
|---|---|---|---|---|
| DEGH-01 | P1 | `apps/backend/src/driver-finance/settlement-creator.service.ts:1642`, `:1660`; shared writer `apps/backend/src/accounting/expenses.routes.ts:485` | Creator still directly inserts paid company expenses and lines, bypassing the shared expense writer. It now requires vendor, item, payment source and load, preserves quantity, and fails posting refusals; those improvements do not make it use the shared validation/idempotency/attribution pipeline. Call the one transactional writer with an explicit Creator contract. | G13 still open at pinned SHA |
| DEGH-02 | P1 | `apps/backend/src/banking/categorization.routes.ts:533`; `apps/backend/src/banking/bank-feed-gl-posting.service.ts:381`, `:398` | General categorization posts source `bank_categorization` and stamps a JE pointer, without creating an expense document for expense-account money-out rows. Full backend caller search finds `createAndPostBankLineExpenseOnClient` only in reconciliation adjustments, not this chain. Create the appropriate document before posting; do not create a duplicate beside an existing matched expense. Population needs account-type filtering: asset/liability categorizations are not expense defects. | G6 not fully covered |
| DEGH-03 | P1 | `apps/backend/src/accounting/checks/check-create.service.ts:280–291` | Category check line selects any active item with the selected expense account using unordered `LIMIT 1`. Multiple items can share an account; account equality does not establish product/service identity. Require explicit item or exactly one eligible item. The invoice item resolver already refuses ambiguity. | Not identified in G1–G15 |
| DEGH-04 | P1 | `apps/backend/src/accounting/checks/check-create.service.ts:362–391`; `apps/backend/src/accounting/checks/checks.routes.ts:157` | Check creation returns a persisted unposted check when posting flag is off or an application `PostingEngineError` is caught. Route returns 201. This contradicts its own atomic document+JE comment; response honestly carries `unposted`, so this is not a fabricated posted flag. Require explicit draft semantics or fail the save on posting refusal for a final check. SQL errors may abort the transaction; the defect statement is specifically the application-error/flag-off branch. | Not identified in G1–G15 |
| DEGH-05 | P1 | `db/migrations/202615781200_document_links_refused_at_db.sql:10`, `:73`, `:142–177` | 443.106 intentionally omits trailer from bill refusal. Expense-line refusal compares driver/unit to non-null header values, not the load, and does not require a non-null header driver/unit. It is partial coverage, not a DB guarantee of every requested dimension. Finish the declared trailer constraint and separately verify load→header→line consistency; do not treat null-null as demonstrated attribution. | 443.106 / G9 partial by design |
| DEGH-06 | P2 | `apps/backend/src/accounting/bank-line-expense.service.ts:96–100` | Shared bank-line expense writer always allocates EXP display ID even if `input.loadId` exists. It accepts/stamps load on header and line but does not call `generateExpenseNumber` for that case. Route through the load spine when a load is provided. Its currently found production caller is reconciliation adjustment; exposure is not a measured live load-linked defect. | G6 related |

No P0 live money error is asserted by this supplement. These are confirmed code behaviors and missing controls, with production exposure pending. A theoretical negative invoice-charge edge was investigated and **not** promoted: migration `202612502200_p44_load_additional_charge_lines_canonical_fk.sql:25` refuses negative source charges.

DEGH-01 behavioral difference is concrete, not merely naming: the shared expense writer creates `expense_attribution.expense_load_links` and emits `expense.created.attributed` plus its per-document audit at `expenses.routes.ts:1000–1034`; the inspected Creator paid-expense loop inserts its documents and posts without those shared service calls. A DB trigger or later consumer may create some of those links; the live trigger/outbox evidence is required before claiming missing persisted rows. Do not classify the mere presence of multiple INSERT statements as an error without this contract difference.

## In-flight fix verdicts

| Gap | Pinned-code verdict | Evidence / remaining proof |
|---|---|---|
| G4 owed vendor bill | Implementation present; local static mutation test green | Creator `:1608` calls `writeCreatorOwedBill`; helper `settlement-creator-owed-bill.ts:56` load-spine allocator; `:75` shared bill writer; `:121` canonical bill poster; `:162` void helper. Creator `:319` voids prior owed ids; `:2122` records them. Requires live document/JE/void proof. |
| G6 bank documents | Not fully covered | DEGH-02. Relay helper `accounting/bank-recon/relay-bank-match.service.ts:468` only links a fill and returns `expense_created:false` at `:559`; no production route directly calling that named helper found, so it is not asserted as a reachable missing-document defect. Match suggestion path itself is read-only in inspected function. |
| G8 posting load/entity | Shared writer enhanced, universal coverage unproven | `accounting/posting-line-writer.ts:141` entity resolver, `:245` factoring/fuel load resolver, `:317` explicit foreign-load refusal, `:328` canonical INSERT with derived load. SQL resolver migration `202615580900_posting_source_load_id_relay_fallback_single_valued.sql:15`. Does not prove all alternate SQL writers call it or that every live source maps. |
| G10 invoice charge items | Implementation present | `accounting/from-load.ts:220` reads charge lines; `:326–341` writes one itemized line per charge; `invoice-charge-lines.ts:47` checks sum; `:74` resolves item by preferred name or unique account candidate. Zero-invoice authorized branch at from-load `:192`. No live itemization result claimed. |
| G13 shared expense writer | Open | DEGH-01; current caller's explicit posting and stamps are acknowledged, not dismissed. |
| 443.106 DB refusal | Partial by declared scope | Migration `202615781200_document_links_refused_at_db.sql`; active bill vendor/driver/load/unit, bill-payment vendor, line/header driver/unit consistency. Trailer deliberately deferred. Live installation and trigger enabled state pending. |

## D — invoice / A/R call chains

| Entry / route | Service → SQL | Canonical tables / links | Posting / controls | Proof limits |
|---|---|---|---|---|
| Load invoice action; `accounting/invoices.routes.ts:812` invokes builder | `accounting/from-load.ts:127` scoped source load; `:220` charge read; `:331` line insert | `accounting.invoices`, `accounting.invoice_lines`; company+customer from load, `source_load_id` on header/lines; item+income account resolved, not arbitrary free-text item | `authorizedZeroRevenue` explicitly permits zero; nonauthorized zero refuses at `:200`. `uq_invoices_source_load_active` collision handled `:316`. Revenue must use delivery/docs latch, not duplicate invoice revenue. | Source inserts verified; live customer/load mismatch, latch flag and report drill-through pending |
| Send invoice, `accounting/invoices.routes.ts:1092` schema / subsequent handler | `accounting/invoice-send.service.ts:306`, `:340` delivery evidence updates; `:469` invoice update | Canonical invoice, company predicate on writes | Delivery evidence and invoice status are distinct from first revenue recognition. Full outbox/latch sequence not exhaustively traced here. | Unverified end-to-end |
| Receive payment, `accounting/payments.routes.ts:406` | payments INSERT `:492`; in-client poster `:609` | `accounting.payments`; separate customer route `customer-payments.routes.ts:163`, INSERT `:238`, poster `:367` | Both inspected routes invoke in-client transaction poster rather than invisible separate-connection post. Customer receipt/deposit are separate source types (`posting-engine.service.ts:44`, `:61`). | Duplicate service surface exists; semantic identity/idempotency comparison pending, not declared defective just because two routes exist |
| Credit memo create/apply/void | `accounting/credit-memos.routes.ts:240`, `:279`, `:299`; apply `:456`; void `:508` | `credit_memos`, `credit_memo_applications`, invoice reference | Existing poster and reverse poster imported `:8`; source-load resolver maps through related invoice (`202615580900...:53`) | Runtime cents/period-lock and UI path not exercised |

## E — factoring / Faro call chains

UI: `apps/frontend/src/pages/factoring/SubmitToFactorTab.tsx:221` creates draft, `:236` posts; frontend API `api/factoring-purchases.ts:196`, `:200`. Routes are `factoring/purchase.routes.ts:209` draft, named post/void endpoints in same file, and send `:169` with role/error handling. No send or other mutation was exercised.

| Writer | SQL / link shape | Posting | Remaining proof |
|---|---|---|---|
| `factoring/purchase.service.ts:71 createPurchaseDraft` | scoped invoice eligibility read `:87`; header INSERT `:154`; lines INSERT `:181` carry invoice/customer/load/settlement derived from invoices and settlement lines | Draft is not funding | Concurrent reservation of invoices between two drafts and DB uniqueness not exhaustively tested |
| `purchase.service.ts:199 postPurchase` | advance INSERT `:228`; invoice→advance linkage `:245`; purchase→advance/JE update `:283`; purchase line reverse links retained | canonical `postFactoringAdvanceEventInClientTx` `:252`; refuses `posted=false`/missing JE `:270` so transaction rolls back. Funding comments at `:11` state Dr1090 net +1230 escrow reserve +1235 cash reserve +6400 fee +6300 wire / Cr2150 gross; actual resolved roles/live numbers pending | Multi-invoice advance does not have a single source load in this insert. Preserve line-level links; do not assign arbitrary first load to batch JE. Need live source-link/report verification |
| `purchase.service.ts:302 voidPurchase` | canonical reversal orchestration; invoices return to not-factored | existing reversal, no new math | Full chargeback/reserve/short-pay lifecycle outside bounded trace |

Flag `FACTORING_GL_POSTING_ENABLED` is company-aware (`accounting/factoring-posting/poster.service.ts:101`, `:263`); current USMCA state **PROD CHECK PENDING**, not inferred from comments. A/R must remain until customer collection under secured-borrowing policy. The advance's existence is not payment of the debtor invoice.

## G — expenses / AP / checks

| Entry | Writer / SQL | Link and account treatment | Ledger / guard |
|---|---|---|---|
| Record Expense UI `components/expenses/recordExpenseSubmit.ts:127`; API `api/accounting.ts:1524`; POST `/api/v1/expenses` at `expenses.routes.ts:1379` | `createExpenseInClientTx` `:485`, caller `:1400` | Vendor same-company active check `:543`; load company check `:556`; memo two-minute duplicate refusal `:517`. Lines must item/account and load or exemption. Exact source dimensions must be derived/validated, not merely present. | Canonical expense poster; current flag state not measured. Read/void/change-payment-source routes `:1235`, `:1831`, `:2136` exist. |
| Creator company expense | direct header/line SQL `settlement-creator.service.ts:1642`, `:1660` | requires payment source `:1569`, named vendor `:1577`, item `:1590`, load `:1597`; driver/unit/trailer from settlement draft; quantities preserved `:1600`; named vendor `LIMIT1` is not explicit ID selection | in-client post `:1676`, fail-loud and stamp. G13 still bypasses common writer |
| Creator owed company expense | `settlement-creator-owed-bill.ts:75` → `bills.service.ts:3239 createBillInClientTx` → shared INSERT family `:2655–2736` / lines `:3059`, `:3156` | vendor/load/driver/unit/trailer/item/account; display spine and vendor document number separate; load unit/trailer fallback helpers | canonical bill poster → Dr item expense / Cr AP; edit void reverses; G4 static test8/8 |
| Bill payment route `vendor-bill-payments.routes.ts:488` | `bills.service.ts:3341` bill-payment INSERT; canonical poster `:3486` | bill_id/vendor_id; DB vendor refusal migration443.106 | DrAP/Cr payment account through existing engine; actual bank account/period/flags pending |
| Write Check UI `components/checks/WriteCheckForm.tsx:1110`; API `api/checks.ts:71`; route `checks.routes.ts:142` | `checks/check-create.service.ts:173` registry, `:192` expense, `:310` lines, `:364` poster | resolves depository bank ledger `:151`; header/per-line dimensions supplied by request; category mapping arbitrary item DEGH-03; check-number registry carries bank/opco | readback verifies balance/accounts `:374`; swallowed application refusal and flag-off permit unposted result DEGH-04. Route role/membership checks `checks.routes.ts:148–156`. |

DB objects inspected: `202614690000_expense_lines_item_and_account_required.sql:22` item CHECK; `202615781200_document_links_refused_at_db.sql` new link refusals; `202615770700` load/exemption requirement cited by latter migration. The exact live pg_constraint/pg_trigger definitions and enabled status must be measured; migration text alone is not live proof.

## H — banking suggestions, matching, categorization

UI suggestions caller `pages/banking/components/BankingTransactionsDesignView.tsx:1607` → `api/banking.ts:1720`; accept `components/MatchDrawer.tsx:303` → `api/banking.ts:1731`; routes include `/api/v1/bank-recon/accept-match` and `accept-multi-match` API lines1744/1759.

* `accounting/bank-recon/match.service.ts:2352 suggestBankMatches` reads candidates; inspected function has no persist operation. The `auto_match` score label is not by itself an auto-write.
* `:1796 acceptMatchWithResolveDifference` explicitly invoked accept; locks bank row `:1800`, refuses reconciled session `:1809`, refuses nonpersistable kind `:1814`, checks expense posting `:1826`; `:1871` calls private `storeMatch`, which INSERTs canonical `banking.reconciliation_matches` at `:1031`; bank pointer update follows `:1941`. Multi accepts use same store at `:2223`. Audit call comments/call nearby `:1885`.
* `storeMatch` checks same document held by another bank line `:1013`; scope and duplicate concurrency need DB index proof, not only this precheck.
* Categorize route→`postBankCategorizationOnClient`→canonical poster source `bank_categorization` is a **different money writer** from accept; see DEGH-02. Flag `BANK_FEED_GL_POSTING_ENABLED` at `bank-feed-gl-posting.service.ts:55`; live override pending.
* `banking/recon-adjustments.service.ts:218` does create an expense through `accounting/bank-line-expense.service.ts:91`; unlike general categorize it has an actual expense document. That helper writes source bank link/load/unit/trailer/driver `:103`, lines`:156`, posts`:183`. Missing load generates a generic account-context exemption; not proof that a load cost is legitimately company-wide.
* Relay match helper remains a link-only alternate implementation; caller reachability not proven. No blanket statement that every Relay accept does or does not create a document.

## Guard evidence, not CI claims

Executed on pinned checkout:

```text
node scripts/verify-settlement-creator-owed-bill-posted.mjs --selftest
verify-settlement-creator-owed-bill-posted --selftest PASS (8/8)
```

Registration: `scripts/verify-steps/14821-verify-settlement-creator-ties-document.mjs:77–78` calls G4 selftest and static check. Expense stamp guard same step`:26–27`. No CI run URL inspected; **registered ≠ CI passed**.

```text
node scripts/verify-no-match-persisted-outside-accept-handler.mjs --selftest
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg'
```

That is missing local dependencies, not a product red or green. Registered `scripts/verify-steps/11683-verify-no-match-persisted-outside-accept-handler.mjs:4–5`. Posting linkage law entry at `docs/law/LAW.json:923`; current static/live execution not certified.

## Exact production queries proposed (not executed by this auditor)

Run only inside `BEGIN READ ONLY; SET LOCAL app.bypass_rls='lucia'; ... ROLLBACK;`. Schema-check fields first. Empty results must be repeated. All predicates below are USMCA-only.

```sql
-- Ambiguous account→item exposure. Does not identify a wrong saved check by itself.
SELECT default_expense_account_id, count(*) AS active_items
FROM catalogs.items
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND deactivated_at IS NULL AND default_expense_account_id IS NOT NULL
GROUP BY default_expense_account_id HAVING count(*)>1;

-- Money-out categorization with JE but no expense document: candidates, not all expenses.
SELECT count(*) AS je_only_money_out_candidates
FROM banking.bank_transactions bt
WHERE bt.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND bt.voided_at IS NULL AND bt.is_credit=false
  AND bt.matched_journal_entry_id IS NOT NULL AND bt.matched_expense_id IS NULL
  AND EXISTS(SELECT 1 FROM accounting.journal_entry_postings p
    WHERE p.journal_entry_uuid=bt.matched_journal_entry_id
      AND p.operating_company_id=bt.operating_company_id AND p.source_transaction_type='bank_categorization')
  AND NOT EXISTS(SELECT 1 FROM accounting.expenses e
    WHERE e.operating_company_id=bt.operating_company_id
      AND e.source_bank_transaction_id=bt.id AND e.voided_at IS NULL);

-- Live owed bills with absent initial bill posting (not proof of reversal correctness).
SELECT b.id,b.display_id,b.load_id
FROM accounting.bills b
WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
 AND b.voided_at IS NULL AND b.memo LIKE '[SC %'
 AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p
   JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid
   WHERE p.operating_company_id=b.operating_company_id
     AND p.source_transaction_type='bill' AND p.source_transaction_id=b.id::text
     AND j.voided_at IS NULL);

-- Validate actual trigger definitions/enabled state; no business-row scope broadening.
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='accounting' AND c.relname IN('bills','bill_payments','expense_lines')
  AND NOT t.tgisinternal;
```

## Explicit remaining coverage

No live DB calls, browser UI exercise, financial mutation tests, CI result inspection, or deployed-SHA confirmation were performed by this sub-audit. A/R aging/customer ties, AP vendor ties, recurring bills, all check-print/void routes, all payment unapply paths, all factoring reserve/short-pay/chargeback routes, bank import/webhooks, and every parallel writer's role/period-lock/retry are not fully audited here. Do not promote this supplement to “all engines verified.”

## Extension — additional D / E / H traces, same pinned SHA

This extension supersedes only the coverage limitations for the specific paths below. It does not claim all lifecycle variants were exercised. Coordinating auditor reports AR70 customer groups/0 differences, AP17 vendor groups/0 differences; payment/check/factoring/match populations zero on repeated reads. Those results are to be cited from the main audit SQL evidence, not treated as successful writer tests. Coordinating auditor also isolated four bank expense-category lines totaling66,225 cents without expense documents; DEGH-02 is no longer only an unmeasured possibility once the main evidence is attached.

### D: customer payment, apply/unapply, credit memo

Mount evidence: `apps/backend/src/index.ts:1374` calls `registerAccountingRoutes`; `accounting/index.ts:10–21` autoloads `.routes.ts` (checks explicitly excluded and mounted at index1395). `payment-applications.routes.ts:228` default plugin registers its route. `index.ts:922` explicitly registers credit memos.

| Action | UI/API → route | Service / SQL / transaction | Reversal and control |
|---|---|---|---|
| Receive payment | frontend `api/accounting.ts:1670`; backend `payments.routes.ts:406`; customer-specific second entry `customer-payments.routes.ts:163` | document INSERT492/238; applications555/307; in-client canonical receipt poster609/367 | Receipt creation and posting share connection/transaction. Both input paths need isolated parity/idempotency tests; two entry points alone are not a defect. |
| Apply existing payment | frontend `api/accounting.ts:1699`; `payment-applications.routes.ts:41` POST `/api/v1/accounting/payments/:paymentId/applications` | `payments/apply.service` called at route61; scoped readbacks85–95; per-application audit101 | Role predicate`canVoidCancel` at32; company context; application changes receivable allocation, not new cash. |
| Unapply | frontend `api/accounting.ts:1705`; route DELETE`.../:paymentId/applications/:id` at149 | scoped payment lookup163; UPDATE`accounting.payment_applications`180 sets`unapplied_at`/actor, no physical deletion; audit194 | No cash JE reversal expected merely for moving existing receipt allocation. Balance recompute functions filter`unapplied_at IS NULL`: migration`202612821200_acct_f5622_payment_void_recompute_unapplied_filter.sql:57,106`. Actual trigger installation pending. |
| Void receipt | frontend`api/accounting.ts:1677`; backend`payments.routes.ts:685` | role gate700; scoped FOR UPDATE730; `stampCustomerPaymentVoided`746 releases apps; `postVoidReversal`769; audit785 in same transaction | Existing grounded open-period reversal logic, not manual math. Exact all-source-leg reversal including deposit sweep must be exercised independently. |
| Credit memo create | `/api/v1/accounting/credit-memos`240; client accounting API credit-memo family | scoped customer253; active/postable same-company account263; INSERT279; `postSourceTransactionInClientTx`299; JE header backpointer306 | Dr selected account/Cr AR through existing poster. Account supplied explicitly, not inferred as revenue. |
| Credit apply/void | POST`:id/apply`333 /`:id/void`508 | app INSERT456; void locks memo533, archives applications543, stamps memo553, reverses`credit_memo`source569 | Void ignores only SOURCE_NOT_FOUND for memos whose GL belongs elsewhere; must prove alternate source ownership before interpreting no own-source JE as missing GL. |

### E: reserve entry documents and funding lifecycle

Faro reserve screens API: `frontend/src/api/factoring-faro-reserve.ts:57`short pay,`:88`preview,`:96`commit,`:107`post. Mounted `backend/src/index.ts:1251`.

* Import preview `faro-reserve-entries.routes.ts:80` calls pure preview; commit`:96` is explicitly Owner-only`:100` and calls `faro-reserve-entries.service.ts:313`. Writer creates actual Faro document`:326` then register bank line`:345`. These are an explicit Faro register import, not a bank assertion inferred from a missing relationship; no import executed in this audit.
* Post `routes:148` restricts to POSTERS role set`:151`; service`:441` rejects already-posted`:450`. `escrow_held` adopts purchase funding JE only after exact purchase-line reserve equality`:457–461`; it does not double-post funding.
* `rsv_deposit` refuses isolated posting`:462`, leaving it to payment-match orchestration. Source invoice's company/load and customer are resolved`:464–476` for posting stamps.
* Escrow→cash requires exactly one opposite-register pair with same Faro id, opposite amount and date`:483–499`; posts Dr cash reserve/Cr escrow reserve`:501–504`, then prepares settlement of remaining funded invoice face`:507`. No arbitrary unmatched transfer pair is accepted.
* Schedule-fee path first computes interest through fee date; if accrual is due, returns `interest_accrual_awaiting_approval` instead of hiding it`:510–525`. This is not a completed monetary post.
* Actual JE is created through shared creator at service`:588` with source `faro_reserve_entry` and derived customer/load. `cash-reserve-reclass.routes.ts:28–31` is separately role-restricted; mounted index1252.
* Chargeback on bank match calls existing `postFactoringChargebackEvent` via `match.service.ts` import24 and orchestration around1709. Full chargeback loan/recovered-cash edges remain unexercised; do not claim the chargeback table empty proves correct reversal.

### Check void, printing and stock

UI API`frontend/src/api/checks.ts:244`void,`:257`unvoid,`:345`batch confirm; `checks.routes.ts:848`void → `check-void.service.ts:31`; routes require accounting role/company membership. Void locks scoped check`:42`, delegates `voidDocument(type expense)``:50`, registry stamp`:83`, posting-status/reversal pointer`:90`, audit`:98`. It is not a seventh reversal engine.

Print endpoints`checks.routes.ts:741`preview,`:769`assign,`:805`confirm call `check-print-batch.service.ts:165`,`:173`,`:271`. Assign locks documents (queries101/124), writes batch204, number registry218, document number227, batch items233 and stock cursor258. Confirm locks batch282; success stamps printed303; reprint preserves spoiled numbers323 and resets document print metadata327. No accounting JE is created merely for printing. Migration`202614330000_check_engine_expenses_fields_and_registry.sql:101` uniquely constrains(company,bank,check-number). DB concurrency test files exist at`checks/__tests__/check-print-batch.concurrency.db.test.ts` and`check-print-batch.service.db.test.ts`; not executed.

### H: exact accept, variance accept, unmatch, transfers, owner/related-party loans

* Actual accept route`accounting/bank-recon/recon-worklist.routes.ts:107` authenticates role/company`:110–114`, calls`acceptReconMatch`:116; exact multi route235 uses same canonical match store. Reject`:148` writes state`rejected`, not accepted. No automatic accepted-match writer was confirmed in the searched code; historic strings`auto_matched`mostly qualify reads. This is not a universal absence proof for all crons/scripts.
* Unmatch route`:171`→`recon-worklist.service.ts:287`→`banking/bank-line-state-machine.service` `undoBankLineOnClient`; same transaction and company context`:296`. Central state machine selects undo by resolution_kind, not every unmatch blindly reversing the original document JE. Remaining branch-by-branch tests pending.
* **G6 split verdict now precise:** main accept`match.service.ts:1915` calls`bank-match-fuel-post.service.ts:42`. Relay path calls poster273 then **adopts expense document**296. Canonical`fuel_transaction`path reads/stamps load/unit and refuses nulls at99–112 but returns fuel poster directly129–151, with no document adoption call. The actual fuel poster source was searched for expense creation and has no expense INSERT or createExpense call. Hence Relay document correction exists, but canonical-fuel branch can still post without enforcing an expense document. A preexisting Creator/import expense may satisfy the document contract; count only fuel sources with neither existing nor adopted expense. **DEGH-07 P1, G6 partial.**
* **Variance contract conflict DEGH-08:** route schema`recon-worklist.routes.ts:24`still accepts`variance_account_id`; service`:211–220`requires/passes it for nonzero difference; frontend`BankReconciliationPage.tsx:229,497` supplies it. `match.service.ts:1147`difference helper checks period1203, then creates JE1209/1239 and supplied offset account1275. No reason-code/materiality flag is in this route's input. This is a confirmed raw-account posting route, conflicting with the earlier reason-only/$50/$500 owner order unless a later ruling explicitly superseded it. Report as policy-contract conflict needing ruling check, not assumed corrupt existing money; live match population is zero. The helper's own comment1271 acknowledges unresolved match-posting law.
* Transfer UI/API`frontend/src/api/banking.ts:1483`→`/api/v1/banking/transfers`, mounted index1231→`transfers.service.ts:271 createTransfer`: shared INSERT201/208; bank origin pointer297; in-client poster301. Existing best-effort after-commit helper at22 is not evidence this current creation path uses it. No default “posting is after commit” finding was made. Company-aware transfer flag off skips post at83; actual USMCA override must use parent measurement.
* Related-party engine mounted index1131: create route`accounting/related-party-loan-posting/routes.ts:379`→`create-entry.service.ts:158`; validates party/vendor at197, INSERT entries293, bank pointer332, schedule353, audit398. Separate post route473 calls`party-entry-post.service.ts:59/111`shared JE creator and audit125. Pair transfer route497 uses same family. Draft/posted distinction is real; creating a document is not proof it posted. Full account-role and counterparty reconciliation pending.

### Additional production query requests

Do not use `source_transaction_type='expense'` absence alone to identify missing fuel GL: coordinating auditor already proved152 expenses adopt live`fuel_event`JEs. For DEGH-07 first inspect `accounting.expenses` source-reference columns and trace the canonical fuel-to-expense FK in`fuel-expense-document.service.ts`; count fuel rows with live fuel_event JE and no corresponding live expense by the actual source linkage. Do not re-query frozen entities.

For DEGH-08, measure posted USMCA JE rows with source-bank postings and `memo LIKE 'bank-recon:%'`, excluding reversed/voided entries and separating card-discount split sources (`expense`) from generic raw-offset sources (`bank_transaction`). Zero is unexercised, not a passed behavioral test. Exact SQL should be composed against live inspected posting schema; no inferred column names.
