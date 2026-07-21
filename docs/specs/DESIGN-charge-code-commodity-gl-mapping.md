# DESIGN — Charge-code / commodity → GL revenue mapping (§4.4)

**Status:** DESIGN ONLY — no code, no migration. The build touches `accounting.*` (financial cluster,
§1.4) and is owner-gated; builder never self-merges.
**Author:** builder lane, 2026-07-21. **Verified against:** `origin/main`.
**Related:** handoff `[[handoff-audit-and-fix-program-2026-07-20]]` §4.4 (corrected here) · Block-21
`expense_category_account_map` · Block-33 invoice-line revenue mapping

---

## 0. The handoff premise is STALE — the mapping mechanism EXISTS

§4.4 says *"Charge-code / commodity → GL mapping tables don't exist (fuel surcharge, accessorials,
commodity) → build mapping (QBO item→account model)."* Verified on `origin/main` — **that is wrong for
charge codes.** The mechanism is built and in use:

- `apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts` →
  `resolveInvoiceLineRevenueAccountId(opco, {line_type, revenue_code})`.
- It maps each invoice line type — `linehaul, fsc, detention, layover, lumper, tonu, accessorial, tax,
  adjustment, other` — to a `revenue_code`, then resolves the account via
  `resolveAccountForCategory(opco, "revenue", revenue_code)`.
- That resolver reads **`accounting.expense_category_account_map`** (Block-21, migration `0218`), whose
  `category_kind` CHECK already includes `'revenue'`. So the same map table serves expense AND revenue.
- The QBO item→account model the handoff asked to build also already exists: **`catalogs.items`**
  (migration `0010`) carries `default_income_account_id → catalogs.accounts` + `qbo_item_id`.

So the deliverable is **not** "build the missing tables." Building a parallel mapping would be a
duplicate — exactly the split-brain the linkage law (C2) forbids. The real work is narrower, and
reading the existing code surfaced two genuine issues the handoff did not name.

---

## 1. Real issue A (correctness, code) — `deriveRevenueCode` silently mis-routes

`deriveRevenueCode` (same file) ends with a **catch-all** and two questionable maps:

```
if (type === "tonu")       return "accessorial";
if (type === "tax")        return "accessorial";   // tax is NOT revenue
if (type === "adjustment") return "accessorial";
return "accessorial";                              // ANY unknown/new line type → accessorial, silently
```

Two problems:

1. **`tax → accessorial` books a tax charge as accessorial REVENUE.** Sales/other tax collected on an
   invoice is a **liability** (tax payable), not income. Routing it to the accessorial revenue account
   overstates revenue and understates the tax liability — a real financial misstatement a CPA/auditor
   would flag. (Whether IH35 even bills tax on freight is an owner question — but if a `tax` line ever
   appears, this posts it wrong.)
2. **The catch-all `return "accessorial"`** means any line type not in the list — including a new one
   added later — silently posts to the accessorial revenue account with **no error**. This is the same
   default-green failure shape seen elsewhere this session: the safe outcome (fail loud / explicit map)
   is not the default. A new `fuel_surcharge_canada` or `hazmat_fee` line would vanish into accessorial
   revenue and nobody would know.

**Fix (owner-gated, small):** make the mapping explicit and **fail loud** on an unmapped type instead of
defaulting. Route `tax` to a tax-liability code (or reject it from the revenue resolver entirely, since
it is not revenue). No catch-all — an unknown line type throws `ExpenseCategoryMapResolutionError`, so
it is caught in test/CI, not silently mis-booked in prod.

## 2. Real issue B (data/seed) — UNVERIFIED: are the revenue rows seeded per entity?

`resolveAccountForCategory(opco, "revenue", code)` **throws** `ExpenseCategoryMapResolutionError` when
no active row exists for `(operating_company_id, 'revenue', code)`. So the mechanism only works if
`accounting.expense_category_account_map` is **seeded** with a `category_kind='revenue'` row for every
revenue_code — `linehaul, fuel_surcharge, detention, layover, lumper, accessorial` — **per entity**
(TRANSP, TRK, USMCA).

Whether those rows exist on prod is **UNVERIFIED — needs a live check (§1.5, routed to GUARD).** If they
are missing, every accessorial/FSC invoice line **throws at post time** — a live revenue-posting outage
that a code-only review cannot see. This is the highest-value thing to confirm, and it is a prod read,
not a build:

```sql
-- GUARD prod probe (RLS-immune shape, per-entity GUC): which revenue_codes are mapped, per entity?
SELECT operating_company_id, category_code, count(*)
FROM accounting.expense_category_account_map
WHERE category_kind = 'revenue' AND is_active
GROUP BY 1,2 ORDER BY 1,2;
-- Expect a row for each of: linehaul, fuel_surcharge, detention, layover, lumper, accessorial × 3 entities.
```

A 0/empty result is a masked RLS read, not proof of absence — re-run with the GUC set and a positive
control before concluding (false-empty rule).

## 3. Commodity → GL — likely NOT a real requirement (confirm with owner)

There is no commodity → account mapping, and standard TMS/accounting practice (McLeod, QBO) recognizes
freight revenue by **charge type** (line-haul, FSC, accessorial), **not by commodity** — commodity
describes the load, but the revenue account is the same regardless of what's hauled. So "commodity →
GL mapping" is probably a mis-filed line in the handoff, not a gap.

**Owner question:** is commodity-level revenue differentiation actually wanted (e.g. separate income
accounts for reefer vs. dry vs. hazmat freight)? If yes, it's an additive `commodity → revenue_code`
lookup feeding the same resolver. If no (the likely answer), close it — don't build an unused table.

---

## 4. Recommended work (in priority order)

1. **GUARD prod probe (§2)** — confirm revenue-code seed coverage per entity. If gaps exist, seeding
   them is an owner-gated `accounting.*` data migration (§1.4). **Highest priority — a missing row is a
   live posting throw.**
2. **Fix `deriveRevenueCode` (§1)** — explicit map + fail-loud on unknown; correct `tax` handling.
   Owner-gated (touches revenue posting), small, with a static guard.
3. **Static guard** — assert every `InvoiceLineType` has an explicit revenue_code (no catch-all), and
   that `tax` is not silently booked as revenue. `--selftest` with a planted new type that must fail.
4. **Commodity (§3)** — owner decision first; build only if wanted.

## 5. What this document does NOT do

No code, no migration, no schema, no seed, no prod access. It corrects a stale handoff premise and scopes
the real, narrower work. Per §1.4 the builder will not self-merge the resulting build, and does not merge
at all. Docs-only change → non-financial PR.
