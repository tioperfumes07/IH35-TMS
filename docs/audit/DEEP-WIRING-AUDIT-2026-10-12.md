# Deep wiring audit — engines A–K

CODEX | 2026-10-12 10:50 AM CT (15:50Z) | Independent read-only audit; review required; **not an all-engines certification**.

## Scope, pin and evidence rules

- Audited origin/main: `3cad5d74d3e750005c988f531315e61a026c1c59`. Isolated branch `codex/deep-wiring-audit-2026-10-12`.
- Only USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`; production Neon `tiny-field-89581227/br-fancy-credit-akjnd07a`.
- Production measurements below were taken October 12, 2026, 10:16–10:48 AM CT. Exact timestamps, SQL and results are in the evidence files. They are multiple read-only snapshots, not one repeatable-read snapshot across the entire audit.
- All database batches used READ ONLY and transaction-local Lucia bypass. No production INSERT, UPDATE, DELETE, seed, migration or writer request was executed. Q001 confirmed read-only=on and bypass=lucia.
- The health endpoint at 10:17 AM CT returned HTTP 200, deployed SHA `90398860f5d63ae4ac887d462d894a775c8ef69f`, build time 15:14:00.936Z. This is **not the audited main SHA**. Source findings apply to the pinned checkout; production counts describe the measured database. Deployment parity is not asserted.
- At 10:53 AM CT, health again returned HTTP200, now SHA `f6b993dc760d471c1dad2d8641d35749845bc9fb`, built15:37:07.870Z. Deployments changed during this audit; later fixes may supersede pinned-code findings and require separate re-verification.
- Seven query batches failed and are retained as errors, never zeros. Corrected queries follow; Q017's final resolver-function inspection remains unexecuted rather than using an unscoped row resolver.
- Empty populations were rerun before being reported. Zero current rows cannot prove a writer works.
- P0 below means a source-proven branch can misstate money/identity, **not that the audit observed that monetary loss in production**. No loss amount is assigned to an unexercised branch.
- Documents only. Do not merge this audit PR; Lead review and fix assignment are separate.

### Evidence bundle

| Artifact | Contents |
|---|---|
| [Findings CSV](DEEP-WIRING-AUDIT-2026-10-12-FINDINGS.csv) | 33 findings: 7 P0, 24 P1, 2 P2; source anchors, measured exposure, root-cause direction, G1–G15 overlap |
| [Executed SQL](DEEP-WIRING-AUDIT-2026-10-12-PROD-QUERIES.sql) | Q001–Q028, including failed attempts as comments |
| [Query results](DEEP-WIRING-AUDIT-2026-10-12-QUERY-EVIDENCE.json) | Actual returned result sets/errors and original SQL |
| [A/J/K writer maps](DEEP-WIRING-AUDIT-2026-10-12-AJK.md) | Dispatch, hubs, maintenance, safety and IFTA source chains |
| [B/C/F writer maps](DEEP-WIRING-AUDIT-2026-10-12-BCF.md) | Settlement, advances, fuel; source chains and tests |
| [D/E/G/H writer maps](DEEP-WIRING-AUDIT-2026-10-12-DEGH.md) | AR, factoring, AP/checks, banking |
| [Migration comparison](DEEP-WIRING-AUDIT-2026-10-12-MIGRATION-COMPARISON.json) | Repo/production ledger comparison, pending files, approved checksum differences |
| [Writer candidate inventory](DEEP-WIRING-AUDIT-2026-10-12-WRITER-INVENTORY.csv) | 2,463 lexical candidates in 755 files / 375 table names; explicitly NOT individually audited |

The supporting maps are part of this report. Their older “parent production pending” annotations are resolved **only** by a matching query identified here; every other pending annotation remains pending. Inventory rows are candidates, not confirmed defects or proof of complete coverage.

## Executive measurements

| Assertion | Measured result | Query / CT time |
|---|---:|---|
| Posted nonvoid JEs; zero-line; unbalanced | 1,391; 0; 0 | Q005, 10:18 |
| Total debits = credits | $1,420,998.54 = $1,420,998.54 | Q005 |
| A/R control = open invoice subledger | $477,831.72 = $477,831.72 | Q009, 10:26 |
| Customer-level A/R mismatches | 0 across 70 customer groups | Q013, 10:27 |
| A/P control = open bill subledger | $103,919.26 = $103,919.26 | Q009 |
| Vendor-level A/P mismatches | 0 across 17 mapped groups; unmapped GL parties 0 | Q016, 10:29 |
| Posting rows lacking source-spine links | 0 / 3,564 | Q009 |
| Recorded reversal rows missing original or noninverse amount | 0 / 337 | Q009 |
| Expense postings lacking entity despite source payee | **10 / 976** | Q022, 10:35 |
| Load expenses lacking matching expense attribution link | **64 / 632; $12,895.58** | Q011/Q013/Q016/Q022 |
| Those missing links with Creator memo and header JE | **64 / 64** | Q022 |
| Driver AP bills lacking trailer while source load has one | **4** | Q013/Q022 |
| Advances lacking owned trailer while source load has one | **11 / 12 advances** | Q018/Q022 |
| Active real nonarchived drivers with no linked active vendor | **5 / 23** | Q011/Q018 |
| Expense load→unit/driver mismatches | 0 / 632 | Q003 |
| Fuel load→unit/driver mismatches | 0 / 644 | Q011 |
| Invoice customer differs from its source load | 0 / 148 | Q003 |
| Live invoice lines missing item; header/line-total differences | 0 / 148; 0 | Q020 |
| Live expense-line item-account mismatch without override | 0 / 865 | Q006 |
| Money-out expense-account bank lines without expense document | **4; $662.25 expense debit** | Q011/Q018 |
| Live fuel base-reference duplicate groups | 0 | Q011/Q018; actual provider-base function used in second read |
| Company tables lacking enabled+forced RLS or any policy | 0 / 278 inspected tables | Q020/Q021 |
| Settlement escrow deposits lacking JE/source link | 0 / 45 | Q024, 10:46 |

These are named populations, not “everything ties.” RLS presence does not prove policy correctness under every role. Current fuel/load driver agreement does not prove event-time/GPS attribution. Reversal-row symmetry does not prove every voided document has received a reversal.

## A. Loads and dispatch

Full per-route map: [A/J/K supplement §A and extension](DEEP-WIRING-AUDIT-2026-10-12-AJK.md).

Primary chain: frontend dispatch API → POST `/api/v1/dispatch/loads` (`dispatch/loads.routes.ts:1722,1779`) → `bookLoad/bookLoadOnClient` → `createLoadWithFullSideEffects` → canonical load/stops/history/driver-bill/presettlement/outbox writers. SQL anchors: `book-load.service.ts:2852,3125,3157,1249,1335`. Company membership and owned/leased unit lookups are explicit; trailer choice is required on live-feed path, with historical exceptions.

Findings:
- AJK-01: same gross is treated as “unchanged” before comparing a reassigned bill's driver. **0 eligible open solo bills** in Q007 means the risky branch was not exercised.
- AJK-03: booking discards fence outcome and transitions lack a required-fence check. **309 stops have coordinates, zero missing** (Q016); coordinates are not fence readiness.
- AJK-10: owner approval after a pending cancellation does not run the initial financial cascade.
- AJK-11: immediate billable cancellation creates a TONU invoice, then the same flow's all-load-invoices loop selects and voids it.
- Cancellation exposure: **0 rows twice**, Q024/Q025. Both defects are source findings, not a claim of a lost cancellation charge today.

Quick-assign, quicksave, bulk update, reassign, tour and status paths are named separately; shared helpers do not prove all branches have identical side effects. Number reservation, geofence detector/Samsara, miles/deadhead and auto-delivery chains are mapped in the supplement; concurrency and external-device execution remain unverified.

## B. Settlement Creator and driver pay

Full per-route map: [B/C/F supplement](DEEP-WIRING-AUDIT-2026-10-12-BCF.md).

Creator code now resolves trailers before booking, refuses missing customer rather than selecting oldest, uses an owed-bill helper, and calls existing posters. These corrections are acknowledged. Separate direct INSERT paths and sibling routes still matter:

- DEGH-01/G13: paid company expenses bypass shared attribution/event writer. **64 missing expense_load_links, all Creator memo, all with JE**; they are not 64 missing GL entries.
- BCF-08/G9: live `driver_finance.driver_bills` schema contains no unit/trailer snapshot fields. **145 live bills**. The corrected `accounting.bills` schema is a different table.
- BCF-09: mounted POST settlement pay-lines passes no item; `settlement-pay-line.service.ts:65` INSERT omits item_id. Production CHECK `settlement_lines_extra_pay_requires_item` requires it, with no BEFORE trigger filling it (Q023). NOT VALID preserves historical exceptions; it still checks new writes. The route therefore has a code/constraint incompatibility for extra-pay kinds, without invoking it on production.
- BCF-11: mounted historical feed escrow helper does not use the current close/adoption contract. Existing **45 settlement escrow deposits all have JE/source links**; no current missing-link population is asserted.
- BCF-10: immediate reimbursement retry repeats bank-cache decrement before an idempotent poster, but **no app caller found**. It is P2 dormant code, not an observed cash movement. Reimbursements **0 twice**, Q024/Q025.

Live AP bridge: **146 active settlement-GL-bill links; invalid bill/load/JE links 0** (Q009). The single closed settlement with no bridge, P-0067, has **gross=0, net=0, active lines=0** (Q011); it is not counted as unposted debt. Likewise, nullable settlement header bill/payment IDs are not defects when the canonical bridge carries those links.

## C. Cash advances and liabilities

Entry/call chains: [B/C/F supplement §C](DEEP-WIRING-AUDIT-2026-10-12-BCF.md).

- BCF-01: disbursement commits state before GL; an application posting failure leaves a disbursed record while retry requires approved state.
- BCF-02: linked bill lookup does not enforce matching driver/load/live state or serialize balance allocation.
- BCF-03: physical links are supplied by body; Creator supplies no trailer. **11 current advances miss an available owned trailer**.
- BCF-06: operational lumper advance is not wired through the full expense/poster chain; the split helper has no production caller.

All **12 advances have current postings; 0 linked bill identity mismatches** (Q007). Those results do not exercise crash recovery or concurrent allocation. Recovery uses the existing GL-derived outstanding balance and locked advances; unwind uses recorded recovery snapshots, not freshly invented balances. Driver-settlement routing covers all 12 current advances; operational lumper population is unexercised.

## D. Invoices and A/R

Entry/call chains: [D/E/G/H supplement §D and extension](DEEP-WIRING-AUDIT-2026-10-12-DEGH.md).

From-load builder reads scoped customer/load and charge lines; writes itemized lines; authorized zero-revenue branch is explicit. Current **148 invoices / 148 live lines**, item-null 0, customer mismatch 0, header/lines mismatch 0; **20 zero invoices**, not presumed defects. Positive issued invoices without postings: **0** (Q005).

A/R control and customer subledger tie today. Payment creation, apply/unapply, void, credit memos and two-event revenue latch are mapped but no receipt was posted during audit. Current payments **0 twice**. This is not proof that every receipt/unapply/retry combination works.

## E. Factoring / Faro

Entry/call chains: [D/E/G/H supplement §E and extension](DEEP-WIRING-AUDIT-2026-10-12-DEGH.md).

Draft → post → send uses canonical purchase/advance/line links. `purchase.service.ts:252,270` calls the in-client factoring poster and refuses an unposted result. Source contract: Dr net funding clearing + reserve assets + mapped fee expenses / Cr factoring advance liability; it is not a sale of receivables.

FACTORING_GL_POSTING_ENABLED is **ON** for USMCA (Q005), but current factoring_advances **0 twice**. Purchase/report/funding/escrow-pair/interest/chargeback source paths are documented; production lifecycle and atomic inverse are not certified. Batch advances need line-level load links, not an arbitrary first-load UUID.

## F. Fuel, DEF and Relay

Entry/call chains: [B/C/F supplement §F](DEEP-WIRING-AUDIT-2026-10-12-BCF.md).

Five canonical fuel INSERT sites were found; one Relay bridge is uncalled. Live **644 nonvoid fuel rows** have load/unit/driver/vendor; source-load unit/driver mismatch 0. Provider-base duplicate query was repeated using the live normalization function: **0 groups**.

- BCF-04/G5: Creator accepts same-company load while stamping settlement draft dimensions independently; current coherence is 0 mismatches, but input rule is insufficient.
- BCF-05/G7: Creator date-window allocation is not the same rule as import/Relay event-time resolver. GPS-time correctness remains pending.
- DEGH-07/G6: canonical fuel accept calls fuel poster without expense adoption; Relay accept explicitly adopts the expense. Query Q026 found **0 canonical fuel rows joined to current live fuel_event source IDs**; it does not certify acceptance.
- **152 posted expenses without expense-type posting are correctly backed by existing fuel_event JEs** (Q006). They are adopted fuel documents, not missing GL. Source-type-only tests would have produced a false finding.

Relay daily ingest explicitly does not invoke the old canonical bridge. An unused helper's mixed-product loop is not described as live ingestion behavior. IFTA includes a separate void-exclusion review in K.

## G. Expenses, bills, payments and checks

Entry/call chains: [D/E/G/H supplement §G and extension](DEEP-WIRING-AUDIT-2026-10-12-DEGH.md).

Current live expenses637, expense lines865, AP bills146. Expense source party/account links present; **5 expenses without load/unit/driver/trailer are not automatically defects** without applicability evidence. All positive live bill source postings exist in Q005. A/P tie is proved at control and mapped-vendor levels.

- DEGH-03: checks infer an arbitrary item using account + LIMIT1; live catalog contains **17 ambiguous account groups / 101 items**.
- DEGH-04: final check can persist unposted on application posting refusal/flag-off while returning201. Flag is ON today; failure branch unexercised.
- DEGH-05: DB refusal protects vendor/driver/load/unit, not trailer. **4 driver AP bills miss trailer despite source owned trailer**.
- DEGH-06: bank-line-expense helper uses generic EXP number with load; measured live load-bearing exposure pending.

Checks **0 twice**. Void/print/stock numbering routes are mapped, not exercised. Shared expense path includes attribution/event emission that Creator's direct writer omits.

## H. Banking

Entry/call chains: [D/E/G/H supplement §H and extension](DEEP-WIRING-AUDIT-2026-10-12-DEGH.md).

Inspected suggestions are read-only. Matching requires explicit accept; current live matches and accept audit population **0 twice**. Static automatch selftest passes5/5 after dependencies were attached. No bank transaction or match was created, changed or accepted.

DEGH-02: general expense-account categorization can post a JE without a source expense. **4 current bank lines, $662.25 expense debit**, satisfy this absence query. Treat expense-specific document requirement separately from valid owner equity/loan/deposit categories; do not call every JE-only category an expense.

Raw variance_account_id is still reachable from BankReconciliationPage and accept route. This conflicts with an earlier reason-only/materiality order; the supplement records it as **policy-currency confirmation required**, not as proven misposted money. It is not included among the 33 confirmed findings.

Insurance has a separate synthetic-bank writer (K-10 below). Current matches=0 does not establish no other writer ever persists matches; full auto-persister inventory remains open.

## I. Ledger, accounts, flags, constraints and reports

### Per-writer/read-path map

| Entry / route | Service / SQL anchor | Tables / canonical? | Links / DB backstop | Dr/Cr / flag | Guard / production proof |
|---|---|---|---|---|---|
| Document engines call shared poster | posting-engine.service.ts:3071 executePostingOnClient; :3249 postSourceTransactionInClientTx; :860 lines | accounting journal headers, postings, batches; canonical | company+source, derive entity/load via posting-line-writer:141,245; explicit foreign load refuses317; insert330; spine416 | buildDraft then assertBalanced901 and ensureOpenPeriod; existing per-source roles | Q005 balanced1391; Q009 spine3564/3564; flags Q005 |
| Manual JE POST accounting/journal-entries.routes.ts:110 | journal-entries.service.ts:210,226,294 | canonical header + shared line writer | membership route121, period lock211, audit328; body supplies entity/load | manual balanced entry, not an audit action performed | Full entity-kind/UUID membership semantics not yet audited |
| Void dispatcher | accounting/void-document.service.ts:103,119,130,144,173,196,208,227,237 | existing bill/payment/expense/invoice/JE/factoring/settlement/deduction reversals | source identity retained; differing connection ownership for JE/factoring needs failure test | existing reversals only | Q009337 recorded reversal lines inverse; completeness pending |
| Main Trial Balance UI | frontend api/reports.ts:459; TrialBalancePage:76 → trial-balance.routes.ts:29 → trial-balance.service.ts:35 | canonical ledger reader | ledger-membership.ts:28 excludes void/sample and nonposted batches | no posting | membership guard selftest7/7; current controls tie |
| Legacy trial-balance API | accounting/p7-wave2.routes.ts:406,427–433, mounted accounting/index.ts:11 | canonical tables, **noncanonical membership** | does not apply shared void/sample/batch predicate | no GL write, but audit append at435; endpoint not invoked | I-01: guard enumerates9readers but omits this one; current extra rows0 twice |
| Insurance policy wizard | frontend PolicyCreateWizard.tsx:269 → api/insurance.ts:821 → policies/with-bills route44 | bank_transactions + bills + allocations + outbox | oldest active bank selection rather than actual bank event | optional bill poster catches error | K-10; current synthetic rows0 twice |

All backend paths above are under `apps/backend/src/` unless prefixed otherwise.

### Live account/role proof

Q008 records actual active role bindings, including bank1000; AR1100; AP2000; driver pay6890; payroll clearing2170; settlement payable2200; driver escrow2100; factoring advances2150; receivables1255/1256/1257; fuel5000; Relay1295; Dreamline2510. Roles differ by event; do not infer a fixed debit/credit solely from a role's name.

Q021 preserves **119 source × debit/credit × account groups**, with actual account numbers, names, row counts and cents. This is the live posting evidence, not an assertion that each possible future transaction uses those accounts. Example source families present: expense, fuel_event, bill, driver_settlement, invoice, bank_categorization, bank_deposit, relay_deposit, driver_advance and bill_payment.

Every measured per-source financial posting flag in Q005 is explicitly ON with no expiry/user restriction; QBO push flags are OFF. Code defaults are false; measured company overrides matter. Environment-only switches and all caller-specific gate combinations remain unverified.

### What remains wrong despite balanced GL

I-02: **10/976 expense posting lines lack entity despite a source payee**. Resolver code exists; universal required-entity enforcement does not. Load mismatch is0 in that same cohort. Null class_id on all measured lines is not independently classified as a defect absent an applicable class requirement.

I-01: the mounted legacy trial-balance route omits canonical membership. It adds **0 extra rows today**, confirmed twice. The main UI uses the corrected endpoint; the defect is reachable legacy API behavior and guard coverage.

### DB and migration evidence

- 278 inspected company-scoped tables: RLS enabled/forced and at least one policy, missing0. This is configuration presence, **not adversarial tenant-isolation proof**.
- Live constraints/triggers include same-company driver/unit/trailer checks, load-required/refusal checks, audit/WORM, source-spine and financial period controls; Q007/Q011/Q013/Q021/Q023 preserve definitions.
- Repo1487 migration files vs production1477 ledger rows. Ledger-only0; repo-not-ledger10. **65 checksum differences are all covered by existing exact approved overrides; zero uncovered checksum mismatch**. Pending filenames are in the migration comparison. “Not in ledger” alone does not establish the corresponding schema is absent.
- No migration was edited, applied or renumbered. No immutable history fix is proposed from a lexical mismatch.

## J. Master data hubs

Full writer map: [A/J/K supplement §J](DEEP-WIRING-AUDIT-2026-10-12-AJK.md).

Driver/customer/vendor/unit/equipment/location creation and lifecycle routes are identified. Unit/trailer tenancy uses owner/lease columns, not an invented universal operating_company_id.

AJK-04: name-collision branch reports vendor already-present without driver linkage. **5/23 real active drivers lack linked active vendor**. This count does not prove that all five were caused by this specific branch; no name-based merge is proposed.

AJK-05: GET driver-merge preview executes UPDATEs then savepoint rollbacks, acquiring locks/firing triggers. It was not called. Dynamic merge child scope and hard-identity approval requirements need further policy/data-flow review; no frozen-company rows were queried.

Normalized license/state duplicate groups **0** in Q011, without exposing identifiers. This narrow test does not certify no duplicates by every identity source. Company-scoped expense payee/load and posting account/header orphan checks measured0 (Q020), not every hub FK.

## K. Maintenance, insurance, safety, legal, IFTA and other consumers

Full writer map: [A/J/K supplement §K](DEEP-WIRING-AUDIT-2026-10-12-AJK.md).

- AJK-02/06/07/08: roadside payment method ignored in favor of vendor invoice; missing source load/trailer; arbitrary category fallback; posting failure can still mark ticket invoiced. **Road tickets0 twice**; source risk, no current debt quantified.
- K-10: insurance wizard and dispersal create synthetic bank rows against oldest active bank account, then categorize them while generating bills. `insurance/policy-create-atomic.service.ts:94,108,186`; `insurance/dispersal.routes.ts:136,151`. **Synthetic rows0 and matching wizard bills0 twice**. A canonical scheduled bill path also exists; its presence does not remove the alternate writer.
- AJK-09: legal matter loader reads load but reserve/fee bill omits it. **Load-linked legal bills0 twice**.
- AJK-12: converted fine can be dismissed without unwinding recovery. **Fines0 twice**.
- AJK-13: IFTA prepare can reset filed/approved evidence via UPSERT. Current **1 draft filing,0 filed**.
- IFTA fuel reader's archived-only filter lacks explicit void exclusion; current voided-but-unarchived fuel0 twice. Treat as reader coverage risk pending lifecycle/trigger validation, not a current tax-dollar discrepancy.
- Leases, equipment loans, cash-flow/KPI, every fixed monthly cost, all webhooks/outbox handlers and all money-writing crons remain **incomplete end-to-end coverage**. Named paths are in supplements/inventory, not silently certified.

## G1–G15 independent verdict

| Gap | Result at pinned SHA + measured population |
|---|---|
| G1 trailer choice | Present for live-feed Book Load; historical exception exists; not every alternate writer certified |
| G2 Creator trailer/type | Present before booking; shared booking invoked |
| G3 oldest-customer fallback | Removed in inspected Creator; refusal present |
| G4 owed bill lifecycle | Shared owed writer/poster/void implementation + static tests present; no full live edit/void experiment |
| G5 all lines linked | Nonnull improvements present; same-company-but-wrong-load admission remains BCF-04; pay-line item incompatibility BCF-09 |
| G6 bank/fuel documents | **Partial**:4bank lines lack expense; Relay adopts, canonical-fuel accept lacks adoption |
| G7 one fuel rule | **Partial**: Creator date-window vs canonical time resolver; GPS-time proof pending |
| G8 posting entity/load | **Partial**:10expense lines missing entity; existing source-load cohorts mismatch0 |
| G9 bill/advance physical links | **Open/partial**:145driver bills lack schemafields;11advance +4APbill trailer gaps |
| G10 invoice items | Present in builder;148lines itemmissing0;headerfooting0; multi-charge behaviors not exhaustively exercised |
| G11 fence/status | **Open**: booking/status does not require fence success |
| G12 fuel duplicate rule | Shared base provider rule and DB trigger inspected;0duplicate groups twice |
| G13 Creator expense shared writer | **Open**:64missing attribution links,1289558cents,allCreator |
| G14 deduction item/account | Inspected type/item/account mapping and guard present;69live deductions lackload0; sibling extrapay route remains broken |
| G15 lumper advance | **Open**: split helper unwired; current operational population absent |
| 443.106 DB refusals | Installed/enabled inspected; trailer and full load→header→line coherence incomplete |

## Guards, CI and falsification limits

Locally executed static/selftest results: Creator line11/11; owedbill8/8; atomic7/7; driverpay6/6; zero12/12; deduction mutation4; fuel rematch7/7; factoredquickpay5/5; drivermerge5/5; WO4/4; bookinggeofencePASS; automatch5/5; membership7/7. They test their assertions, not every chain in this audit.

The first automatch attempt failed for missing pg, then passed after using existing dependencies. A fuel selftest dependency failure was **not** reclassified as product failure; its potentially broader live scope was not rerun. USMCA-only duplicate SQL was used instead.

Relevant registration anchors: verify-steps14821 Creator;10407geofence;18357drivermerge;9780WO;2000fuelrematch;11683automatch;12403membership;12421/12981spine; ci.yml:118 AP tie. A registration alone is not proof of execution.

GitHub snapshot at10:35AM CT for audited SHA: required-checks38268754583 success; premerge38268754753 success; guard-integrity38268754520 success; production-postdeploy38268754644 success; **ci38268754836 cancelled; closure38268754773 cancelled**. Therefore this report does not claim every registered/live guard was green on the audited main.

## Coverage ledger — work still required

The requested complete map is **not finished**. This audit publishes verified findings rather than claiming that 755 candidate files were individually proved.

Outstanding: full per-route role/tenant bypass audit; all hub reverse-reader links; all ledger source→document orphan types; every cron/outbox/webhook; every engine's void/closed-period/idempotent retry; salary/team edge cases; full GPS-time attribution; factoring reserve/chargeback failure phases; filed IFTA amendment; lease/loan/fixed-cost/cashflow readers; all standalone scripts/ops writers; isolated concurrent/failure tests; exact CI execution of each named guard. These are evidence gaps, not automatically defects.

No production loss is inferred from absent sample populations. No fixture was created to fill those gaps. No fix or data cleanup is included. Lead can assign source-proven fixes from the33-row CSV while the remaining audit coverage is completed.
