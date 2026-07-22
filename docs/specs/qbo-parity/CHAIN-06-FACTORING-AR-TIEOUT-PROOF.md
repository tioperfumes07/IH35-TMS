# CHAIN-06 — Invoice → A/R → Factoring Tie-Out Proof (Design Doc)

**Status:** `[HOLD-FOR-JORGE — TIER 1 FINANCIAL]` — design doc + **read-only** proof only. No posting
code, no migration, no flag flip, no live post. (CLAUDE.md §1.4/§1.7.)

> **STATUS 2026-07-21 — CODE FIXED + GUARDS WIRED (verify-steps 920–922); live money path still requires owner flag/ops proof.**
> The §5 / §7-A AR-subledger gap described below was **closed in code** (CONN-2 /
> `applyCustomerPaymentSubledgerRelief` / `applyChargebackSubledgerRelief` on
> `poster.service.ts`). Do **not** treat this doc’s historical “not patched here” language as current
> defect state. **Not LIVE-VERIFIED with money** — flag/ops proof still owner-gated.
> Cross-link: PR #3121 evidence map (`docs/trackers/TOP10-BUILDER-EVIDENCE-2026-07-21.md`).

**Directive this proves (Jorge, 2026-07-05):** *"AR closes when the CUSTOMER pays the FACTORING
company, NOT IH35."* i.e. the funding/advance event must **never** relieve A/R; only the customer's
actual remittance to Faro relieves it.

