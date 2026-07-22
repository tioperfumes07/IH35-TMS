# LAW-E2E — Bank match/categorize → GL → source entity linkage (2026-07-21)

**BLOCK:** `LAW-E2E-BANK-MATCH-LINKAGE-2026-07-21`  
**MODULE:** banking / accounting  
**PATH ID:** `P-BANK`  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch2-audit` · branch `audit/law-e2e-batch2-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (matches)  
**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · **READ ONLY**  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater  
**Master:** `docs/trackers/LAW-FULL-LINKAGE-AUDIT-MASTER-2026-07-21.md`

Law §9 + QBO Banking parity: bank feed → Match / Categorize → GL + vendor/customer/driver/unit/load + reverse drill. Never delete TMS banking surfaces — only add.

---

## Verdict (one line)

**FAIL overall.** Bank feed is live (**10,427** `banking.bank_transactions`) and categorize→GL **works when used** (**3** categorized rows with `matched_journal_entry_id` + **6** `bank_categorization` JE legs; `BANK_FEED_GL_POSTING_ENABLED` ON ×3) — but **10,424 / 10,427** remain `pending_categorization` / `for_review`, **matched invoices/bills = 0**, **splits = 0**, Account Register has **no `bank_categorization` sourceRoute**, and JE detail FE does not surface source-links. Partial wiring ≠ Law-complete path.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| Architecture Blueprint §9 | Money → vendor/customer + GL/JE + reverse |
| QuickBooks Banking | For review → Match / Categorize / Exclude / Transfer |
| NetSuite bank reconciliation | Match to AP/AR + GL |
| WF-012 single-link | One bank txn → one entity link |

---

## Live flag state (Neon, RLS bypass `lucia`)

| Flag | `default_enabled` | Overrides |
|---|---|---|
| `BANK_FEED_GL_POSTING_ENABLED` | **false** | TRANSP · TRK · USMCA **ON** |
| `BANK_TX_SPLIT_ENABLED` | **false** | (not required for this hop; splits=0 live) |
| `BANK_TX_SPLIT_GL_POSTING_ENABLED` | **false** | — |

---

## Neon row evidence (same txn, `app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `banking.bank_transactions` | **10,427** | Feed populated |
| `status=pending_categorization` + `review_state=for_review` | **10,424** | **~99.97% uncategorized** |
| `status=categorized` + `review_state=matched` | **3** | Only completed categorizations |
| Those 3 with `categorization_gl_account_id` + `matched_journal_entry_id` | **3** | GL stamp present |
| JE postings `source_transaction_type='bank_categorization'` | **6** | 3 txns × 2 legs — **live poster proof** |
| `matched_bill_id` / `matched_invoice_id` | **0** | **No Match-to-AP/AR live** |
| `banking.bank_transaction_splits` | **0** | Split path unused |
| `categorization_driver_id` set | **5** | Sparse driver tagging |
| Journal entries (all) | **7** | Includes bank + invoice fixtures |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **Bank feed ingest (Plaid/Relay wallet)** | **PASS** (live volume) | 10,427 rows; Banking Home uncategorized KPI. |
| 2 | **For-review / uncategorized queue UI** | **PASS** | `BankingHome`, `BankingTransactionsDesignView`, categorize panel. |
| 3 | **Categorize → GL account tag** | **PASS** (repo + 3 live) | `categorization.routes.ts` + `maybePostBankCategorizationToGl`. |
| 4 | **Categorize → JE (`bank_categorization`)** | **PASS** (live sample) · **FAIL** (coverage) | 3/10427 posted. Flag ON; poster interlocks documented (skip bill match, transfer, driver-advance branch). |
| 5 | **Match to bill / invoice / settlement / load** | **FAIL** (live) | `matched_bill_id`/`matched_invoice_id`=0. FE can show EntityLinks when match ids set (`BankingTransactionsDesignView`). Obligation reconcile routes exist; unused live. |
| 6 | **Split categorize** | **FAIL** (live) / **PASS** (repo gated) | Splits table empty; flags default OFF. |
| 7 | **Vendor / customer / driver / unit / load on categorize** | **PARTIAL** | UI drafts EntityLink driver/unit/load/customer/vendor. Live: almost no completed categorizations; driver tags sparse. |
| 8 | **Reverse: Account Register → bank txn** | **FAIL** | `sourceRoute` has no `bank_categorization` case → falls back to `/accounting/journal-entries` list (`AccountRegisterPage.tsx` ~57–65). |
| 9 | **Reverse: JE detail → bank txn** | **FAIL** | API `GET …/source-links` exists; **JournalEntryDetailPage does not render source EntityLinks**. |
| 10 | **Reverse: Bank txn → JE** | **PASS** (data) · **PARTIAL** (UI) | `matched_journal_entry_id` on 3 rows; UI EntityLink coverage for JE not confirmed on all rows. |
| 11 | **WF-012 single-link invariant** | **UNVERIFIED** (at scale) | Interlocks in poster; not proven across 10k backlog. |
| 12 | **Audit** | **PASS** (repo) · **UNVERIFIED** (bulk) | Categorize path emits audit; not sampled across backlog. |

