# B / C / F — Settlement, advances and fuel wiring

CODEX | 2026-10-12 10:21 AM CT | Read-only source audit at `3cad5d74d3e750005c988f531315e61a026c1c59`. No app or database writes. Accounting-decisions skill read; its historical measurements are NOT used as current production evidence. Production measurements are consolidated in the parent report. Every missing count below means **PROD CHECK PENDING**, never zero.

## Scope and limitations

Parent production evidence received at **2026-10-12 10:19 AM CT**: Q007 has 12 advances, all disbursed/recovered and `driver_settlement`; linked-bill mismatch **0**, unit mismatch **0**, trailer NULL **12**. Null trailer is not automatically incorrect where the load uses a customer trailer; the query does not resolve that distinction. Q001 confirms live `driver_bills` has **no unit/trailer columns**, so G9 is a structural driver-bill gap, not an inference from an INSERT alone. Advance triggers inspect audit/touch/WORM/bank linkage/company scope, not linked-bill driver/load equality. Q005 reports relevant company GL flags ON. These observations do not prove race safety or atomic failure recovery. Q006's 68 closed settlement headers with null accounting bill/payment pointers are **not a defect by themselves**: current close writes the per-load bridge `driver_settlement_gl_bills` at `settlement-ap-chain.service.ts:411`, containing accounting bill ID, original JE, cash/deduction payments and load; the parent must inspect that bridge instead.

This is a bounded deep trace of the mounted Creator, its pay/AP close, advance creation/disbursement and fuel import/document chains. It is not a claim that every script, cron, team-pay permutation, salary permutation, IFTA report, or reverse UI link has been executed. Source paths below are relative to repository root. Database migrations establish intended structure; applied status and live trigger definitions need the parent production inspection. No fixture writer was exercised. Static guard success is not production success.

## In-flight fixes checked against this SHA

| Gap | Fresh source verdict | Evidence |
|---|---|---|
| G2 trailer resolved before booking | PRESENT in code; runtime/DB proof pending | `settlement-creator-seed-loads.ts:326–327,361,425` resolves trailer choice before bookLoadOnClient. |
| G3 oldest-customer fallback | REMOVED in inspected path | `settlement-creator-seed-loads.ts:42–87` requires exact picked or named company customer and refuses unmatched; source guard mutation caught fallback. |
| G4 owed vendor bill | PRESENT: numbered, posted, retained for void-on-edit | `settlement-creator-owed-bill.ts:51–143` uses shared bill/poster; service `1606–1631` retains bill/JE IDs; edit `318` calls void helper. |
| G5 missing line load/unit | Null-load refusal PRESENT; semantic membership gap remains | Unit route field required `settlement-creator.routes.ts:54`; reimbursements `service:1703`, extra pay `1795`, fuel `1235` refuse unresolved IDs. Resolver accepts any live company load, not necessarily this driver/settlement. |
| G7 one fuel attribution | PARTIAL | `fuel-transaction-import.ts:358` and `bank-match-fuel-post.service.ts:214` call `resolveFuelLoadAtTime`; Creator still uses different date-window rule at `service:1232`. |
| G9 driver-bill/advance physical links | PARTIAL / PROD SCHEMA CHECK PENDING | Driver-bill INSERTs at `book-load.service.ts:1249,1335`, `historical-driver-bill-backfill.service.ts:289` omit unit/trailer; AP chain separately derives/stamps its accounting bill. Advance validates load but stores body unit/trailer. |
| G12 duplicate fuel rule | Source helper + newer migration aligned | `fuel-provider-reference.ts:23,88` strips load suffix, compares company/vendor/base/provider/product; migration `202615610900_g6_suggestion_without_pointer_and_fuel_duplicate_on_base_invoice.sql:48–87` normalizes same base in DB. Applied status pending. |
| G13 shared expense writer | NOT COMPLETE at pin | Creator still directly INSERTs expenses and lines at `settlement-creator.service.ts:1643,1660`, while fuel/owed bill use their shared writers. |
| G14 deduction account by item/type | PRESENT | `settlement-creator-deduction-type.ts:30–80` resolves role mapped to selected item's account; named admin exception; escrow category refused there. Service `1882–1885` passes resolved type. |
| G15 lumper advance expense posting | NOT COMPLETE in traced path | Core stores `load_expense` HOLD metadata and excludes lumper from historical posting (`cash-advance-create.ts:422,478,490,675`). Split helper has no non-test call in backend; its expense writer never invokes poster. |

