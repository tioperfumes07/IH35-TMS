#!/usr/bin/env node
/**
 * verify-fleet-catalog-display-name-key.mjs
 *
 * ROOT CAUSE (live-pinned 2026-08-22, CC3-FLEETNAME-01): apps/backend/src/catalogs/fleet/factory.ts
 * (createCatalogRoutes, used by every catalog registered in fleet/index.ts EXCEPT tire_positions)
 * hardcodes `t.name AS display_name` on every SELECT and requires `display_name` (never `name`) in
 * its create/update Zod schemas -- the physical column is `name`, but the API surface is always
 * `display_name`, with no per-catalog override. 8 of the 9 fleet-factory catalogs registered in
 * apps/frontend/src/hooks/useCatalogQuery.ts's GENERIC_CATALOG_REGISTRY instead used `key: "name"`
 * for their columns/fields (fleet.equipment_types was the sole correct one, using "display_name").
 *
 * Impact, confirmed live via a real Create attempt + window.fetch capture on fleet.asset_locations
 * (Lists > Fleet > Asset Locations): the create form sent `{"name": "...", ...}`, the backend
 * rejected it with a real 400 (`validation_error`, `display_name: Invalid input: expected string,
 * received undefined`) surfaced to the user only as the raw Zod message "Invalid input: expected
 * string, received undefined" -- + Create was completely dead for all 8 catalogs, not a cosmetic
 * miss. The list page's primary name column was also blank/dash for every pre-existing row on
 * these catalogs (row.name is undefined; a raw GET showed the real names sitting correctly under
 * row.display_name, e.g. asset_locations' 3 seed rows: "Main yard", "Shop bay A", "Third-party
 * shop", none of which rendered in the UI table before this fix).
 *
 * INVARIANT (static -- no database): every GENERIC_CATALOG_REGISTRY entry in useCatalogQuery.ts
 * whose catalogName is one of the 8 fleet-factory catalogs below must use `key: "display_name"`,
 * never `key: "name"`, in both its `columns` and `fields` arrays.
 *
 * Self-test: node scripts/verify-fleet-catalog-display-name-key.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-catalog-display-name-key";
const TARGET_FILE = "apps/frontend/src/hooks/useCatalogQuery.ts";

// The exact set registered via apps/backend/src/catalogs/fleet/factory.ts's createCatalogRoutes in
// fleet/index.ts. tire_positions is intentionally excluded -- it is GLOBAL-BY-DESIGN and lives in
// its own tire-positions.routes.ts, a different factory not covered by this invariant.
export const FLEET_FACTORY_CATALOG_NAMES = [
  "fleet.tractor_statuses",
  "fleet.trailer_statuses",
  "fleet.asset_condition_codes",
  "fleet.equipment_types",
  "fleet.unit_ownership_types",
  "fleet.trailer_types",
  "fleet.lease_terms",
  "fleet.asset_statuses",
  "fleet.asset_locations",
];

/** Extracts one registry entry's source block (from its `"catalogName.key": {` line to the matching close brace). */
export function extractRegistryEntry(text, catalogName) {
  const masked = maskComments(text);
  const startRe = new RegExp(`"${catalogName.replace(/\./g, "\\.")}"\\s*:\\s*\\{`);
  const match = startRe.exec(masked);
  if (!match) return null;
  const openBraceIdx = match.index + match[0].length - 1;
  let depth = 1;
  let i = openBraceIdx + 1;
  while (i < masked.length && depth > 0) {
    if (masked[i] === "{") depth += 1;
    else if (masked[i] === "}") depth -= 1;
    i += 1;
  }
  return text.slice(match.index, i);
}

/** Returns violations for one registry entry's source block. */
export function findWrongKeyUsage(entryText) {
  const masked = maskComments(entryText);
  const violations = [];
  if (/key\s*:\s*"name"/.test(masked)) {
    violations.push('uses key: "name" -- must be key: "display_name" (fleet/factory.ts always aliases the physical `name` column to API key `display_name`, never `name`)');
  }
  return violations;
}

function staticCheck() {
  const abs = path.join(ROOT, TARGET_FILE);
  if (!fs.existsSync(abs)) return [`${TARGET_FILE} not found`];
  const src = fs.readFileSync(abs, "utf8");
  const failures = [];
  for (const catalogName of FLEET_FACTORY_CATALOG_NAMES) {
    const entry = extractRegistryEntry(src, catalogName);
    if (!entry) {
      failures.push(`${catalogName}: registry entry not found in ${TARGET_FILE}`);
      continue;
    }
    for (const v of findWrongKeyUsage(entry)) {
      failures.push(`${catalogName}: ${v}`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const bad = `
    "fleet.asset_locations": {
      catalogName: "fleet.asset_locations",
      columns: [
        { key: "code", label: "Code" },
        { key: "name", label: "Asset Location" },
      ],
      fields: [
        { key: "code", label: "Code" },
        { key: "name", label: "Asset Location" },
      ],
    },
  `;
  const badEntry = extractRegistryEntry(bad, "fleet.asset_locations");
  if (!badEntry || findWrongKeyUsage(badEntry).length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL -- key: "name" was not caught`);
    process.exit(1);
  }

  const good = `
    "fleet.asset_locations": {
      catalogName: "fleet.asset_locations",
      columns: [
        { key: "code", label: "Code" },
        { key: "display_name", label: "Asset Location" },
      ],
      fields: [
        { key: "code", label: "Code" },
        { key: "display_name", label: "Asset Location" },
      ],
    },
  `;
  const goodEntry = extractRegistryEntry(good, "fleet.asset_locations");
  if (!goodEntry || findWrongKeyUsage(goodEntry).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- correct key: "display_name" was wrongly flagged`);
    process.exit(1);
  }

  // fleet.equipment_types (correct in the real file all along) must not be flagged.
  const equipmentTypesShape = `
    "fleet.equipment_types": {
      catalogName: "fleet.equipment_types",
      columns: [
        { key: "code", label: "Code" },
        { key: "display_name", label: "Display Name" },
      ],
      fields: [
        { key: "code", label: "Code" },
        { key: "display_name", label: "Display Name" },
      ],
    },
  `;
  const eqEntry = extractRegistryEntry(equipmentTypesShape, "fleet.equipment_types");
  if (!eqEntry || findWrongKeyUsage(eqEntry).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- fleet.equipment_types' pre-existing correct shape was wrongly flagged`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const failures = staticCheck();
if (failures.length > 0) {
  console.error(`${LABEL} FAILED -- ${failures.length} fleet catalog(s) with wrong display-name key:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK -- all ${FLEET_FACTORY_CATALOG_NAMES.length} fleet-factory catalogs use key: "display_name"`);