**Relationship to the existing CHAIN-06 docs.**
`CHAIN-06-INVOICE-AR-POSTING-DESIGN.md` (dated pre-CODER-34) designs the invoice-issue JE (`buildInvoiceLines`,
DR `ar_control`/CR revenue) and flags the sale-vs-borrowing question as **open decision #2** and the
reserve-role-type question as **open decision #3**. **Both are now RESOLVED** — `db/migrations/202607013000_factoring_secured_borrowing_coa_roles.sql`
and `apps/backend/src/accounting/factoring-posting/poster.service.ts` (PR #1770, CODER-34, merged
2026-07-05, flag `FACTORING_GL_POSTING_ENABLED` still **default OFF**) already re-architected the
factoring poster from the sale model to **secured borrowing (ASC 860)** — exactly Jorge's directive.
**This doc is not a new design of that engine** (no new GL math is proposed here) — it is the **tie-out
proof** that the already-built chain reconciles to the penny, plus one **real subledger gap CODER-34 did
not close** (§5), surfaced per CLAUDE.md §9 (drift prevention: flag it, don't silently patch it).

---

## 1. Ground truth (verified against `db/migrations/` + the poster, not assumed)

| Step | Function (verified, `factoring-posting/poster.service.ts`) | JE (per-entity roles, TRANSP `ar_control`=QBO-45) | Touches A/R? |
| --- | --- | --- | --- |
| Invoice issued | `buildInvoiceLines` (`posting-engine.service.ts`, CHAIN-06's original scope) | DR `ar_control` / CR per-line revenue (+ tax) | **Yes — the only debit** |
| Funding (Faro advances) | `postFactoringAdvanceEvent` (lines 188-250) | DR `cash_clearing` + DR `factor_reserve_held` (asset) + DR `factor_fee_expense` / **CR `factoring_advance_liability`** (full `invoice_total_cents`) | **No** — code comment: *"A/R is UNTOUCHED"* |
| **Customer pays Faro** | `postFactoringCustomerPaymentEvent` (lines 264-308) | DR `factoring_advance_liability` / **CR `ar_control`** | **Yes — the only credit, and the ONLY place A/R goes down under this model** |
| Reserve release | `postFactoringReleaseEvent` (lines 324-368) | DR `cash_clearing` / CR `factor_reserve_held` | No |
| Chargeback (customer never pays) | `postFactoringChargebackEvent` (lines 387-453) | (A) DR `factoring_advance_liability` + DR `default_interest_expense` / CR `cash_clearing` (repay Faro) **and** (B) DR `factoring_recoursed_ar` / CR `ar_control` (move the receivable off trade A/R) | **Yes — B is the OTHER place A/R can go down** (customer defaulted; the receivable is pursued directly, not written off) |

This is **exactly** the secured-borrowing lifecycle Jorge specified and the CPA-locked decision (skill
`ih35-cpa-accounting-decisions` §3: factoring = secured borrowing, NOT a sale; Advance=liability,
Reserve=asset). The wiring point that actually fires `postFactoringCustomerPaymentEvent` is the
`/factoring-advances/:id/reserve-held` route (`factoring-advances.routes.ts` line 498) — its own comment
states the design intent verbatim: *"the reserve_held transition IS the 'customer paid the factor
directly' event... under the secured-borrowing model this is the ONLY place A/R goes down."*

**Corrections to make to the older doc (drift, per §9):** `CHAIN-06-INVOICE-AR-POSTING-DESIGN.md` §10
open decisions #2 (sale-vs-borrowing) and #3 (`factor_reserve_default` role type) should be marked
**RESOLVED by CODER-34 / migration `202607013000`** — reserve is `factor_reserve_held`, an **Asset**
(`OtherCurrentAsset`), not the old `factor_reserve_default` Liability fallback. Both files should agree;
flagging here rather than silently editing the other doc's history.

## 2. The tie-out invariant (to the penny), per invoice / per advance

Because the AR debit (invoice issue) and every possible AR credit (customer-payment, chargeback-return)
are booked as **separate, independently-dated journal entries** (no netting inside one JE), the proof is a
cross-JE reconciliation, not a single balanced-entry check:

- **Leg A — AR debited exactly once per invoice.** For a given `invoice_id`, exactly one posted JE has
  `source_transaction_type='invoice' AND source_transaction_id=<invoice_id>` crediting revenue and
  debiting `ar_control` for `Σ(invoice_lines.line_total_cents) + tax_cents`. (Idempotency key
  `ih35:posting-mvp:v1:<opco>:invoice:<id>:-:initial_post` already guarantees "exactly once" at the
  poster level — this leg re-verifies it holds in the ledger data itself.)
- **Leg B — funding never touches `ar_control`.** No JE with `memo LIKE 'Factoring funding %'` has **any**
  posting line whose `account_id` = the entity's `ar_control` role account. (This is the literal
  "AR is UNTOUCHED at funding" invariant — a regression here is the exact sale-model defect CODER-34 fixed.)
- **Leg C — the liability round-trips to zero over an advance's life.** Per `factoring_advance_id`:
  `SUM(CR factoring_advance_liability, memo LIKE 'Factoring funding %')` (funding) =
  `SUM(DR factoring_advance_liability, memo LIKE 'Factoring customer payment %')` (customer payment) +
  `SUM(DR factoring_advance_liability, memo LIKE 'Factoring chargeback repay %')` (chargeback), **once the
  advance reaches a terminal status** (`collected`/`released`/`recourse_returned`/`voided`). A non-terminal
  advance may have an open (non-zero) liability balance — that is expected, not a defect.
- **Leg D — AR relief for a factored invoice equals its face, exactly once, via the correct event.** For
  `accounting.invoices.factoring_advance_id IS NOT NULL`: the invoice's `ar_control` credit total across
  its life = `SUM(CR ar_control, memo LIKE 'Factoring customer payment %')` **+**
  `SUM(CR ar_control, memo LIKE 'Factoring chargeback receivable %')` (the two — and only two — legitimate
  AR-relief events for a factored invoice) = the invoice's original `ar_control` debit (Leg A). **A factored
  invoice's `ar_control` credit must never come from a `customer_payment`-source JE** (that would be the
  double-relief risk the older doc's §10 item 5 warned about, and the exact defect CODER-34's own guard
  (`verify-factoring-posting-uses-resolver-and-roles.mjs`) asserts is now absent from the poster).
- **Leg E — reserve round-trips.** `SUM(DR factor_reserve_held, funding)` = `SUM(CR factor_reserve_held,
  release)` once `released_at` is set (a reserve released in parts must still sum exactly, no partial
  drift).

## 3. Read-only tie-out SQL (single source — script + `.db.test` share these)