## B. Creator and settlement chain

| Entry point / route | Service → SQL | Canonical tables and links | Posting, flag and guard |
|---|---|---|---|
| Drawer Post/Edit `apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx:1259,1287`; API `apps/frontend/src/api/settlementCreator.ts:200`; POST `/api/v1/driver-finance/settlement-creator/post` `settlement-creator.routes.ts:284` | Role Owner/Admin/Accountant, explicit USMCA, company membership; one `withCurrentUser` transaction at `routes:305`; admission → `ensureDispatchedLoadsForCreator` → `postSettlementCreatorInClientTx` | Loads via bookLoadOnClient; settlement adoption; documents and GL share caller transaction. Exact driver/unit/customer/trailer picked and preflighted. | Close then after-commit factoring/billing. `runCreatorAfterCommit` and `overallOk` report incomplete stage instead of literal success (`routes:320–345`). Atomic guard 7/7. |
| Same route: driver pay | `service:1909–1937` rate × pay miles; `writeDriverPayLine:204–251` updates/inserts settlement lines | `driver_finance.settlement_lines` load+settlement+opco+item; pay independent of invoice amount. Booking creates driver bills (`book-load.service.ts:1249,1335`). | Existing close engine, not new GL. Driver-pay independent guard 6/6. DB item/check verification pending. |
| Same route: owed company expense | `service:1606` → `writeCreatorOwedBill` → `createBillInClientTx` → poster, helper `:70–143` | `accounting.bills` + lines; vendor, item/account, load, driver, unit, trailer. Number from load spine; vendor number distinct from display number. Unit/trailer request preferred with load fallback. | Dr item's account / Cr A/P; failure throws. ID retained in posted audit; Edit `voidCreatorOwedBills` uses voidDocument. Guard 8/8. |
| Same route: card-paid company expense | Direct header `service:1643`, lines `1660`, poster `1676` | `accounting.expenses/expense_lines`; company, load, vendor, driver, unit/trailer body, item/account, quantity/rate/UOM; explicit Relay/Dreamline rail; no old Relay default. | Dr item expense / Cr resolved card/wallet rail. Throws if poster refuses. G13 still duplicated writer. |
| Reimbursements / additional pay | `service:1703–1750,1795–1827` | Settlement lines now get load via common Creator resolver, account/item (extra-pay item refused when missing). Resolver verifies opco/live existence only. | Close → AP per-load lines; extra-pay rate computed `Math.round(amount_cents / quantity)` at1808, precision behavior requires isolated fractional-quantity test. |
| Deductions / admin | `service:1832–1885` → createSettlementDeduction → deduction row + application settlement line | `driver_settlement_deductions` load+driver+company; settlement line source_table/source_reference_id points back, applied_to_settlement_id stamped. Admin must be a load-assigned line; aggregate admin_fee refused. Item determines type/account. | Recovery account resolved by existing role engine; no catch swallowing. Four deduction-line mutation plants caught. |
| Escrow | `service:1763–1789` → escrow_contribution settlement line → close `recordEscrowContribution:1238` / writer `1559` | `driver_finance.escrow_ledger`, own driver escrow subaccount, load+settlement. First-load fallback is explicitly owner-authorized in `settlement-creator-line-load.ts:16–17`; **not reported as defect**. | Escrow liability, not generic item income. Exact deployed account numbers/row counts pending. |
| Pay-run close → A/P | `settlement-payrun-close.service.ts:608,1329`; `settlement-ap-chain.service.ts:266–286,329–346,411` | Per-load accounting bill created from driver bill / salary load, itemized lines, source bridge `driver_settlement_gl_bills`, bill JE required. Trailer stamped from load. | Dr pay/reimbursement accounts / Cr A/P; applications Dr A/P / Cr deduction/escrow/advance accounts; remaining payment through existing bill-payment service. `SETTLEMENT_GL_POSTING_FLAG_KEY` evaluated per opco; actual key/state pending parent query. |

