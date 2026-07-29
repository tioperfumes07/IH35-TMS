#!/usr/bin/env node
/**
 * Can an operator actually OPEN this catalog?
 *
 * Why this exists: on 2026-07-29 two separate wrong answers were produced about exactly this
 * question, in one session, because "is this catalog reachable" was being answered by grepping one
 * or two files and the repo surfaces catalogs through THREE:
 *
 *   1. DOMAIN_CONFIG in AllCatalogsMap.tsx      -- the Lists hub map + per-domain hub
 *   2. GENERIC_CATALOG_REGISTRY in useCatalogQuery.ts -- the generic CRUD page (CATALOG-2)
 *   3. a catalog config in generic-catalog.routes.ts  -- the backend route
 *
 * The first wrong answer removed five catalogs from the count spec as "unreachable" when they were
 * ROUTED-PENDING catalogs the owner had already ruled must get creator wizards (2026-07-28). The
 * second, checking only surfaces 2+3, reported 69 catalogs unreachable INCLUDING `accounts` -- 1408
 * rows behind the live Chart of Accounts page. The trap in both: DOMAIN_CONFIG is keyed by KEBAB-CASE
 * `catalogKey` ("dispatch-flag-colors"), not by the snake_case table name, so a snake_case grep finds
 * nothing and reads as proof of absence. It is proof of nothing.
 *
 * The real answer is 4 catalogs, 69 rows. This guard pins that number so it can only shrink.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const INVENTORY = "docs/inventories/catalog-inventory.json";
const MAP = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const REGISTRY = "apps/frontend/src/hooks/useCatalogQuery.ts";
const ROUTES = "apps/backend/src/catalogs/generic-catalog.routes.ts";

// A catalog the inventory says is meant to be operator-facing.
const WIREABLE = new Set(["ROUTED", "ROUTED-PENDING", "ROUTED-NEEDS-SEED", "ROUTED-READ-ONLY"]);

/**
 * The catalogs that are counted in a Lists badge but that NO surface exposes. Every one is
 * ROUTED-PENDING: the owner ruled 2026-07-28 that every catalog gets a QuickBooks-style creator
 * wizard, and these are the ones whose route/creator is not built yet. This list is a RATCHET --
 * it may shrink as they are wired, never grow. A new name here means a catalog was added to the
 * inventory with no way to open it.
 */
const KNOWN_UNREACHABLE = new Set([
  "dispatch_flag_colors",
  "driver_leave_balances",
  "equipment_line_item_templates",
  "leave_policies",
]);

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`verify:catalog-reachability FAIL: missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

/** kebab-case is how DOMAIN_CONFIG names a catalog; snake_case is how the DB does. */
export const toCatalogKey = (table) => table.replace(/_/g, "-");

export function unreachable({ inventory, mapSrc, registrySrc, routesSrc }) {
  const hubKeys = new Set([...mapSrc.matchAll(/catalogKey:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
  const registryTables = new Set([...registrySrc.matchAll(/"[a-z_]+\.([a-z_]+)":/g)].map((m) => m[1]));
  const routedTables = new Set([...routesSrc.matchAll(/tableName:\s*"([a-z_]+)"/g)].map((m) => m[1]));

  const out = [];
  for (const [table, meta] of Object.entries(inventory.tables ?? {})) {
    if (!WIREABLE.has(meta?.classification)) continue;
    const reachable =
      hubKeys.has(toCatalogKey(table)) || registryTables.has(table) || routedTables.has(table);
    if (!reachable) out.push(table);
  }
  return out.sort();
}

if (process.argv.includes("--selftest")) {
  const inventory = {
    tables: {
      // reachable ONLY via the kebab-case hub key -- the case both wrong answers missed
      dispatch_flag_colors: { classification: "ROUTED-PENDING" },
      // reachable only via the generic registry
      accounts: { classification: "ROUTED" },
      // reachable only via a backend route
      fuel_stations: { classification: "ROUTED" },
      // reachable nowhere
      ghost_catalog: { classification: "ROUTED-PENDING" },
      // not operator-facing at all -- must never be demanded
      internal_thing: { classification: "HEADLESS-BY-DESIGN" },
    },
  };
  const fixture = {
    inventory,
    mapSrc: 'catalogKey: "dispatch-flag-colors"',
    registrySrc: '"accounting.accounts": {',
    routesSrc: 'tableName: "fuel_stations"',
  };
  const got = unreachable(fixture);
  const problems = [];
  if (JSON.stringify(got) !== JSON.stringify(["ghost_catalog"])) {
    problems.push(`expected only ghost_catalog unreachable, got ${JSON.stringify(got)}`);
  }
  // The regression that matters: a kebab-keyed hub catalog must NOT read as unreachable.
  if (got.includes("dispatch_flag_colors")) {
    problems.push("a catalog exposed only by its kebab-case DOMAIN_CONFIG key was called unreachable");
  }
  if (got.includes("internal_thing")) problems.push("a HEADLESS-BY-DESIGN catalog was demanded");
  // And a snake_case-only search must be provably insufficient, or this guard adds nothing.
  const snakeOnly = unreachable({ ...fixture, mapSrc: "" });
  if (!snakeOnly.includes("dispatch_flag_colors")) {
    problems.push("fixture does not reproduce the snake-case blind spot this guard exists for");
  }
  if (problems.length) {
    console.error("verify-catalog-reachability SELFTEST FAILED:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("verify-catalog-reachability SELFTEST OK — 4/4 (hub-key, registry, route, headless)");
  process.exit(0);
}

const inventory = JSON.parse(read(INVENTORY));
const found = unreachable({
  inventory,
  mapSrc: read(MAP),
  registrySrc: read(REGISTRY),
  routesSrc: read(ROUTES),
});

const total = Object.values(inventory.tables ?? {}).filter((m) => WIREABLE.has(m?.classification)).length;
if (total === 0) {
  console.error("verify:catalog-reachability FAIL: 0 wireable catalogs found — refusing to report green");
  process.exit(1);
}

const added = found.filter((t) => !KNOWN_UNREACHABLE.has(t));
const fixed = [...KNOWN_UNREACHABLE].filter((t) => !found.includes(t)).sort();

if (added.length > 0) {
  console.error(
    `verify:catalog-reachability FAIL — ${added.length} catalog(s) can be reached from NO surface:`
  );
  for (const t of added) console.error(`  ${t}`);
  console.error(
    "\nA catalog in the inventory must be openable: add it to DOMAIN_CONFIG (AllCatalogsMap.tsx,\n" +
      "kebab-case catalogKey), to GENERIC_CATALOG_REGISTRY (useCatalogQuery.ts), or give it a\n" +
      "catalog config in generic-catalog.routes.ts. If it is not operator-facing, reclassify it\n" +
      `HEADLESS-BY-DESIGN in ${INVENTORY}.`
  );
  process.exit(1);
}

if (fixed.length > 0) {
  console.error(
    `verify:catalog-reachability FAIL — ${fixed.length} catalog(s) are now reachable but still listed\n` +
      `as known-unreachable. Remove them from KNOWN_UNREACHABLE in this file so the ratchet tightens:`
  );
  for (const t of fixed) console.error(`  ${t}`);
  process.exit(1);
}

console.log(
  `verify:catalog-reachability PASS — ${total - found.length}/${total} wireable catalogs are reachable; ` +
    `${found.length} known-unreachable (ROUTED-PENDING, awaiting creator wizards per the 2026-07-28 ruling)`
);