```sql
-- (B) Funding must never touch ar_control — the literal "AR untouched at funding" check.
SELECT je.id AS journal_entry_id, je.memo, jep.account_id, jep.amount_cents
  FROM accounting.journal_entries je
  JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
  JOIN accounting.chart_of_accounts_roles r
    ON r.operating_company_id = je.operating_company_id
   AND r.role = 'ar_control' AND r.is_active AND r.account_id = jep.account_id
 WHERE je.memo LIKE 'Factoring funding %';
-- MUST be empty.

-- (C) Liability round-trip per advance, terminal statuses only.
SELECT fa.id AS factoring_advance_id, fa.status,
       COALESCE(funding.credited, 0)  AS liability_credited_at_funding,
       COALESCE(customer.debited, 0) + COALESCE(chargeback.debited, 0) AS liability_debited_after
  FROM accounting.factoring_advances fa
  LEFT JOIN LATERAL (
    SELECT SUM(jep.amount_cents)::bigint AS credited
      FROM accounting.journal_entries je JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
     WHERE je.memo = 'Factoring funding ' || fa.display_id AND jep.debit_or_credit = 'credit'
  ) funding ON true
  LEFT JOIN LATERAL (
    SELECT SUM(jep.amount_cents)::bigint AS debited
      FROM accounting.journal_entries je JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
     WHERE je.memo LIKE 'Factoring customer payment ' || fa.display_id || ' (%' AND jep.debit_or_credit = 'debit'
  ) customer ON true
  LEFT JOIN LATERAL (
    SELECT SUM(jep.amount_cents)::bigint AS debited
      FROM accounting.journal_entries je JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
     WHERE je.memo LIKE 'Factoring chargeback repay ' || fa.display_id || ' (%' AND jep.debit_or_credit = 'debit'
  ) chargeback ON true
 WHERE fa.status IN ('collected', 'released', 'recourse_returned', 'voided')
HAVING COALESCE(funding.credited, 0) <> (COALESCE(customer.debited, 0) + COALESCE(chargeback.debited, 0));
-- MUST be empty for terminal advances.

-- (D) Double-relief guard: a factored invoice's AR credit must never come from a customer_payment
-- source-type JE (the retired sale-model path) — it must come only from the factoring poster's own JEs.
SELECT i.id AS invoice_id, jep.id AS posting_line_id, je.source_transaction_type, je.memo
  FROM accounting.invoices i
  JOIN accounting.journal_entry_postings jep ON jep.source_transaction_type = 'customer_payment'
  JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
  JOIN accounting.payment_applications pa ON pa.payment_id = jep.source_transaction_id::uuid AND pa.invoice_id = i.id
 WHERE i.factoring_advance_id IS NOT NULL;
-- Expect empty for any invoice whose factoring_advance_id is set (a factored invoice should never also
-- carry a manual/customer_payment AR-relief JE — that would double-relieve AR against the same face amount).
```

`scripts/verify-chain-06-factoring-ar-tieout.mjs` (§6) runs (B) and (C) live, degrade-safe; (D) is
reported informationally today (few/no invoices are QBO-parity-migrated with real `payment_applications`
rows yet) and becomes a hard guard once invoice-level factoring goes live.

## 4. Forward + reverse drill-through (Law of the Land §10a)

**Forward:** `mdata.loads` (`source_load_id`) → `accounting.invoices` (`source_load_id`) →
`accounting.invoice_lines` (revenue) → JE-1 (`ar_control` debit) → `accounting.factoring_advances`
(`invoices.factoring_advance_id`) → funding JE (liability credit, AR untouched) → customer-payment JE
(liability debit / `ar_control` credit — **AR closes here**) → (optional) reserve-release JE.