### Old October 10 claims rechecked — do not repeat as current findings

Invoice-as-driver-pay is corrected; authorized $0 invoicing path exists; customer fallback is refused; company vendor/payment-source/quantity/item links are supplied; generic/admin deduction load is supplied; booking and posting share one transaction; after-commit errors are persisted/reported. These are source conclusions, not certification of a successful seed. Escrow first-load default is now expressly ruled valid. Driver bill creation still has salary/team exceptions; “exactly one driver bill per load” must not be imposed blindly on split-team/zero-pay salary designs.

## C. Advances, loans and lumper

| Entry point | Call / writer | Links, ledger, guard |
|---|---|---|
| POST `/api/v1/cash-advances` `cash-advances.routes.ts:323` | `createDriverCashAdvanceCore` at341; liabilities INSERT `cash-advance-create.ts:406`; schedule `445,461`; advances `502,562`; audit `637` | Driver/company; linked driver bill/body load/unit/trailer; own advance subaccount provisioned; balance-overflow handling. Nullable unit/trailer FKs migration `202607720000_driver_advance_wizard_depth.sql:16–20`. Same-company reference trigger migration `202615360400_no_record_points_at_another_companys_unit_driver_trailer.sql:79–80` is not load equality. |
| Creator advance section | `settlement-creator.service.ts:1522–1558` resolves by advance date, then typed load; picks one bill for driver/load unless explicit bill supplied; calls same core | historical-backfill posting in caller transaction at `cash-advance-create.ts:675–690`, Dr own1245 advance asset / Cr driver clearing role (code documents2170), only if DRIVER_ADVANCE_GL_POSTING_ENABLED. No assertion after flag skip. |
| Driver request approve `cash-advance-requests.routes.ts:359` (caller398), direct request caller339, bank-driver-advance.service304 | `disburseDriverAdvanceCore`: separate transaction status update at85, GL transaction145 | CONFIRMED two-phase retry defect below. Bank-driven path additionally BANK_DRIVER_ADVANCE_ENABLED; flag state must be measured. |
| Lumper purpose in generic creation | `resolveEconomicRouting`132 → zero personal liability/outstanding at422/425/550 and no deduction schedule; no expense poster in this branch | Correct not to make operational lumper driver debt, but operational expense document/posting remains absent here. |
| Dormant lumper split | `lumper-cash-advance-split.ts:119` → bill payment174 / expenses240 / lines250 | Env-only `LUMPER_LIFECYCLE_ENABLED` at40. No non-test caller found by exact function/import search across backend. Expense marked posted but lacks item/vendor/payment-account and poster invocation. Do not flip flag to treat this as complete. |

## F. Fuel and document chain

| Entry | Writer / linkage | Posting / duplicate / report coverage |
|---|---|---|
| POST `/api/v1/fuel/transactions/import` `fuel-transaction-import.routes.ts:66`; role gate + membership | map spreadsheet → importFuelCardTransactionsForCompany; `fuel-transaction-import.ts:358` calls resolveFuelLoadAtTime, insert400; helper `fuel-load-at-time.ts:33–82` unit actual-time first, driver fallback, load's trailer helper | After-commit flush + ingest hooks in route. Imported fill→expense document service; role/item/receipt. Fuel attribution DB test exists but not run here. |
| Creator fuel | `settlement-creator.service.ts:1232` uses local inclusive DATE window; resolves ID, vendor; duplicate refusal1275; fuel insert1316; shared fuel document1370 | Purchased time synthesized dateT12:00Z1360; exact product hash. Explicit load overrides date. Relay requires ingested txn and posts via Relay fill; Dreamline via expense. Separate attribution rule remains. |
| Relay at bank acceptance | `bank-match-fuel-post.service.ts:214` uses resolveFuelLoadAtTime; document adoption `fuel-expense-document.service.ts:795,815` | Same existing JE adopted, not a second fuel JE; main document writer `:471,534,571`, load links604; Relay fee separate expense line. Live duplicate/adoption correctness pending. |
| Provider uniqueness | `fuel-provider-reference.ts:23,88`; Creator1275 | Company/vendor/base receipt/product; diesel and DEF on same ticket distinct; suffix cannot evade. DB migration202615610900 replaces trigger with same normalization. Source row hash remains separate dedupe control. |
| IFTA | Not executed in this bounded section | Product differentiation exists (reefer_diesel vs diesel); independent IFTA report aggregation and missing-state/gallons audit remains a coverage gap, not green. |

