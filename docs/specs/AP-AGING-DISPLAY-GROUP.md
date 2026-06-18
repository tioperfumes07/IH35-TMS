# A/P Aging — display_group (By-Vendor-Type view) — spec + caveats

Block F, decision **F-c** (read-layer map, no migration). Implemented in
`apps/backend/src/accounting/ap-aging.service.ts` (`resolveDisplayGroup`), shipped in PR #1174,
GUARD-verified against live A/P 2026-06-18.

## What it is
`getApAgingReport` returns a `display_group` per vendor for the "By Vendor Type" A/P view. It is a
**read-layer mapping only** — it does NOT change `mdata.vendors.vendor_type`, which must stay
reconcilable against QBO during the migration. Reversible by definition (no schema change).

## Mapping (priority order)
1. **Intercompany** — vendor identity matches **another active `org.companies` entity** (name match,
   entity-scoped `c.id <> current_company`). The TRK↔TRANSP intercompany line (~$293K) surfaces as its
   own group — entity-independence requirement, never folded into Other.
2. **Driver** — `vendor.qbo_vendor_id` matches a `mdata.drivers.qbo_vendor_id` (same entity).
3. Else by `vendor_type` enum: `Fuel`→**Diesel**; `Repair`→**Repair**; `Insurance`→**Insurance**;
   `Tires/Towing/Permit/Toll/Other/null`→**Other**.
Identity (1, 2) always wins over the enum (3).

## ⚠️ CAVEAT — Intercompany is matched by vendor NAME (heuristic), display-only
- Entity names are distinctive ("IH 35 Trucking", "IH 35 Transportation"), so the known intercompany
  line is caught and false positives are unlikely.
- **Safe failure direction:** a differently-named intercompany vendor falls to **Other** — it is never
  *mis*-flagged as intercompany. Under-recall, not mis-attribution.
- **USMCA** is `is_active=false` until its July 2026 launch, so its intercompany vendors won't group as
  Intercompany until then — expected.
- **If Intercompany ever needs to be AUTHORITATIVE** (drive accounting/eliminations, not just a display
  grouping), replace name-matching with a real **entity-link flag/column** on the vendor — that is a
  separate, deliberate, **show-SQL-first** migration designed with QBO reconciliation in mind. Do NOT
  promote this heuristic into a posting/elimination input.

## Scope guard
`vendor_type` stays the QBO-reconcilable source of truth. Do not add `Intercompany`/`Driver` as persisted
`vendor_type` enum values under this feature — see CLAUDE.md §7 (additive-only) + the QBO migration context.
