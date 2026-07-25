# Owner rulings recorded 2026-07-25 (chat)

| # | Topic | Ruling | Build next |
|---|---|---|---|
| 1 | LST-F17 + catalogs | **A** — each company own catalog rows; add/edit/remove for that company only; same catalog *shape* for all companies | Migrate `catalogs.cancellation_reasons` + `operating_company_id` + seed parity; cancel-load writes that table; extend pattern to other non-GLOBAL catalogs |
| 2 | LINK-02 detail types | **WIRE** + create + filter by account type | Additive `catalogs.accounts.detail_type_id` FK; keep cascade UI; ensure Trailer Repairs–style create is end-to-end |
| 3 | QBO projection flags | **LATER** | Leave OFF until software ready for testing |

Canonical law text: `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` § 2026-07-25 Catalog per-entity + detail-types WIRE + QBO flags LATER.