## Findings — code proven, production extent pending

| ID | Severity | Exact evidence / defect | Root-cause correction / in-flight |
|---|---|---|---|
| BCF-01 | P0 | `cash-advance-disburse.ts:58–154`: status commits before GL. Poster failure leaves disbursed document without ledger. Retry requires approved at75 and returns409, so the documented retry cannot recover. FlagOFF130 also returns success unposted. Reachable callers identified above. | Commit status+poster atomically or durable idempotent post stage that accepts a disbursed-but-unposted retry; never silently succeed when posting is required. Not covered by Creator atomic fix. |
| BCF-02 | P0 | `cash-advance-create.ts:197–219`: linked-driver-bill query validates only ID/company, retrieves only gross. Does not assert driver/load match, bill not void, or lock balance while summing prior advances. Two concurrent requests can both allocate same remaining balance. | Lock bill, validate live bill/driver/load coherence before deriving capped allocation and overflow. Runtime race reproduction / DB trigger proof pending. G9-related, not resolved in inspected core. |
| BCF-03 | P1 | `cash-advance-create.ts:355–365` selects load assigned_unit_id but discards it; writes body.unit_id/trailer_id at545–546. Creator1554 sends unit but no trailer. | Resolve physical links from selected load using canonical helpers and validate explicit overrides; do not merely enforce same company. G9 still open. |
| BCF-04 | P1 | `settlement-creator.service.ts:2285–2305`: explicit load accepted if any live company load; `creatorLineLoadNumber:113` bypasses draft membership for typed number. Fuel/paid company expenses then write draft driver/unit/trailer independently. Additional driver-pay items have a downstream `PAY_ITEM_LOAD_NOT_ON_SETTLEMENT` check at `settlement-ap-chain.service.ts:224`; do not claim that bypass is proven for them. | Validate permitted settlement/driver/unit relationship or explicit documented cross-load allocation contract before inserting fuel/company expenses. G5 only proves non-null at the resolver, not correct load. |
| BCF-05 | P1 | `settlement-creator.service.ts:1232` and `settlement-creator-line-load.ts:26–48` retain second fuel attribution rule versus `fuel-load-at-time.ts:33`. | One canonical attribution contract with explicit date-only historical evidence mode and ambiguity handling. G7 partial; static guard currently checks import/Relay, not Creator. |
| BCF-06 | P1 | G15 core operational lumper advance path stops at advance/liability; dormant split not called and does not post expense (`lumper-cash-advance-split.ts:240–287`). | Wire operational receipt/document/expense posting through existing engine with load/vendor/item/payment source, and query reverse link. Do not classify personal-recovery absence as the defect. |
| BCF-07 | P2 | G13 Creator direct expenses/lines SQL1643/1660 bypass shared expense creation; existing extra fields do not make it shared. | Route through the shared expense engine preserving same transaction and source/physical fields. Present guard checks fields, not single writer. |
| BCF-08 | P1 | Driver bill SQL1249/1335/289 lacks unit/trailer. Parent Q001 confirms live driver_bills has neither column. AP bills correctly stamp these downstream, which does not put them on the driver-bill document. | Implement the agreed load-derived driver-bill physical linkage contract and prove reverse readers; G9 not complete at the pinned state. |

## Guards actually executed here

