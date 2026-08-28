# NEEDS-OWNER — Adjudication vs saved rulings (2026-07-21)

> **SUPERSEDED-BY (item 1 / BLOCK-24 1099+withholding — 2026-07-26):** OWNER-DECISIONS-FINAL **E1**. That question is **closed**. Do not re-ask. No CPA.

## Post-adjudication overrides (2026-07-21 evening)

Owner rulings recorded after the read-only adjudication below. These do **not** rewrite the JSON snapshot; treat them as the live override layer when dispatching.

| Topic | Ruling | Effect on adjudication |
|---|---|---|
| **Reserve accounts** | OWNER-MANUAL ONLY — do not create, import, or reclassify (permanent). | Reclassifies UNANSWERED **#6** (`0091-m-factor-1`) and any reserve-reclass items to **ANSWERED / ACTION-ONLY = owner-hands** (no automated reserve ledger work). |
| **TONU presentation** | Accessorial operating revenue — child under Accessorial Income. | Partial answer for UNANSWERED **#7** / **#38** — presentation resolved; build GO still needed for **#38** / **#39**. |
| **Banking split FIX-05** | Verified **BUILT-LIVE** (flag ON ×3, migration applied). | Treat as **STALE** under NEEDS-OWNER (no longer awaiting owner decision). |

---


> Read-only adjudication of the 106 `pile=NEEDS-OWNER` items in `docs/trackers/block-audit-piles-2026-07-21.json` against the owner/CPA saved rulings (`docs/lockdown/00_LOCKED_DECISIONS.md`, `docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md`, `.claude/skills/ih35-accounting-decisions`, `ih35-entity-facts`, `docs/specs/DESIGN-load-revenue-capture-auto-invoice-tonu.md`, the linkage law). No trackers modified, nothing committed/merged. Rulings are quoted, never guessed.

## Counts per verdict

| Verdict | Count | Meaning |
|---|---|---|
| ANSWERED | 35 | a saved ruling answers it → buildable action named |
| ACTION-ONLY | 18 | no question pending → needs owner HANDS (Neon-apply / flag / figures) |
| UNANSWERED | 44 | genuinely open → one crisp owner question below |
| STALE | 9 | superseded/refuted by later work (already built or premise wrong) |
| **TOTAL** | **106** | |

## UNANSWERED — questionnaire for Jorge (44)

_Each is one crisp decision. Answer in a sentence; several are the same underlying call (noted)._

