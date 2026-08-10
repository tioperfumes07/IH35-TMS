#!/usr/bin/env node
/**
 * LV-CAT-500 — generic catalog configs that expose `display_name` must declare the physical
 * `displayNameColumn` alias. The factory default maps `display_name` -> `name`; that is correct
 * only when the table actually has a `name` column. Tables whose physical display-name column
 * IS `display_name` (vendor_types, customer_types) must override it, and the guard must keep
 * that override from regressing.
 *
 * Whitelist: catalog tables that existed before this fix and expose `display_name` without an
 * explicit alias were already working on prod, which means they have a real `name` column.
 * New tables must make the alias explicit.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/catalogs/generic-catalog.routes.ts");

// Tables known to have a physical `name` column and that already expose `display_name`
// without an explicit alias. Any new catalog table must declare displayNameColumn.
const KNOWN_NAME_TABLES = new Set([
  "equipment_types",
  "dispatch_error_reasons",
  "customer_quality_event_reasons",
  "dispatch_lumper_providers",
  "accident_types",
  "workplace_incident_types",
  "leave_types",
  "cash_advance_types",
  "pm_intervals",
  "repair_locations",
  "work_order_templates",
  "air_bag_catalog",
  "battery_catalog",
  "tire_catalog",
  "trailer_parts",
  "truck_parts",
  "def_stations",
  "fuel_stations",
  "relay_accounts",
  "toll_providers",
  "load_trailer_equipment",
  "mx_customs_brokers",
]);

function parseConfigBlocks(text) {
  const re = /export\s+const\s+(\w+)CatalogConfig\s*:\s*GenericCatalogConfig\s*=\s*\{([\s\S]*?)\n\};\s*/g;
  const blocks = [];
  let m;
  while ((m = re.exec(text))) {
    blocks.push({ name: m[1], body: m[2] });
  }
  return blocks;
}

function extractStringProp(body, prop) {
  const match = new RegExp(`${prop}\\s*:\\s*"([^"]+)"`).exec(body);
  return match?.[1] ?? null;
}

function usesDisplayName(body) {
  const allowed = body.match(/allowedColumns\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const searchable = body.match(/searchableColumns\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const defaultSort = body.match(/defaultSort\s*:\s*\{[^}]*column\s*:\s*"([^"]+)"/)?.[1] ?? "";
  return /"display_name"/.test(`${allowed} ${searchable}`) || defaultSort === "display_name";
}

export function run() {
  const text = readFileSync(FILE, "utf8");
  const blocks = parseConfigBlocks(text);
  if (blocks.length === 0) {
    return { ok: false, message: `verify-catalog-display-name-alias FAIL — no catalog configs found in ${FILE}` };
  }

  const offenders = [];
  for (const { name, body } of blocks) {
    if (!usesDisplayName(body)) continue;
    const tableName = extractStringProp(body, "tableName");
    const displayNameColumn = extractStringProp(body, "displayNameColumn");

    if (displayNameColumn) continue; // explicit alias is the fix
    if (tableName && KNOWN_NAME_TABLES.has(tableName)) continue; // grandfathered; runtime proven

    offenders.push(`${name} (table: ${tableName ?? "?"})`);
  }

  if (offenders.length > 0) {
    return {
      ok: false,
      message: `verify-catalog-display-name-alias FAIL — ${offenders.length} catalog config(s) expose display_name without an explicit displayNameColumn alias: ${offenders.join(", ")}`,
    };
  }

  return { ok: true, message: `verify-catalog-display-name-alias OK — ${blocks.length} catalog configs checked` };
}

function selftest() {
  const text = readFileSync(FILE, "utf8");
  const vendor = /export\s+const\s+vendorTypesCatalogConfig[\s\S]*?displayNameColumn\s*:\s*"display_name"/.test(text);
  const customer = /export\s+const\s+customerTypesCatalogConfig[\s\S]*?displayNameColumn\s*:\s*"display_name"/.test(text);
  if (!vendor || !customer) throw new Error("selftest expected vendor/customer types to declare displayNameColumn: display_name");
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-catalog-display-name-alias selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