All are file-only mutation selftests unless explicitly marked otherwise. They prove the guard reacts to its planted change, not ledger/runtime correctness.

| Command suffix `--selftest` | Actual result |
|---|---|
| verify-settlement-creator-every-line-has-load.mjs | exit0,11/11 |
| verify-settlement-creator-owed-bill-posted.mjs | exit0,8/8 |
| verify-settlement-creator-atomic-post.mjs | exit0,7/7 |
| verify-settlement-creator-driver-pay-independent-of-invoice.mjs | exit0,6/6 |
| verify-settlement-creator-invoice-number-and-zero-invoice.mjs | exit0,12/12 |
| verify-settlement-creator-deduction-has-settlement-line.mjs | exit0,4 plants |
| verify-fuel-g18-load-link-rematch.mjs | exit0,7/7 |
| verify-settlement-creator-no-quickpay-on-factored.mjs | exit0,5/5 |
| verify-fuel-expense-is-unique-per-provider-transaction.mjs | exit1,1/2; child process ERR_MODULE_NOT_FOUND in isolated worktree. **Environment failure, not product duplicate finding and not live pass.** |

Creator guards are called in `scripts/verify-steps/14821-verify-settlement-creator-ties-document.mjs:18–85`; fuel attribution is wired by step2000. Current hosted CI run and actual step selection have not been proved by this section. No green CI claim is made.

## Read-only production queries handed to parent (not executed by this sub-audit)

```sql
BEGIN READ ONLY;
SET LOCAL app.bypass_rls='lucia';
SELECT count(*) AS joined_live_advances,
 count(*) FILTER (WHERE a.driver_id IS DISTINCT FROM b.driver_id
                    OR a.load_id IS DISTINCT FROM b.load_id OR b.voided_at IS NOT NULL) AS incoherent_bill_link
FROM driver_finance.driver_advances a
JOIN driver_finance.driver_bills b ON b.id=a.linked_driver_bill_id AND b.operating_company_id=a.operating_company_id
WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL;

SELECT count(*) AS joined_live_advances,
 count(*) FILTER (WHERE a.unit_id IS DISTINCT FROM l.assigned_unit_id) AS unit_mismatch,
 count(*) FILTER (WHERE a.trailer_id IS NULL) AS trailer_null_not_automatically_violation
FROM driver_finance.driver_advances a
JOIN mdata.loads l ON l.id=a.load_id AND l.operating_company_id=a.operating_company_id
WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL;

SELECT count(*) AS disbursed_without_live_post
FROM driver_finance.driver_advances a
WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
 AND a.voided_at IS NULL AND a.disbursement_status='disbursed'
 AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
 JOIN accounting.journal_entries j ON j.id=p.journal_entry_id AND j.operating_company_id=a.operating_company_id
 WHERE p.operating_company_id=a.operating_company_id AND p.source_transaction_type='driver_advance'
 AND p.source_transaction_id::text=a.id::text AND j.voided_at IS NULL);

SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='driver_finance' AND c.relname IN ('driver_bills','driver_advances') AND NOT t.tgisinternal;
ROLLBACK;
```

The parent must inspect schema first and preserve actual errors rather than silently changing a failed query into a zero. Empty populations are repeated before reporting. A zero violation on an empty table is **no exercised writer evidence**.

## Extended B/C/F trace — additional surfaces, 2026-10-12

### Production result corrections supplied by parent

The current per-load AP bridge has **146 active rows**, all with valid bills, original journal entries and load links. **67 nonempty closed settlements** have bridges. The remaining closed settlement **P-0067 has zero gross/net and zero active lines**. Neither this zero-pay settlement nor the header's null singular bill/payment fields is an AP defect. Parent also measured **11 advances missing an owned-trailer link** (stronger than the earlier unqualified NULL count) and **64 Creator expense memos missing attribution records**; use the parent query log for the exact populations and times. AP ties across17vendor groups and AR across70customers are distinct live tests; neither establishes every writer's future correctness.

### Team and salary branches are not interchangeable with one-bill-per-load

