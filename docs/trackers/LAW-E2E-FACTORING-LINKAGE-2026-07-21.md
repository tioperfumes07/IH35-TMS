# LAW-E2E — Factoring advance → liability/reserve → JE linkage (2026-07-21)

**BLOCK:** `LAW-E2E-FACTORING-LINKAGE-2026-07-21`  
**MODULE:** factoring / accounting (secured borrowing)  
**PATH ID:** `P-FACTOR`  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch2-audit` · branch `audit/law-e2e-batch2-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (matches)  
**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · **READ ONLY**  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater  
**Master:** `docs/trackers/LAW-FULL-LINKAGE-AUDIT-MASTER-2026-07-21.md`

Law §9 + CPA secured-borrowing model (Faro): factoring is **borrowing**, not sale — advance liability, reserve asset, fee expense, A/R assigned to factor, lifecycle JE provenance.

---

## Verdict (one line)

**FAIL overall.** Secured-borrowing poster + CoA roles + Faro import/batch UI exist in repo and `FACTORING_GL_POSTING_ENABLED` is **ON** for TRANSP/TRK/USMCA — but Neon has **zero** `factoring.batch`, `accounting.factoring_advances`, reserve movements, lifecycle posting keys, and **zero** factoring-sourced JE legs. Flags ON with empty economic tables = **unshipped path**, not PASS.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| Architecture Blueprint §9 + Faro terms | Advance → liability/reserve/fee → JE; invoice linkage |
| CPA skill `ih35-accounting-decisions` | Secured borrowing (not sale/derecognition) |
| ASC 470 | Debt / borrowing presentation |
| McLeod / Alvys factoring ops | Batch → advance → reserve release → recourse |

---

## Live flag state (Neon, RLS bypass `lucia`)

| Flag | `default_enabled` | Overrides |
|---|---|---|
| `FACTORING_GL_POSTING_ENABLED` | **false** | TRANSP · TRK · USMCA **ON** |

---

## Neon row evidence (same txn, `app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `factoring.batch` | **0** | No TMS factoring batches |
| `accounting.factoring_advances` | **0** | No advances to post |
| `accounting.factoring_reserve_movements` | **0** | No reserve ledger activity |
| `factoring.reserve_movement` | **0** | Empty |
| `accounting.factoring_lifecycle_posting_keys` | **0** | No lifecycle JE keys |
| `accounting.factoring_default_interest_accruals` | **0** | Empty |
| `factoring.bank_match_suggestion` | **0** | Empty |
| JE postings with factoring lifecycle types | **0** | No live factoring GL |
| CoA roles (TRANSP active): `factoring_advance_liability`, `factor_reserve_held`, `factor_fee_expense`, `ar_assigned_to_factor`, `factoring_recoursed_ar` | **1 each** | Designation **PASS**; unused without events |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **Factor / customer assignment UI** | **PASS** (repo) | `apps/frontend/src/pages/factoring/*` (Home, BatchWizard, SubmissionQueue, FaroImport, Reserve*). Backend `factor.service` / assignment tables. |
| 2 | **Invoice → factoring submission** | **PASS** (repo FE) · **FAIL** (live volume) | EntityLinks invoice↔queue. Depends on real invoices (see P-INVOICE: 1 fixture, no load). |
| 3 | **Batch create (`factoring.batch`)** | **PASS** (repo) · **FAIL** (live) | `batch.service.ts` inserts batches. Neon `factoring.batch=0`. |
| 4 | **Advance row (`accounting.factoring_advances`)** | **FAIL** (live) | Neon advances=0. Faro CSV import path can call `postFactoringAdvanceEvent` (`faro-csv-import.ts`). |
| 5 | **GL poster secured-borrowing lifecycle** | **PASS** (repo) · **UNVERIFIED** (live success) | `accounting/factoring-posting/poster.service.ts` — advance / customer payment / release / chargeback / default interest; gated by `FACTORING_GL_POSTING_ENABLED`. Live JE legs=0. |
| 6 | **Lifecycle source links + posting keys** | **PASS** (repo) · **FAIL** (live) | `lifecycle-repair.ts` + `factoring_lifecycle_posting_keys`. Neon keys=0. |
| 7 | **Reserve tracker / movements** | **PASS** (repo UI) · **FAIL** (live) | Reserve pages exist; Neon reserve tables=0. |
| 8 | **Bank match suggestions (factor remittance)** | **FAIL** (live) | `factoring.bank_match_suggestion=0`. |
| 9 | **Reverse: Invoice detail → factoring advance** | **PASS** (repo) | `InvoiceDetailPage` EntityLink `kind="factoring_advance"` when `factoring_advance_id` set. Live never set. |
| 10 | **Reverse: JE → factoring event** | **UNVERIFIED** | No live factoring JE; JE detail FE still weak on source-links (shared gap). |
| 11 | **Driver / unit / load on factor path** | **FAIL** (via invoice/load gap) | Factoring rides invoices/loads; live invoices lack `source_load_id`. |
| 12 | **Audit** | **PASS** (repo) · **UNVERIFIED** (live) | Poster writes provenance; no live events. |

