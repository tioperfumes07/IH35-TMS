# GLOBAL-BY-DESIGN catalogs (Lists) — 2026-07-25

**Lane:** DOCS + guard ratchet · **Finding:** clears mis-filed RLS-off leaks on taxonomies with **no** `operating_company_id`.

## Law

| Signal | Meaning | Action |
|---|---|---|
| No `operating_company_id` column | GLOBAL-BY-DESIGN shared taxonomy | `companyScoped: false`; RLS-off / role RLS may be intentional; **do not company-scope** |
| Has opco + policy `USING(true)` | Entity-blind defect | Scope it (other LST blocks) |
| Has all-NULL opco + `opco IS NULL OR = GUC` | Shared-canonical | Leave; do not FORCE-filter to empty |
| Missing inbound FK on accounting islands | Ranked ACCT finding | Wire in **ACCT-02** — not here |

## Confirmed GLOBAL-BY-DESIGN (Neon `br-fancy-credit-akjnd07a`, lucia 2026-07-25)

Re-run (all return **0** opco columns):

```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT table_name,
       COUNT(*) FILTER (WHERE column_name = 'operating_company_id') AS has_opco
FROM information_schema.columns
WHERE table_schema = 'catalogs'
  AND table_name IN ('account_types', 'wo_cancellation_reasons', 'tire_positions')
GROUP BY 1;
```

| Table | Rows (lucia) | Notes |
|---|---:|---|
| `catalogs.account_types` | 15 | Shared CoA type taxonomy; count-spec `companyScoped: false` |
| `catalogs.wo_cancellation_reasons` | 6 | Shared WO cancel taxonomy; island(by-design) for inbound FK |
| `catalogs.tire_positions` | 0 | Shared tire position codes; fleet conversion explicitly excluded |

**Cleared (mis-file):** LST-RLS-01 “RLS-off leak” on `account_types` / `wo_cancellation_reasons` is **not** an entity-scope defect when there is no opco column. Annotate scoreboard only after owner/Neon decision — do **not** flip PASS without evidence that RLS-off is accepted for the global set (this PR registers the design; RLS-on-without-opco is optional hardening, not required by this block).

## Explicitly NOT in this registry

| Table | Where it goes |
|---|---|
| `journal_entry_types` | **ACCT-02 / ACCT-F02** — additive typed FK (HELD) |
| `detail_types` | **ACCT-02 / ACCT-F03** — owner lock on subtype TEXT; do not wire FK without written unlock |
| `cancellation_reasons` (legacy) | **LST-F17** owner decision — never DROP (§F.24) |

## Companion

- Count-spec: `account_types` + `tire_positions` already `companyScoped: false`.
- Guard: `scripts/verify-global-by-design-catalogs.mjs` + verify-step **1455**.
- Wiring inventory: `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md` (GLOBAL-BY-DESIGN notes on the three).