- `dispatch/book-load.service.ts:610–619,944–965`: a valid explicit zero-rate salaried override produces `not_minted_salaried` with an audit event, not a per-load driver bill. Creator salary adoption/close uses salary lines and the AP chain's salary-load branch (`settlement-ap-chain.service.ts:132–147`). This is an explicit owner-designed exception, not an orphan.
- `dispatch/book-load.service.ts:1195–1240`: an active team gets two driver bills, suffixes `-P`/`-S`, split using `effectiveTeamPercentsFromRow` and `splitTotalCents`; deadhead is allocated using the same shares. Original rate is retained, not recomputed from a driver's portion. Missing/inactive team returns `not_applicable` at1216; route booking validation of invalid team IDs must also be proved before treating that outcome as safe. No team fixture was executed.
- `settlement-ap-chain.service.ts:403–425`: closes each real driver bill and records per-load accounting bill/JE/payment IDs in `driver_settlement_gl_bills`. Salary rows have a null driver_bill_id deliberately. Reversal must use that bridge, not a settlement header's single payment field.

### Extra pay, detention and reimbursements outside Creator

| Entry/route | Chain and finding |
|---|---|
| Frontend API `apps/frontend/src/api/driverFinance.ts:1059`; POST `/api/v1/driver-finance/settlements/:id/pay-lines`, `settlements.routes.ts:1273` | `addSettlementPayLineInClientTx` in `settlement-pay-line.service.ts:37–75` locks open settlement, validates named load is on it or attributes date, resolves driver-pay role, INSERTs line65, recomputes header and audits. **Does not accept or insert item_id.** Non-detention kinds become extra_pay. Migration `202614680000_g2_settlement_line_item_splits_and_extra_pay_item_required.sql:61` requires an item for positive extra pay. Live constraint/BEFORE-trigger verification needed; isolated call not exercised. |
| POST `/api/v1/dispatch/detention-events/:id/post-driver-pay`, `detention-pay-posting.routes.ts:25` | Role accounting; `postDetentionPayForEvent:63–160` requires closed event, driver, evidence, no existing active source-linked line; derives pay from event accrued minutes × load's driver detention rate (not customer invoice). INSERT135 stamps source event, load, company and approval pending; no immediate JE, settlement close owns posting. Actual concurrent idempotency and event-reopen reversal not proved; comments say later work, which is not evidence. |
| Driver reimbursement detail read `accounting/driver-reimbursement-detail.routes.ts:30` | Reads canonical driver reimbursements. No create/pay route caller of `createDriverReimbursementCore` / `payDriverReimbursementImmediately` was found anywhere in backend after exact-symbol search; therefore do not portray the service as a mounted immediate-pay UI engine. |
| Legacy seed/scripts | `scripts/seed-settlements-codex.ts:722`, `seed-settlements-cc-3.ts:700`, `backfill-settlement-5772-lines-gl.ts:86` call createDriverReimbursementCore. Core `driver-reimbursement.service.ts:76` INSERTs header with optional load and no item/physical links. It tries to materialize open settlement lines at127–149, catching failures; whether all failures leave caller transaction aborted must be tested on an isolated DB, not production. |
| Unwired immediate reimbursement service | `driver-reimbursement.service.ts:160–321` commits paid status, then posts. Unlike advance disbursement it permits already-paid retry. **Latent financial defect:** every retry decrements bank balance again at279–280 before the idempotent poster284; `alreadyPaid` is never used to suppress the duplicate cache write. No current app caller found, so this is an unwired P2 defect rather than a claim of production cash movement or a reached P0. |

### Deduction void and escrow history