1. **[BLOCK-24-of-29-TIER3.5-1099-ANNUAL]** — **SUPERSEDED 2026-07-26 E1.** No 1042-S/1099; no withholding; no CPA question. BLOCK-24 engine stays PENDING/GATED (not a filing surface).
2. **[phase13-audit216-banking-industry]** (banking) — Is a lending-operations / banking-risk-analytics module in scope for IH35-TMS, or explicitly out-of-scope?
3. **[phase3-audit57-process-audit-docs-workflow]** (platform) — Build a process-bottleneck / audit-docs workflow dashboard, or is it out-of-scope?
4. **[phase3-audit72-calibration]** (fleet) — Track equipment calibration (ELD / scale) inside TMS, or treat it as out-of-scope?
5. **[phase3-audit75-document-control]** (platform) — Build an approval-workflow / lifecycle (document control) over docs.files, or is git + docs.files sufficient?
6. **[0091-m-factor-1]** (qbo-recon) — Which of the four competing reserve ledgers is canonical for the factoring reserve balance?
7. **[0242-no-auto-customer-charge-on-cancellation]** (accounting) — Approve auto-AR for billable (TONU) cancellations per the design doc, and which GL revenue account + does it require owner approval?
8. **[0243-g11-10-month-close-checklist-unsatisfiabl]** (platform) — Should month-close lock a period on a reviewed/acknowledged sign-off, instead of requiring zero overdue AR/AP (currently unsatisfiable)?
9. **[0251-gap12-commodity-equipment-mapping]** (dispatch) — Adopt commodity-based dispatch — build a commodity→equipment mapping (e.g. reefer required)? (requires a product/commodity catalog first)
10. **[0251-gap13-commodity-rate-matrix]** (dispatch) — Build a commodity rate matrix (commodity-based pricing)? Depends on the commodity-catalog decision above.
11. **[0251-gap3-vendor-invoice-linkage]** (accounting) — Must a factor (Faro) also exist as an mdata.vendors row for invoice linkage, or is the factoring.factor (customer→factor NOA) model canonical?
12. **[0252-audit146-workplace-safety-osha]** (safety) — Build OSHA workplace-safety incident tracking (hr.osha_incidents design exists but is unprioritized)?
13. **[0257-audit-88]** (compliance) — Is customs HTS/tariff classification in scope for IH35-TMS? (the border-crossing module is already built; only HTS classification is missing)
14. **[0278-safety-gap1-auto-driver-status]** (safety) — Should safety events auto-change driver status (probation/suspension) by severity/frequency thresholds? (explicit-termination path already wired)
15. **[0285-df-gap1-no-escrow-for-cash-advances]** (settlements) — May driver escrow offset an unrecovered cash advance (asset) on separation, and under what trigger — interacting with the 5% floor + pay-first ordering?
16. **[0441-mod13-form425c-exhibit-c-opening-balance-]** (platform) — Supply the Form 425C Exhibit C opening-balance block scope — question text not fully recoverable (named source .txt absent from repo).
17. **[0441-mod13-notifications-module-not-fully-audi]** (platform) — Scope: what does 'notifications module not fully audited' require? Acceptance criteria are absent from the repo.
18. **[0441-mod5-retention-excludes-critical-truncate]** (platform) — Scope: which data-retention policy/table must stop excluding critical (truncate) records? Criteria are absent from the repo.
19. **[0441-mod6-idvr-row-not-clickable-session-fake-]** (platform) — Scope: identify the IDVR screen/row/session issue precisely — acceptance criteria absent from the repo.
20. **[0473-1-1-default-revenue-account-unmapped-line]** (accounting) — For an unmapped invoice line: hard-fail vs post to a catch-all revenue account? (the standard line-haul account is 'Line Haul' under Sales of Service.)
21. **[0473-1-10-year-end-close-retained-earnings-asc]** (platform) — Confirm the year-end-close / retained-earnings roll process and ASC treatment (OBE→RE reclass is locked, but the full close is undefined).
22. **[0473-1-6-wo-void-reversal-grain]** (accounting) — Confirm WO void reversal grain: whole-bill net-zero mirror (as built) vs line-level partial reversal — is whole-bill correct?
23. **[0473-2-5-trial-balance-002-cosmetic_CLEANUP]** (platform) — Question text not fully recoverable — the $0.02 Dr/Cr trial-balance residual can't be traced to a named endpoint; needs re-derivation or a live TB read.
24. **[0518-r18-schema-fragmentation-8-dup-pairs]** (factoring) — Canonical picks for the remaining dup schema pairs: docs vs documents, mdata vs master_data, maint vs maintenance? (reports/reporting already ruled §9.6)
25. **[0519-at2-no-db-enforced-sod]** (accounting) — Require DB-enforced segregation-of-duties (approved_by ≠ posted_by trigger) on journal entries, or is app-layer maker/checker sufficient?
26. **[db5-resize-removal-directive-vs-current-lock]** (dispatch) — The old 'remove resizable tables app-wide' directive conflicts with the shipped/extended resize feature — re-confirm resize stays, or retire it?
27. **[dip-mor-pre-post-petition-ap-split]** (accounting) — For the Ch.11 DIP Monthly Operating Report, add a pre-petition vs post-petition A/P split (tagging/columns + petition date)? Currently absent.
28. **[expand-escrow-non-bond-deductions]** (settlements) — Which additional deduction_type values may draw driver escrow (chargebacks, safety-event fines) beyond 'escrow_load_abandonment'?
29. **[factoring-g3-debtor-credit-check-decision-note]** (factoring) — Surface Faro daily-report debtor credit-check data as a feature, or leave it out?
30. **[flow2-customer-chargeback-driver-expense]** (accounting) — Define the customer-chargeback→driver-billback policy: which driver-caused expenses are billable back, who approves, and the GL treatment (expense reduction vs other income vs AR)?
31. **[h-03-open-queue-navy-cta]** (reports) — Grant a §7 palette-lock exception to recolor the 'Open queue' CTA green? (navy #1F2A44 is currently the compliant locked token)
32. **[hiring-bypass-and-safety-contract-alerts]** (safety) — Approve a hire-status state-machine spec (contract pending upload/sign) before build?
33. **[module25-required-docs-ruleset-per-entity]** (factoring) — Define the per-entity-type required-document ruleset/matrix (the queued owner decision).
34. **[p1-data-encryption-at-rest]** (platform) — Approve a key-management/rotation policy (KMS or key-versioning)? Current single static ENCRYPTION_KEY works but isn't rotation-capable.
35. **[P4-04_SAFETY-COST-GL_DISPATCH]** (dispatch) — Define the GL treatment for safety costs — which expense account(s) do safety events/fines post to?
36. **[P4-07_PARTS-GL_DISPATCH]** (dispatch) — Define the GL treatment for parts — part receipt → inventory-asset JE, and WO-consumption posting?
37. **[PHASE2_ACCESSORIAL-REVENUE_divergent-engine_DISPATCH]** (dispatch) — Resolve the accessorial-revenue engine divergence — name the target files/approach (which engine is canonical)?
38. **[PHASE2_CANCEL-TONU_billable-cancellation-no-charge_DISPATCH]** (dispatch) — Approve building TONU billable-cancellation → AR per the design doc (GO/no-go)?
39. **[PHASE2_LOAD-INVOICE_no-auto-ar_DISPATCH]** (dispatch) — Approve building auto-invoice-on-delivery + seed the Unbilled Revenue account (TRANSP+USMCA) per the design doc (GO/no-go)?
40. **[PHASE2_RECON-COLLECTOR_frozen-feed_DISPATCH]** (dispatch) — Scope/approach for the reconciliation-collector frozen-feed issue — question text minimal (prose/no-files).
41. **[ruling-3-driver-escrow-current-vs-long_DISPATCH]** (settlements) — Reclass Damage Claim Escrow (QBO-1150040187) from OtherLongTermLiabilities to a current-liability subtype (60-90d turnover)? Which subtype?
42. **[s-12-log-event-button-navy-cta]** (reports) — Grant a §7 palette-lock exception to recolor the '+ Log Event' CTA green? (navy #1F2A44 is currently compliant)
43. **[sweepfix1727-8]** (banking) — Should /finance land on FinanceOverviewPage (current) or the real /finance/hub, and should the 4-tab vs 5-tab (Calculator) subnav be unified?
44. **[wo-cancellation-reasons-fold-into-void-cancel-]** (maintenance) — Fold catalogs.wo_cancellation_reasons into catalogs.void_cancel_reasons (which is canonical), and re-point the WO Cancel/Void modal to a reason-catalog dropdown?

## ACTION-ONLY — owner-hands checklist (18)

_No decision pending — these need the owner's hand (Neon-apply, flag flip, figures, CPA memo)._

- [ ] **AF-1-entity-coa-fix** (accounting) — Jorge runs db/migrations/202606272100_af1_catalogs_accounts_per_entity.sql on a Neon branch, ledger-backfill, then prod.
- [ ] **AF-7-money-controls** (platform) — Owner per-flag OK to flip MONEY_CONTROL_* after owner tie-out; independently confirm period-close UX + financial-RLS-per-role scope built.
- [ ] **BLOCK-17-of-29-TIER2.5-W2-1099** (platform) — Owner runs held db/migrations/202607130100_block17_24_tax_document_engine.sql (tax-doc engine schema). (NRA-withholding open Q tracked under BLOCK-24.)
- [ ] **HOS-MAP-driver-samsara-id** (safety) — Owner authorizes/runs the driver→Samsara-id mapping backfill migration; then wire telematics id resolution.
- [ ] **HOS-PRC2-reader-swap** (safety) — GUARD runs the per-driver board==roster==Samsara-certified-ELD reconciliation; on pass, swap the reader.
- [ ] **ITEM-02-EXCEL-UPLOAD-RLS-REASSERT** (dispatch) — Owner applies the reassert migration as neondb_owner; fix the guard so verify-excel-upload-jobs-rls-forced.mjs actually validates FORCE RLS on this table.
- [ ] **USMCA-LAUNCH-carrier** (platform) — Owner triggers launch after the 142-table entity-isolation wall closes and USMCA opening balances (STMT-2) are entered; then flip visibility and enable all functions.
- [ ] **BLOCK-02-DRIVER-ESCROW-DESIGN** (settlements) — Owner applies held db/migrations/202607111000_block02_driver_escrow_separation_return.sql; also add a table-existence/isEnabled guard so the live escrow-separations GET routes don't 500 on prod pre-apply.
- [ ] **CONN-3-relay-internal-bank** (banking) — Owner runs held 202607470000_relay_wallet_banking_registration.sql on a Neon branch/prod so the Relay Fuel Wallet appears in /banking.
- [ ] **product-service-categories-rename-and-creator** (qbo-recon) — Author + owner-run a catalogs.* migration adding qbo_categories.parent_category_id (self-FK) + description/active/sort_order; then wire nesting.
- [ ] **STMT-2-opening-balances** (platform) — Owner supplies/locks per-entity opening figures; then wire opening-balance-import.routes.ts + qbo-ob-2026-03-31-live-pull.routes.ts (currently file-only) and the frontend, and post the balanced opening JE (owner hand).
- [ ] **events-event-log-force-rls-still-blocked** (platform) — Owner applies 202607510000 on a Neon branch + ledger-backfill so events.event_log becomes FORCE-RLS on prod.
- [ ] **factoring-asc860-cpa-control-test-open** (accounting) — CPA writes the ASC 860 three-part control-surrender test against the executed FARO agreement + the per-factor sale-vs-secured config (owner/CPA hand).
- [ ] **factoring-asc860-determination-memo** (factoring) — CPA/owner authors docs/accounting/FACTORING-ASC860-DETERMINATION.md (the ASC 860-10-40-5 three-condition analysis).
- [ ] **gated-blocks-conn-plaid-relay-edi** (qbo-recon) — Owner applies the four held CONN-3 migrations (absent from .ledger.json) on a Neon branch; EDI stays deferred.
- [ ] **P4-08_WO-DOUBLE-BILL_VERIFY** (maintenance) — GUARD reads prod WO-bill duplicate counts; owner applies a UNIQUE(linked_work_order_uuid) partial index + collapses to one canonical writer.
- [ ] **public-audit-log-partitions-no-rls** (platform) — Owner applies the RLS-enable/force/WORM migration on a Neon branch + ledger-backfill.
- [ ] **usmca-unhide-entity-switcher** (accounting) — Owner go/no-go to flip org.companies.is_active for USMCA after COA-seed + banking-ingestion preconditions (tied to USMCA-LAUNCH + STMT-2 USMCA OB).

## ANSWERED — newly buildable (35)

| id | module | ruling | buildable action |
|---|---|---|---|
| AF-4-ap-bills-migration | accounting | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'YES — import ~$1.18M A/P from QuickBooks (BS/AP as of cutover), AFTER opening balances land.' | Build the accounting.bills write/import path on the held ap_import scaffold; owner runs after STMT-2 opening balances land (financial ceremony). |
| BLOCK-01-of-29-TIER1.5-DEPRECIATION | platform | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'Depreciation: 5-yr straight-line, revenue equipment, GAAP books' + LOCKED_DECISIONS §9.9 AMORTIZATION flag ON. | Owner Neon-applies held 202607100100 (financing_loan_id link + autopost audit); enable the monthly autopost cron (engine already live). |
| BLOCK-02-of-29-TIER1.5-DRIVER-ESCROW | settlements | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'Driver escrow: liability returned ≥90 days AFTER resign/fire/termination date, net of deductions' + cpa-skill §4. | Verify/complete the termination-payout path on canonical accounting.escrow_accounts/escrow_postings (live); apply held escrow-separation migration (see BLOCK-02-DRIVER-ESCROW-DESIGN). |
| BLOCK-25-of-29-TIER3.5-CONSOLIDATION | platform | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'Consolidation (BLOCK-25): defer to the very end (BLOCK-25 needs all 3 entities live).' | When USMCA is live: register the already-built consolidated-statements.routes.ts fp() plugin in index.ts (intercompany-elimination statements currently unreachable). |
| CHAIN-06-invoice-ar-chain-proof | accounting | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'CHAIN-06 confirmed … A/R closes only when the customer pays Faro, never at funding' + LOCKED_DECISIONS §9.9 FACTORING flag ON. | Fix the latent AR-subledger divergence (postFactoringCustomerPayment/Chargeback must update accounting.invoices.amount_paid_cents/status) BEFORE relying on the ON flag; CI-wire the two orphaned verify:chain-06 guards. |
| DISP-WIZARD-edit-load-patch | dispatch | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'DISP-WIZARD (edit-load): quantity change ADDS an expense/deduction → touches billing (Tier-1).' | Build the edit-load patch as a Tier-1 financial change (full ceremony, reuse existing posters, no new GL math). |
| DISP-WO-work-order-modal | maintenance | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'DISP-WO (work-order modal): financial when it creates a bill; WO bill uses the same expense format' + §9.9 BILL flag ON. | Verify create_bill_for_wo posts live under BILL_GL_POSTING_ENABLED (now ON); reuse maintenance poster (modal already built+mounted). |
| ENT-AUDIT | platform | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'FH-VERIFY / ENT-AUDIT: verify + fold into DB-audit.' | Run the entity/DB verification and fold findings into the DB-audit sweep; do not invent new scope (respond-before-code on any concrete sub-block). |
| FH-VERIFY-finance-hub-modules | platform | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'FH-VERIFY / ENT-AUDIT: verify + fold into DB-audit' + §9.9 AMORTIZATION ON (FH-3). | Verify FH-1..8 state (FH-1..4 flags now ON per §9.9), fold into DB-audit; FH-5..8 remain design-done pending build. |
| FIX-05-BANKING-SPLIT-ENABLE-AND-WIRE | banking | LOCKED_DECISIONS §9.9 'ALL GL posting flags are ON for all three operating companies … BANK_TX_SPLIT … Verified live on Neon 2026-07-20.' | Verify Split posts live (feature already built+wired); complete the dedupe wiring and CI-wire the split guard. |
| HOS-FANOUT-03-08 | safety | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'HOS: fan out to dispatch/maintenance/wherever; show certified-ELD remaining-drive-time wherever connected; certified ELD = single source of truth.' | Build the HOS remaining-drive-time surfaces across dispatch/maintenance reading certified-ELD data (Tier-2, no money). |
| HOS-PRC-DATA-verbatim-clocks | safety | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'show certified-ELD remaining-drive-time wherever connected; certified ELD = single source of truth.' | Display verbatim certified-ELD clock data wherever HOS appears (Tier-2, telematics, no money). |
| STMT-3-1099-425c-consolidation | platform | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md consolidation 'defer to the very end' + 1099 build directive; §8.9 425C DIP live. | 3a: owner runs held 202607130100 (1099). 3c: mount consolidated-statements route when all entities live. 3b already done. |
| VOID-VERIFY-void-everywhere | platform | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'VOID-VERIFY: shared void/cancel/reverse layer everywhere (PR #2186 — Owner/Admin, reason-required, audited; load keeps its own maker/checker).' | Layer built (PR-1/PR-2 merged). Build PR-3/PR-4 (Expenses/Settlements void, folded into AF-7); owner flips VOID_ENFORCEMENT_ENABLED/WO_VOID_ENABLED (NOT in §9.9 all-ON set). |
| CHAIN-04-bill-payment-tieout | accounting | LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'CHAIN-04 (bill-payment tie-out): build (PR #2188 supplies the proof + Part-2b accept-bill design).' | Build Part-2b: on accepting a 'bill' bank-match candidate, auto-create the bill_payment row via the existing poster (read-only tie-out already live). |
| 0008-g3-qbo-mirror-canonical_DISPATCH | dispatch | LOCKED_DECISIONS §9.6 'mdata.qbo_* canonical for the QBO mirror (repoint the accounting.qbo_* writers).' | Repoint the 18 accounting.qbo_* writer sites onto mdata.qbo_* and retire accounting.qbo_* (STEP-1 mdata.qbo_* sync columns migration is itself held for owner). |
| 0008-h-create-bill-line-items-load-id_DISPATCH | dispatch | LOCKED_DECISIONS §9.7 'Create Bill gains line items + load_id; universal rule — diesel, expenses, repairs … all connect to the load/driver.' | Owner runs held 202607200000_bill_lines_load_id.sql (accounting.bill_lines.load_id FK → mdata.loads); then surface load linkage in the bill UI. |
| 0091-d1-2 | accounting | LOCKED_DECISIONS §9.6 'mdata.vendors canonical for vendors (+ a resolver so WO/expense pickers read it).' | Build the vendor resolver and repoint WO/expense/CC pickers off mdata.qbo_vendors onto mdata.vendors; archive (never delete) the duplicate. |
| 0251-gap2-vendor-gl-linkage | accounting | LOCKED_DECISIONS §9.6 mdata.vendors canonical + LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md banking categorization recommend+confirm model. | Owner runs held 202607110230_vendor_qbo_parity.sql (mdata.vendors.default_expense_account_id FK). (Factor-as-vendor sub-question tracked at 0251-gap3.) |
| 0285-df-gap2-dual-deduction-systems | settlements | LOCKED_DECISIONS §9.1 'Canonical deduction store = driver_finance.driver_settlement_deductions … Retire the payroll.* copy + the settlement_lines auto_deduction path.' | Migrate/retire the payroll.* + settlement_lines auto_deduction writers onto the canonical store; decide whether deduction_schedule is an amortization PLAN that materializes rows into it. |
| 0473-1-8-tk-transp-lease-asc842 | accounting | LOCKED_DECISIONS §6.5 (FIN-22 lease) + entity-facts 'Equipment leases → TRK signs … books in TRK' + finance-engine-decisions-locked 'lease=operating' + §9.9 LEASE flag ON. | None to decide. Residual doc deliverable: capture the CPA/counsel ASC 842 common-control practical-expedient + useful-life memo confirming the locked operating-lease treatment. |
| 0473-1-9-driver-settlement-net-pay-mod_DISPATCH | settlements | LOCKED_DECISIONS §9.2 '5% DEFAULT, EDITABLE' + cpa-skill §4 'W-8BEN … 5% net-pay floor … Driver Cash Advance = asset; Driver Escrow = LIABILITY.' | None (5% floor built at DEFAULT_NET_PAY_FLOOR_PCT=0.05). Residual: CPA/counsel written confirmation of the 1099 classification (documentation, not code). |
| 0490-section-c-2-reporting-vs-reports-drift | dispatch | LOCKED_DECISIONS §9.6 'reporting.* canonical for scheduled reports (migrate reports.* rows in, archive the old).' | Migrate reports.* rows into reporting.*, archive the old; update scripts/verify-no-deprecated-schema-creates.mjs (remove 'reporting' from DEPRECATED, add 'reports'). |
| audit10-payroll-automation-tax-withhol_DISPATCH | settlements | cpa-skill §4/§9 (drivers 1099, W-8BEN) + LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'AF-8 payroll-bridge: stays DEFERRED (1099, no QBO write-back).' | None to build — produce a reconciliation sign-off that TMS driver-settlement totals and QBO W-2 payroll don't double-count. |
| bf10b-qbo-recon-six-types | qbo-recon | backlog-verify: recon-cron.service.ts declares all six QboRegisterSources; code note: 'flag key kept as GL_POSTING_ENABLED … owner config decision' + §9.9 GL_POSTING_ENABLED ON. | Verify daily recon runs (gated by GL_POSTING_ENABLED, now ON); optionally rename the gating flag if owner prefers. |
| bf4-load-invoice-ar-factoring-payment | qbo-recon | backlog-verify: posting-engine.service.ts registers 'customer_payment' + §9.9 CUSTOMER_PAYMENT flag ON — the 'A/R never clears' claim is disproven. | Verify/automate the unposted-source sweep (sourceOrder invoice→bill→customer_payment→bill_payment) so customer_payment GL materializes without a manual batch. |
| bf7-cash-advance-recovery-engine | settlements | LOCKED_DECISIONS §9.9 SETTLEMENT flag ON (supersedes 'SETTLEMENT OFF until CPA'); backlog-verify: FK + recovery engine already built. | Verify advances recover on real books under SETTLEMENT_GL_POSTING_ENABLED (now ON); no code gap remains. |
| flow5-dual-deduction-systems-consolidate | settlements | LOCKED_DECISIONS §9.1 'Canonical deduction store = driver_finance.driver_settlement_deductions … Retire the payroll.* copy + the settlement_lines auto_deduction path.' | Consolidate the capped-recovery + legacy deductions paths onto the canonical store behind an OFF flag; owner verify before flipping (same work as 0285-df-gap2). |
| ifta-sales-tax-booking-location-confirm | accounting | cpa-skill §5/§9 'No sales tax on line-haul — interstate/cross-border freight transportation is not TX-sales-taxable.' | None for freight. If any taxable ancillary arises, post via the existing accounting.sales_tax_returns.paid_bill_id path; confirm IFTA fuel-tax booking location matches CPA intent. |
| P4-01_SAFETY-INSURANCE-LINK_DISPATCH | dispatch | AGENTS.md / ARCHITECTURE-BLUEPRINT-2026-07-05.md §9 linkage checklist + rule 14 (every record links both-way to operational + hub tables). | Author the additive safety↔insurance FK (entity-scoped, 0-NULL backfill, forward+reverse drill), validated on ci-migration-test. |
| P4-02_LEGAL-LINK_DISPATCH | dispatch | ARCHITECTURE-BLUEPRINT-2026-07-05.md §9 linkage checklist + rule 14 total connectivity. | Author the additive legal↔entity/load FK per the linkage checklist (entity-scoped, backfill 0-NULL, both-way drill). |
| P4-03_UNIT-IDENTITY_DISPATCH | dispatch | entity-facts 'Unit ownership lives on the unit row via owner_company_id (TRK owns) + currently_leased_to_company_id … NOT operating_company_id.' | Author the additive unit-identity bridge FK consistent with owner/lease columns; validate on ci-migration-test. |
| P4-05_DAMAGE-CLAIM-FK_DISPATCH | dispatch | AGENTS.md §9 linkage checklist 'a damage deduction → the claim → escrow liability' + rule 14. | Author the additive damage-claim FK (0 orphans pre-migration, FK validated on ci-migration-test). |
| P4-06_WO-FK_DISPATCH | dispatch | LOCKED_DECISIONS §9.7 'Everything links to the load' + ARCHITECTURE-BLUEPRINT §9 (repair bill → unit + vendor + load + WO + expense acct + JE). | Author the additive WO↔load/unit/vendor FKs (0 orphans, validated on ci-migration-test). |
| ruling-4-embezzlement-reclass-off-ar-q_DISPATCH | dispatch | cpa-skill §7 'the "Unauthorized Expenses" receivables (Ignacio, Anarely) are receivables pursued in bankruptcy court — NOT written off, NOT reclassed to expense.' | None — keep as receivables (cloned balances remain provisional until Martin's court cleanup; do not reclass off A/R). |

## STALE — superseded/refuted (9)

- **AF-2-qbo-drift** (qbo-recon) — LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'AF-2 qbo-drift: detect only, write stays OFF' — implemented in master-data-anchor-drift.ts (detect-only, writes recon_exceptions).
- **AF-5-stub-catalogs** (platform) — docs/accounting/AF-1-AF-5-DESIGN.md — '~34 stub catalogs' premise stale; re-verification found 61 real catalog tiles; both named examples already real.
- **BLOCK-03-of-29-TIER1.5-IFTA** (fuel) — LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'IFTA: in-house … base on TRIP practical miles … quarterly; Jorge files' — backlog-verify RESOLVED (routes + wizard live).
- **BLOCK-19-of-29-TIER3-AUDIT-HASH** (platform) — backlog-verify: events.event_log prev_hash/hash sha256 chain + trigger (202606111051) + ops.audit_chain_verifications — RESOLVED.
- **CHAIN-07-settlements-500-fix** (settlements) — backlog-verify: settlement-payment.routes.ts mapServiceError surfaces pg_code/pg_constraint (PR #1655) — RESOLVED.
- **CONN-4-edi-foundation** (platform) — LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md 'EDI (CONN-4): defer to the very end (only if a customer requires it)' — backlog-verify: edi.routes.ts registered, RESOLVED.
- **0243-g6-2-vendor-create-no-dedup-guard** (compliance) — backlog-verify: mdata/vendors.routes.ts:156 vendorNameConflictExists (entity-scoped lower(btrim(name)) check) — 'not-built' claim is stale.
- **0277-csrf-tokens-recommendation** (insurance) — backlog-verify: middleware/csrf-origin-guard.ts imported+registered (index.ts:430/638) with a 237-line test — Origin/Referer allow-list CSRF guard live.
- **fk-escrow-termination-0289** (drivers) — backlog-verify: 'termination_id' returns zero hits everywhere; covered by driver_finance.driver_escrow_separations (separation_date + 90-day eligible_release_date) + §9.4.
