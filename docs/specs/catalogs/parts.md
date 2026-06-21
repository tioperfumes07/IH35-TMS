# Catalog spec — Parts (Parts Master) · `catalogs.parts`

**Lane A · Tier-A2 bespoke catalog** (custom schema — does **not** fit the generic `code`/`display_name`
factory). Endpoint base `/api/v1/catalogs/parts` (OC-scoped). Build = typed GET/POST/PATCH + a typed
catalog page + `+ Create` form. **No migration** (table exists) → builds on the no-migration lane; opened
`[HOLD-FOR-JORGE]` for GUARD live-verify (touches live ops master-data).

## Benchmark research (NetSuite / QuickBooks / McLeod / Alvys)
A fleet **parts master** is the reference catalog of purchasable/stock parts that feed Work Order line
items + cost. Cross-referencing the four systems' part/item masters:

| Concept | NetSuite (Inventory Item) | QuickBooks (Product/Service) | McLeod (Parts Inventory) | Alvys (Parts) | → our column |
|---|---|---|---|---|---|
| Identifier | Item Name/Number | Name / SKU | Part Number | Part # | **`part_number`** ✓ |
| Description | Display Name / Description | Description | Description | Name | **`part_name`** ✓ |
| Unit cost | Purchase Cost | Cost | Unit Cost | Cost | **`default_cost`** ✓ (numeric 10,2) |
| Applicability | Class / Subsidiary | Category | Equipment class | — | **`applies_to_unit_class`** ✓ (text[]) |
| Active | Inactive flag | Active | Active | Active | **`is_active`** ✓ |
| Accounting sync | — | QBO item link | GL account | — | **`qbo_item_id`** ✓ (mirror) |
| Category | Category | Category | Part category | Category | *(gap — see below)* |
| Unit of measure | Units type | — | UOM | UOM | *(gap)* |
| Preferred vendor | Preferred Vendor | — | Vendor | Vendor | *(gap)* |
| Stock/bin/reorder | Location, reorder pt | — | Bin, qty, reorder | Qty | *(gap — inventory, out of catalog scope)* |

**Build-to-the-existing-schema decision:** the live `catalogs.parts` already covers the *catalog* essentials
(identifier, description, cost, applicability, active, QBO link). I build the full typed catalog UI + create
form to **those columns** — never inventing fields, never ALTERing the table.

**Benchmark gaps (category / UOM / preferred vendor)** are real McLeod/NetSuite niceties but adding them is
an **ALTER TABLE = migration = HOLD** (gate). Logged here as a **follow-up additive-ALTER block** for after
the catalog ships; stock/bin/qty/reorder are **inventory**, not catalog scope (deliberately excluded —
QuickBooks/Alvys keep the part *catalog* separate from on-hand inventory).

## Contract (build to this)
- **GET** `/api/v1/catalogs/parts?operating_company_id=…` → `{ parts: [{ id, part_number, part_name,
  default_cost, applies_to_unit_class, is_active }] }`, `ORDER BY part_number`, `is_active = true` filter
  with an `?include_inactive` opt-in (read already exists in `stub-catalog-purge`; the build keeps it).
- **POST** `/api/v1/catalogs/parts` (Owner/Admin/Manager) → create `{ part_number, part_name, default_cost?,
  applies_to_unit_class?, is_active? }`; **409** on duplicate `(operating_company_id, part_number)` (the
  table's UNIQUE); audited `catalogs.parts.created`.
- **PATCH** `/api/v1/catalogs/parts/:id` → edit name/cost/class/active (not part_number — the key);
  void-not-delete via `is_active=false`.
- All writes OC-scoped (`SET app.operating_company_id`), RLS-respecting, append audit.

## UI (preview-from-live)
A typed catalog page on the real Lists/Catalogs layout: columns **Part #, Part Name, Default Cost, Unit
Class(es), Status**; a `+ Create` modal with those fields (cost as money, unit-class as multi-select chips).
Reuse the existing `CatalogTable` / `BackArrowHeader` / `ListsSubNav` shell.

## Seed (benchmark reference set)
Empty today. A starter set of common shop parts (oil filter, air filter, brake pads, tires, DEF, etc.) can
be **seeded via the create form** by the owner, or as an idempotent `INSERT` into `catalogs.parts` **only**
in an additive migration (now gate-neutral once #1278 merges). Not seeded blindly — Jorge/owner confirms the
starter list so it matches the carrier's real vendors/costs.

## Guardrails
Additive only · no ALTER (gaps deferred) · no migration in the UI/endpoint PR · OC-scoped + audited writes ·
`[HOLD-FOR-JORGE]` for GUARD live-verify (live ops master-data). CI guard locks the GET/POST contract.