- Deduction create POST `deductions.routes.ts:195` delegates to `createSettlementDeduction`. PATCH `/:id/void:484` delegates `voidSettlementDeduction`; generic `voidDocument` also dispatches `reverseDeductionForVoid` (`accounting/void-document.service.ts:236`). These share logic rather than require a new reversal engine.
- `settlement-deduction-void.service.ts:74–187` locks the row, voids pending/uncollected remainder; applied deductions are explicitly retained with no reversing JE, per the source's owner ruling against debt forgiveness/refund (`:150–180`). **Do not flag that intentional record-only branch as a missing reversal.** Route comments claiming every applied void reverses money are stale comments, not the implemented accounting.
- Creator Edit separately unwinds its applied deduction through the settlement's reversal orchestration; `settlement-payrun-subledger-unwind.service.ts:48–76` restores the recorded advance recovery snapshot, not an invented current balance; `:85–151` reverses only held escrow supported by original/reversing JEs and refuses release beyond the settlement's remaining hold.
- `escrow-forfeit.routes.ts:47–147`: Owner/Admin, same path/body driver, company membership, signed-clause and draw-catalog eligibility gates; delegates `forfeitDriverEscrow`. `escrow-forfeit.service.ts:102,204` provides one on-client writer reused by `abandonment.service.ts:426`, not a second abandonment forfeiture engine.
- `escrow-separation.routes.ts:94` calls releaseDriverEscrowSeparation; `escrow-separation.service.ts:366` appends release history. Detailed settlement-to-claim tracing and release cent tie-out remain production/test coverage pending.
- **Exact escrow_ledger SQL writers found in backend:** `settlements/approval.service.ts:407`, `driver-finance/escrow-forfeit.service.ts:204`, `historical-escrow-backfill.service.ts:133`, `settlement-payrun-close.service.ts:1579`, `settlement-payrun-subledger-unwind.service.ts:131`, `escrow-separation.service.ts:366`. They are six writer sites with different events, not automatically six duplicate GL engines.
- Mounted legacy POST `/api/v1/driver-finance/feed-day/run` (`historical-feed-day.routes.ts:168`, `index.ts:1117`) calls executeHistoricalFeedDay then `createHistoricalEscrowHold` at `historical-feed-day.service.ts:202`. That helper creates escrow history and an accounting escrow deposit **without linked_journal_entry_id** (`historical-escrow-backfill.service.ts:133–168`), unlike current Creator close. **P1 alternate-path coverage gap:** prove downstream GL adoption or refuse incomplete historical escrow. Do not conflate this legacy entry point with the corrected Creator.

### Driver subaccount identity and concurrency

`accounting/driver-subaccount-number.ts:24` obtains a transaction advisory lock per company, reuses the driver's prior nnn, otherwise takes maximum including retired linked numbers and refuses above999. `claimDriverSubAccountNumber:80–106` refuses another driver's occupied number. Provisioner `driver-subaccount-provision.service.ts:359,437` calls it before inserting Asset/Liability accounts (`:363,441`). Parent binding is entity-pinned. Relevant number family is1245/1255/1256/1257/2100 with stable nnn; exact per-family live provisioning counts and name-match reuse behavior remain parent master-data audit scope. Do not copy an account based only on apparent matching label.

### Advances: recovery, overflow, reversal

`cash-advance-create.ts:197–250` caps a linked bill's remaining balance, recursively creates excess as a loan without linked_driver_bill_id. It checks total prior nonvoided advances but does not lock the linked bill (BCF-02). Recovery at `settlement-payrun-close.service.ts:476–503` uses GL-derived `v_driver_advance_balances`, positive outstanding, eligible statuses and `FOR UPDATE OF a`, oldest first. It does not use an old stored balance as proof of debt. Recovery snapshots drive the inverse in `settlement-payrun-subledger-unwind.service.ts:48–76`. Production all12advances recovered does not test concurrent creation or phase2 failure.

### Relay/Dreamline and remaining fuel writer inventory