---

## Surfaces that must show this money

| Surface | Should show | Current |
|---|---|---|
| Banking Home / Transactions | For review + categorized | 10k backlog |
| Categorize panel | GL + entities | Works for 3 |
| Find match / Obligation reconcile | Match to bill/invoice/load | **0 live matches** |
| Account register / JE | Bank-sourced legs | Legs exist; reverse route incomplete |
| Factoring remittance (related) | Bank ↔ factor advance | See P-FACTOR (`bank_match_suggestion=0`) |
| Transfers / CC payment modals | Categorize after post | Wired best-effort |

---

## Ranked FAIL list (code fixes — Bank match)

1. **P0 — Account Register `sourceRoute('bank_categorization')` → bank txn detail**  
   Land on Banking transactions with txn id expanded (deep-link already partly supported). Guard: register row click for bank_categorization opens bank txn, not JE list-only.

2. **P0 — JE detail consumes `source-links` with EntityLink to bank txn**  
   Wire existing `GET /api/v1/accounting/journal-entries/:id/source-links`. Shared with Invoice/Expense audits.

3. **P0 — Operational + product path to clear For-review backlog**  
   Rules engine / bulk categorize / match suggestions so 10k rows do not sit unposted. Code without ops clearance still leaves Law FAIL. Guard: uncategorized KPI trend + sample JE coverage.

4. **P1 — Match-to-invoice and match-to-bill live proof**  
   Accept match sets `matched_invoice_id` / `matched_bill_id` and does **not** double-post via categorize (poster already skips matched bill).

5. **P1 — Driver/unit/load required when category implies trucking expense**  
   Fail closed or warn hard for fuel/toll/advance categories without driver/unit.

6. **P2 — Split GL when `BANK_TX_SPLIT_*` enabled**  
   Prove splits → JE legs; currently unused.

---

## Acceptance (this audit PR)

```
ROOT CAUSE: Bank categorize→GL poster is real (3 live posts) but ~all feed lines remain for_review with zero invoice/bill matches, and reverse drills from Account Register / JE detail to bank txn are incomplete.
FIX: docs-only evidence audit. Code fixes ranked above — not in this PR.
GUARD: n/a (audit). Future: verify-account-register-bank-categorization-route.mjs + verify-je-detail-source-links-ui.mjs (Rule 17 steps only).
LIVE PROOF: bank_transactions=10427 (10424 for_review, 3 categorized+JE); bank_categorization JE legs=6; matched invoice/bill=0; BANK_FEED_GL ON ×3; health e64fc4c.
REMAINING: P0–P2; Cursor never merges / never Neon-applies.
```

---

## Explicit non-claims

- Did **not** treat 3 successful categorizations as path PASS.  
- Did **not** Neon-apply or merge.  
- CONN-1 / Plaid reconcile-commit HOLD items remain owner-gated elsewhere — this audit is Law §9 linkage on shipped categorize/match surfaces.