---

## Surfaces that must show this money

| Surface | Should show | Current |
|---|---|---|
| Factoring Home / Batch / Submission | Batches + invoices | UI shipped; **empty Neon** |
| Faro import | Advances + JE | Code calls poster; **0 advances** |
| Reserve dashboard | Reserve held/released | Empty |
| Invoice detail | Factoring advance link | Wired; unused |
| CoA roles / JE / Account register | Liability/reserve/fee | Roles designated TRANSP; no postings |
| Banking factor remittance match | Bank ↔ advance | Suggestions table empty |

---

## Ranked FAIL list (code fixes — Factoring)

1. **P0 — Ship one real Faro/TMS advance E2E on TRANSP (ops + code)**  
   Create batch → advance row → `postFactoringAdvanceEvent` with flag ON → lifecycle keys + JE legs. Prove on Neon. Without this, factoring GL is theater.

2. **P0 — Block “factored” invoice UI state without `factoring_advance_id` + JE provenance**  
   Fail closed when UI claims factored but advance/JE missing. Guard: invoice marked factored ⇒ advance row + lifecycle key.

3. **P1 — Wire JE detail source-links for factoring lifecycle types**  
   Consume `GET …/journal-entries/:id/source-links` for advance/release/chargeback.

4. **P1 — Reserve movement reverse drill**  
   Reserve UI → JE + invoice + advance EntityLinks both ways.

5. **P1 — Depend on P-INVOICE P0**  
   Factoring cannot Law-pass without real load-linked invoices.

6. **P2 — Bank remittance match suggestions → accept → JE**  
   Populate/consume `factoring.bank_match_suggestion` with live Faro remittances.

---

## Acceptance (this audit PR)

```
ROOT CAUSE: Factoring GL poster and CoA roles are shipped and flags are ON, but production has zero batches/advances/reserve/lifecycle keys/JE — the economic path never ran.
FIX: docs-only evidence audit. Code/ops fixes ranked above — not in this PR.
GUARD: n/a (audit). Future: verify-factoring-advance-posts-lifecycle-je.mjs (Rule 17 step only).
LIVE PROOF: Neon factoring.batch=0, advances=0, lifecycle_keys=0, factoring JE=0; CoA factoring roles active on TRANSP; FACTORING_GL ON ×3; health e64fc4c.
REMAINING: P0–P2; owner/CPA gate on any money PR; Cursor never merges / never Neon-applies.
```

---

## Explicit non-claims

- Did **not** treat CoA designation or flag ON as live posting proof.  
- Did **not** Neon-apply or merge.  
- Invoice AR gaps are owned by P-INVOICE companion audit.
