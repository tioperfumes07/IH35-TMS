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
/**
 * The OWNER's wiring map SUPERSEDES the inventory's classification — same precedence
 * verify-every-catalog-wired.mjs already applies. The inventory is a machine snapshot of what LOOKS
 * like a catalog; the map is the owner saying what IS one. Where they disagree the owner wins, per
 * CLAUDE.md: a doc never overrides an owner ruling.
 *
 * This mattered immediately. The inventory classifies driver_leave_balances, leave_policies and
 * equipment_line_item_templates ROUTED-PENDING, so this guard demanded they be counted in a Lists
 * badge. The map excludes all three by name — "balances not a catalog", "per-company settings (edit
 * form)", "template editor, not add-row list". Counting them inflates the badge with rows that are
 * not a list, which is the exact defect this whole line of work exists to remove.
 */
const WIRING_MAP = join(ROOT, "docs", "inventories", "catalog-wiring-map.csv");

/** Classifications that mean "an operator can reach and edit this". */
const WIREABLE = new Set(["ROUTED", "ROUTED-PENDING", "ROUTED-NEEDS-SEED", "ROUTED-READ-ONLY"]);
/** Owner statuses that mean "this is not an add-row list" — written reason in the map's note column. */
const OWNER_EXCLUDED = new Set(["EXCLUDE (system)", "TEMPLATE (special)"]);

/** table -> owner status, from the map's `table` and `status` columns (0 and 5). */
export function parseWiringMap(csv) {
  const out = new Map();
  for (const line of csv.split("\n").slice(1)) {
    if (!line.trim()) continue;
    // status may be quoted because it contains a comma ("WIRE (entity, FINANCIAL-hold)"), so split
    // on commas OUTSIDE quotes — a naive split shifts every later column and silently mis-reads.
    const cells = line.match(/("([^"]*)")|([^,]*)/g)?.filter((_, i) => i % 2 === 0) ?? [];
    const table = cells[0]?.trim().replace(/^"|"$/g, "");
    const status = cells[5]?.trim().replace(/^"|"$/g, "");
    if (table && status) out.set(table, status);
  }
  return out;
}

export function uncounted(specSrc, inventory, ownerStatus = new Map()) {
  const inSpec = new Set([...specSrc.matchAll(/table:\s*"(\w+)"/g)].map((m) => m[1]));
  const tables = inventory.tables ?? {};
  const out = [];
  for (const [name, meta] of Object.entries(tables)) {
    const owner = ownerStatus.get(name);
    if (owner && OWNER_EXCLUDED.has(owner)) continue; // owner wins over the inventory
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

  // The owner's map outranks the inventory. Without this arm the guard demanded that
  // driver_leave_balances ("balances not a catalog") be counted in a Lists badge.
  const ownerOut = uncounted(without, inv, new Map([["alpha", "EXCLUDE (system)"]]));
  if (ownerOut.includes("alpha")) { console.error("  selftest FAIL — an owner-EXCLUDED catalog was still demanded"); bad++; }
  else console.log("  selftest OK — the owner's wiring map overrides the inventory classification");
  const tmplOut = uncounted(without, inv, new Map([["alpha", "TEMPLATE (special)"]]));
  if (tmplOut.includes("alpha")) { console.error("  selftest FAIL — a TEMPLATE (special) catalog was still demanded"); bad++; }
  else console.log("  selftest OK — TEMPLATE (special) is excluded too");

  // A quoted status contains a comma; a naive split shifts every later column and mis-reads status.
  const parsed = parseWiringMap('table,rows,opco,has_code,has_name,status,lane\nfoo,1,Y,Y,Y,"WIRE (entity, FINANCIAL-hold)",money\nbar,0,Y,N,N,EXCLUDE (system),-\n');
  if (parsed.get("foo") !== "WIRE (entity, FINANCIAL-hold)") { console.error(`  selftest FAIL — quoted status mis-parsed: ${parsed.get("foo")}`); bad++; }
  else console.log("  selftest OK — a quoted, comma-bearing status parses to the right column");
  if (parsed.get("bar") !== "EXCLUDE (system)") { console.error("  selftest FAIL — plain status mis-parsed"); bad++; }
  else console.log("  selftest OK — a plain status parses");

  if (bad) { console.error(`SELFTEST FAIL — ${bad} case(s)`); process.exit(1); }
  console.log("verify-wireable-catalogs-are-counted SELFTEST OK — 7/7");
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const specSrc = readFileSync(SPEC, "utf8");
  const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
  const ownerStatus = parseWiringMap(readFileSync(WIRING_MAP, "utf8"));
  if (ownerStatus.size === 0) {
    console.error(`verify-wireable-catalogs-are-counted FAIL — read 0 rows from ${WIRING_MAP}; refusing to`);
    console.error("run without the owner's map, because every owner exclusion would silently reappear as a demand.");
    process.exit(1);
  }
  const total = Object.entries(inventory.tables ?? {}).filter(
    ([name, m]) => WIREABLE.has(m?.classification) && !OWNER_EXCLUDED.has(ownerStatus.get(name))
  ).length;
  if (total === 0) {
    console.error("verify-wireable-catalogs-are-counted FAIL — 0 wireable catalogs found; refusing to report green");
    process.exit(1);
  }
  const missing = uncounted(specSrc, inventory, ownerStatus);
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
