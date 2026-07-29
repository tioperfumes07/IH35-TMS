#!/usr/bin/env node
/**
 * Every WIREABLE catalog must appear in the Lists count spec.
 *
 * A catalog that is reachable and editable but absent from LISTS_MODULE_COUNT_SPECS has its rows
 * excluded from its domain badge. The badge then shows an authoritative-looking number that silently
 * omits whole tables — the same failure class as a degraded count that does not admit it, except this
 * one has no signal at all, because the spec never knew the table existed.
 *
 * Measured when this guard was written: 28 wireable catalogs were absent from the spec, hiding 249
 * live rows on prod (maintenance_part_locations 123, equipment_line_item_templates 42, vendor_types
 * 24, dispatch_flag_colors 24, customer_types 18, lumper_providers 15, leave_policies 3).
 *
 * Several of those were wired earlier the same day. Wiring a catalog and counting it are two separate
 * edits, and nothing tied them together — so this guard is what makes the second one non-optional.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SPEC = join(ROOT, "apps", "backend", "src", "lists", "lists-module-count-spec.ts");
const INVENTORY = join(ROOT, "docs", "inventories", "catalog-inventory.json");

/** Classifications that mean "an operator can reach and edit this". */
const WIREABLE = new Set(["ROUTED", "ROUTED-PENDING", "ROUTED-NEEDS-SEED", "ROUTED-READ-ONLY"]);

export function uncounted(specSrc, inventory) {
  const inSpec = new Set([...specSrc.matchAll(/table:\s*"(\w+)"/g)].map((m) => m[1]));
  const tables = inventory.tables ?? {};
  const out = [];
  for (const [name, meta] of Object.entries(tables)) {
    if (!WIREABLE.has(meta?.classification)) continue;
    if (!inSpec.has(name)) out.push(name);
  }
  return out.sort();
}

function selftest() {
  const inv = { tables: { alpha: { classification: "ROUTED" }, beta: { classification: "HEADLESS-BY-DESIGN" } } };
  const withAlpha = 'x: [{ table: "alpha", activeFilter: "is_active", companyScoped: true }]';
  const without = 'x: [{ table: "gamma", activeFilter: "is_active", companyScoped: true }]';
  let bad = 0;
  if (uncounted(withAlpha, inv).length !== 0) { console.error("  selftest FAIL — counted catalog reported uncounted"); bad++; }
  else console.log("  selftest OK — a counted wireable catalog passes");
  const miss = uncounted(without, inv);
  if (miss.length !== 1 || miss[0] !== "alpha") { console.error("  selftest FAIL — uncounted catalog not caught"); bad++; }
  else console.log("  selftest OK — an uncounted wireable catalog is caught");
  if (uncounted(without, inv).includes("beta")) { console.error("  selftest FAIL — an excluded catalog was demanded"); bad++; }
  else console.log("  selftest OK — a HEADLESS-BY-DESIGN catalog is not demanded");
  if (bad) { console.error(`SELFTEST FAIL — ${bad}/3`); process.exit(1); }
  console.log("verify-wireable-catalogs-are-counted SELFTEST OK — 3/3");
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const specSrc = readFileSync(SPEC, "utf8");
  const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
  const total = Object.values(inventory.tables ?? {}).filter((m) => WIREABLE.has(m?.classification)).length;
  if (total === 0) {
    console.error("verify-wireable-catalogs-are-counted FAIL — 0 wireable catalogs found; refusing to report green");
    process.exit(1);
  }
  const missing = uncounted(specSrc, inventory);
  if (missing.length) {
    console.error(`verify-wireable-catalogs-are-counted FAIL — ${missing.length} wireable catalog(s) are in no domain badge:`);
    for (const m of missing) console.error(`  ${m}`);
    console.error("\nAdd each to LISTS_MODULE_COUNT_SPECS with its real activeFilter and companyScoped flag,");
    console.error("or reclassify it in docs/inventories/catalog-inventory.json if it should not be reachable.");
    process.exit(1);
  }
  console.log(`verify-wireable-catalogs-are-counted OK — all ${total} wireable catalogs appear in the count spec`);
}

main();