- Relay daily/backfill cron `integrations/relay-payments/relay-fuel-ingest.cron.ts:286` calls upsertRelayFuelTransaction. Ingest stores product lines, links existing settlement fuel via `linkRelayFillToSettlementFuelRows` (`relay-fuel-ingest.service.ts:375`), computes fee/drawdown once, and updates the Relay wallet bank-feed representation (`:390`). At `:385–388` it explicitly does **not** create canonical fuel or post GL. The commented historical bridge is not current behavior.
- `relay-fuel-canonical-bridge.ts:40–180` remains an orphaned exported writer; exact symbol search finds only its definition and comments, no active call. Its loop aggregates products/gallons and assigns the last product type, but that latent defect is **not** claimed as current Relay ingestion behavior.
- Creator/statement fuel for Dreamline uses selected card type and shared fuel document → expense poster; Relay acceptance uses `bank-match-fuel-post.service.ts:214` then adopts the existing JE into the expense via `fuel-expense-document.service.ts:795`. These are two justified document origination modes, not proof they are duplicate charges.
- **Five canonical fuel INSERT sites found in backend:** `fuel/fuel-transaction-import.ts:378`, `fuel/fuel-transactions.routes.ts:453`, `driver-finance/settlement-creator.service.ts:1316`, `feed/seed-settlement-document.service.ts:974`, and the currently uncalled Relay bridge`:92`. The older seed writer is a distinct mounted legacy feed path; manual/source ingestion must be brought under the same validations. Product/base receipt DB refusal protects at SQL level only if applied; hashes/source semantics differ.
- Exact card-source and IFTA reverse links for every manual/legacy path are **not fully verified** in this section. No assertion that all fuel paths now use one resolver: Creator date-window rule remains, and old seed/manual paths require their own review.

### Additional findings to merge into the main findings list

| ID | Severity | Evidence | Required fix / verification |
|---|---|---|---|
| BCF-09 | P1 confirmed code/constraint incompatibility | `settlement-pay-line.service.ts:65` writes extra_pay with no item; sibling Creator fixed this. Parent Q023 confirms live `settlement_lines_extra_pay_requires_item` requires item for extra_pay and no BEFORE trigger supplies it. NOT VALID does not exempt new INSERTs. | Pass and validate selected pay item before INSERT; prove an isolated request. No production write was invoked by this audit. |
| BCF-10 | P2 latent financial | `driver-reimbursement.service.ts:201,279` allows already-paid retry yet repeats bank cache debit; no active backend pay caller found. | Make cache adjustment exactly-once with poster; wire only after isolated retry test. No live external-money impact asserted. |
| BCF-11 | P1 alternate path | Mounted feed-day legacy escrow helper appends an accounting deposit without original JE link (`historical-escrow-backfill.service.ts:160`). | Require same canonical close/adoption contract or explicitly refuse incomplete historical write; measure actual unlinked deposits before quantifying. |

Additional parent queries requested: paid immediate reimbursement count with from_bank_account_id; settlement_lines extra_pay item CHECK and BEFORE-trigger definitions; accounting escrow deposit source_type driver_settlement with linked JE/source IDs null. These are USMCA-only read-only schema/data queries; no monetary row was changed by this review.

### Final live supplements and explicit coverage boundary

CODEX | 2026-10-12 10:46 AM CT (15:46Z) | Parent query evidence: Q023 at15:45:51Z confirms BCF-09's live CHECK incompatibility; the BEFORE triggers derive company, protect WORM deletion and validate cross-company disputed_by/split_partner, and do not supply item_id. This is proof of the schema/code incompatibility, not a production mutation test.

CODEX | 2026-10-12 10:46 AM CT (15:46Z) | Q024 at15:46:10Z finds45 escrow deposits with source_type driver_settlement; missing JE links0, missing source IDs0. Accordingly BCF-11 is a future alternate-writer gap, **not a current orphaned-deposit population**. Nonvoid reimbursements0, repeated in Q025 as0: BCF-10 has no current live population and remains latent/unwired.

This bounded audit does **not** certify: every team validation branch before booking; isolated concurrent advance-overdraw behavior; isolated reimbursement retry/cache behavior; every settlement edit/cancel partial-failure path; all escrow release/forfeit claim-link and cent ties; detention event reopen/reversal; every manual/legacy fuel writer's IFTA/source-card reverse links; historical escrow downstream adoption under the legacy feed endpoint; or hosted CI execution of the named selftests. Those need independent tests/trace, not an extrapolated all-engines-green claim. No application implementation or production data was changed.