**Reverse:** a `journal_entry_postings` row on `ar_control` with `memo LIKE 'Factoring customer payment %'`
→ parse `factoring_advances.display_id` out of the memo (`§3`'s `LIKE` pattern) → `factoring_advances.id`
→ `accounting.invoices WHERE factoring_advance_id = ...` → `invoices.source_load_id` → the original load.
**Gap noted, not fixed here:** the reverse link today is **memo-string parsing**, not a foreign key —
`journal_entry_postings` has no `source_transaction_id` pointing at the `factoring_advances` row for these
JEs (they are posted via `createJournalEntry` directly, bypassing the `transaction_source_links` spine that
`postSourceTransaction`-routed entries get — see the poster's own header comment: *"We deliberately do NOT
use the posting-engine's `customer_payment` source type... and do NOT edit the shared posting-engine"*).
**Recommendation (not built here):** a future block should have the factoring poster also write
`accounting.transaction_source_links` rows (`linked_object_type='factoring_advance'`,
`linked_object_id=<factoring_advance_id>`) per posting line, matching the audit-spine pattern every other
poster uses — restores structural (not string-parsed) reverse drill. Flagged as an open decision (§7-D).

## 5. Tie-out mismatch discovered in the current model (reported per instructions, not silently fixed)

> **STATUS 2026-07-21 — CODE FIXED + GUARDS WIRED (verify-steps 920–922); live money path still requires owner flag/ops proof.**
> Section below is **historical discovery text** (as of PR #2188 / CODER-34). The code gap is closed;
> keep the narrative for audit trail. Do not re-open as an unfixed build item.

**[HISTORICAL — pre-CONN-2]** The GL relieved `ar_control`; the A/R subledger (`accounting.invoices`)
did not reflect it. `postFactoringCustomerPaymentEvent` and `postFactoringChargebackEvent` wrote only to
`accounting.journal_entries` / `journal_entry_postings`. Neither the poster nor its caller
(`factoring-advances.routes.ts` `/reserve-held` route, verified lines ~460-521) updated
`accounting.invoices.amount_paid_cents` or `status`. Verified at discovery time:
`grep -n "amount_paid_cents\|status = 'paid'" apps/backend/src/accounting/factoring-advances.routes.ts`
returned **no matches**. The route updated only `factoring_status` (`'advanced'` → `'reserve_held'`).

**[HISTORICAL effect]** Flipping `FACTORING_GL_POSTING_ENABLED` ON without a subledger update would have
left AR Aging (`invoices.amount_open_cents`) showing factored-and-collected invoices as open while the
GL `ar_control` was closed — breaking this doc’s tie-out the moment the flag went on.

**[CURRENT — code]** CONN-2 closed the gap inside the poster (not the route):
`applyCustomerPaymentSubledgerRelief` SETs `amount_paid_cents` + `status` after customer-payment JEs;
`applyChargebackSubledgerRelief` moves status to `'factored'` (leaves `amount_paid_cents` untouched by
design — receivable reclassed, not collected). Guarded by verify-steps **920–922**.
**Still not LIVE-VERIFIED with money** — owner flag/ops proof required before claiming live AR-aging
tie-out.

## 6. Guard script

`scripts/verify-chain-06-factoring-ar-tieout.mjs` — degrade-safe (no `DATABASE_URL` → skip, exit 0),
advisory by default (`CHAIN_06_TIEOUT_ENFORCE=true` to block), same `ASSERTIONS`-object pattern as
`verify-balanced-ledger.mjs` / the CHAIN-04 guard (§6 of that doc). Runs queries (B)/(C) above; reports (D)
and the §5 subledger gap as informational findings (never fails the guard on data that predates the fix).

## 7. Open decisions for Jorge

- **A. (the real gap, §5).** ~~Confirm the fix belongs to the eventual `FACTORING_GL_POSTING_ENABLED`
  go-live block: update `accounting.invoices.amount_paid_cents`/`status` in the same transaction as
  `postFactoringCustomerPaymentEvent`/`postFactoringChargebackEvent`.~~
  **STATUS 2026-07-21 — CODE FIXED + GUARDS WIRED (verify-steps 920–922); live money path still
  requires owner flag/ops proof.** Subledger relief is in the poster; remaining owner gate is flag-on
  + live ops proof (not a code rebuild). See PR #3121 evidence map.
- **B.** Confirm reserve/fee/liability round-trip (Leg C) is the right acceptance bar before flag-on —
  recommend running this proof against a Neon branch with a handful of real Faro submissions replayed
  through the poster (flag ON, branch only) before Jorge approves prod flag-on.
- **C.** Confirm the reverse-drill gap (§4) — add `transaction_source_links` writes to the factoring
  poster — is a follow-up block, not blocking this proof.
- **D.** `docs/specs/qbo-parity/CHAIN-06-INVOICE-AR-POSTING-DESIGN.md` §10 items #2/#3 should be marked
  RESOLVED-BY-CODER-34 in that file directly (a small doc edit) rather than left to silently contradict
  this one — flagging per §9 rather than editing that file's history in this PR.

---

## Guardrails honored
Design doc + **read-only** proof only · no new GL math (the secured-borrowing engine is CODER-34's,
already merged, flag OFF) · no migration in this PR (roles/accounts already seeded by `202607013000`) ·
surfaces the §5 subledger gap rather than patching it solo · `[HOLD-FOR-JORGE — TIER 1]`, never
self-merged (§1.4).

> **Addendum 2026-07-21:** §5 code gap later closed in CONN-2 + guarded by verify-steps 920–922.
> This design doc remains the historical discovery record; see status banners above. Not LIVE-VERIFIED
> with money until owner flag/ops proof.
