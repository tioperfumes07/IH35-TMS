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
const TARGET = path.join(ROOT, "apps/backend/src/maintenance/dashboard.routes.ts");

function fail(message) {
  console.error(`verify:fleet-table-owner-leased-scope FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail(`missing ${path.relative(ROOT, TARGET)}`);
}

const src = fs.readFileSync(TARGET, "utf8");

// Bad pattern: a bare `owner_company_id = $N` filter on mdata.units with no
// `currently_leased_to_company_id` OR-clause anywhere nearby (within ~200 chars).
const OWNER_ONLY_SCOPE =
  /FROM\s+mdata\.units\s+u?[\s\S]{0,120}?\b(?:owner_company_id|u\.owner_company_id)\s*=\s*\$1(?:::uuid)?\s*\n(?:[\s\S]{0,40}?AND\s+(?:u\.)?deactivated_at\s+IS\s+NULL)?/i;

for (const m of src.matchAll(/FROM\s+mdata\.units\s*u?[\s\S]{0,400}?(?=\n\s*\)|\n\s*`,)/gi)) {
  const block = m[0];
  const hasOwner = /\bowner_company_id\s*=\s*\$1/.test(block);
  const hasLeased = /\bcurrently_leased_to_company_id\s*=\s*\$1/.test(block);
  if (hasOwner && !hasLeased) {
    fail(
      `a FROM mdata.units query scopes by owner_company_id = $1 without also allowing currently_leased_to_company_id = $1 (OR) — TRANSP/USMCA lease units would be dropped. Block:\n${block.slice(0, 300)}`
    );
  }
}

console.log("verify:fleet-table-owner-leased-scope OK");
