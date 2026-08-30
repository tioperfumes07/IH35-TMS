#!/usr/bin/env node
/**
 * §4 landmine guard: a unit's OPERATING entity is owner_company_id (TRK owns) OR
 * currently_leased_to_company_id (TRANSP/USMCA lease) — every mdata.units-scoped query in the
 * repo must use that OR pattern, never owner_company_id alone. The Maintenance
 * /api/v1/maintenance/fleet-table/kpis and /api/v1/maintenance/fleet-table/rows endpoints
 * (apps/backend/src/maintenance/dashboard.routes.ts) shipped scoped by owner_company_id ONLY,
 * so TRANSP/USMCA (which lease, not own, their fleet) saw undercounted/zero roster KPIs and
 * blank live-maintenance-status columns (odometer/next PM due/open WO count) for every leased-in
 * unit. Fixed 2026-07 (fix/module-fleet-defects). This guard fails if either query regresses to
 * the owner_company_id-only form.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  "apps/backend/src/maintenance/dashboard.routes.ts",
  "apps/backend/src/maintenance/dashboard-kpis.routes.ts",
];

function fail(message) {
  console.error(`verify:fleet-table-owner-leased-scope FAILED\n- ${message}`);
  process.exit(1);
}

function scopeFailures(sources) {
  const failures = [];
  for (const [file, src] of Object.entries(sources)) {
    // dashboard-kpis composes the unit predicate through this shared fragment. Auditing only
    // literal FROM...WHERE blocks misses regressions inside the interpolation entirely.
    if (file.endsWith("dashboard-kpis.routes.ts")) {
      const sharedScope = src.match(/const fleetUnitsWhereSql = `([\s\S]*?)`;/)?.[1] ?? "";
      const hasSharedOwner = /\bowner_company_id\s*=\s*\$1/.test(sharedScope);
      const hasSharedLeased = /\bcurrently_leased_to_company_id\s*=\s*\$1/.test(sharedScope);
      if (!hasSharedOwner || !hasSharedLeased) {
        failures.push(`${file}: fleetUnitsWhereSql must scope units by owner OR current lessee`);
      }
    }
    for (const m of src.matchAll(/FROM\s+mdata\.units\s*u?[\s\S]{0,400}?(?=\n\s*\)|\n\s*`,)/gi)) {
      const block = m[0];
      const hasOwner = /\bowner_company_id\s*=\s*\$1/.test(block);
      const hasLeased = /\bcurrently_leased_to_company_id\s*=\s*\$1/.test(block);
      if (hasOwner && !hasLeased) failures.push(`${file}: owner-only mdata.units scope: ${block.slice(0, 220)}`);
    }
  }
  return failures;
}

const sources = Object.fromEntries(TARGETS.map((file) => {
  const target = path.join(ROOT, file);
  if (!fs.existsSync(target)) fail(`missing ${file}`);
  return [file, fs.readFileSync(target, "utf8")];
}));

if (process.argv.includes("--selftest")) {
  const file = TARGETS[1];
  const mutated = sources[file].replace(
    "(owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)",
    "owner_company_id = $1::uuid"
  );
  if (mutated === sources[file] || scopeFailures({ ...sources, [file]: mutated }).length === 0) {
    fail("planted dashboard KPI owner-only mutation escaped");
  }
  console.log("verify:fleet-table-owner-leased-scope SELFTEST PASS — owner-only dashboard KPI mutation detected");
  process.exit(0);
}

const failures = scopeFailures(sources);
if (failures.length) fail(failures.join("\n- "));

console.log("verify:fleet-table-owner-leased-scope OK");
