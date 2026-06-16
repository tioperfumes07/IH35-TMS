#!/usr/bin/env node
/**
 * verify-driver-entity-default
 *
 * Business rule (GUARD-measured): a driver must NEVER be entity-less. TRANSP is the only driver-bearing
 * entity; a driver created on the TRANSP page is auto-stamped operating_company_id = TRANSP, no manual
 * pick, never null. This guard fails if either protection regresses:
 *   1) the create handler stops defaulting operating_company_id to TRANSP when none is supplied, or
 *   2) the mdata.drivers.operating_company_id NOT NULL backstop migration goes missing.
 */
import { readFileSync, readdirSync } from "node:fs";

const failures = [];

// 1) backend create handler defaults operating_company_id to TRANSP by stable code.
const routes = readFileSync("apps/backend/src/mdata/drivers.routes.ts", "utf8");
if (!/resolvedOperatingCompanyId\b/.test(routes) || !/code = 'TRANSP'/.test(routes)) {
  failures.push(
    "apps/backend/src/mdata/drivers.routes.ts: create handler must default operating_company_id to TRANSP (by code) so a driver is never entity-less."
  );
}

// 2) a migration enforces NOT NULL on mdata.drivers.operating_company_id.
const migrations = readdirSync("db/migrations").filter((f) => f.endsWith(".sql"));
const hasNotNull = migrations.some((f) => {
  const sql = readFileSync(`db/migrations/${f}`, "utf8");
  return /mdata\.drivers\s+ALTER COLUMN operating_company_id SET NOT NULL/i.test(sql);
});
if (!hasNotNull) {
  failures.push("db/migrations: no migration sets mdata.drivers.operating_company_id NOT NULL (the entity-less backstop).");
}

if (failures.length > 0) {
  console.error("\n✗ verify-driver-entity-default: driver entity-default protection regressed.\n");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("✓ verify-driver-entity-default: create defaults to TRANSP + NOT NULL backstop present.");
