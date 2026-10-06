#!/usr/bin/env node
import fs from "node:fs";

const service = fs.readFileSync("apps/backend/src/safety/fuel-gps-match.service.ts", "utf8");
const routes = fs.readFileSync("apps/backend/src/safety/fuel-gps-match.routes.ts", "utf8");
// ROUND 306 E-22 (#23628): the bank-line matcher no longer reads GPS at all (it "matched" by clock coincidence); GPS is
// read only by fuel/fuel-gps-verdict.service.ts, scoped to THIS company's fleet (owned or leased units) — so the vehicle
// tenant-scope requirement follows the read there, and the old unscoped clock-coincidence read may not come back.
const verdict = fs.readFileSync("apps/backend/src/fuel/fuel-gps-verdict.service.ts", "utf8");
const required = [
  "WHERE bt.operating_company_id = $1::uuid",
  "ON CONFLICT (operating_company_id, fuel_txn_id)",
  "set_config('app.operating_company_id'",
];
const missing = required.filter((snippet) => !service.includes(snippet) && !routes.includes(snippet));
if (/telematics\.vehicle_locations/.test(service) && !service.includes("WHERE v.operating_company_id = $1::uuid")) {
  missing.push("fuel-gps-match.service reads telematics.vehicle_locations without WHERE v.operating_company_id = $1::uuid");
}
const fleetScoped =
  /FROM mdata\.units WHERE owner_company_id = \$1::uuid OR currently_leased_to_company_id = \$1::uuid/.test(verdict) &&
  /FROM telematics\.vehicle_locations v[\s\S]{0,200}WHERE v\.unit_id = ANY\(\$1::uuid\[\]\)/.test(verdict) &&
  /\[fleetIds,/.test(verdict) &&
  /WHERE r\.operating_company_id = \$1::uuid/.test(verdict);
if (!fleetScoped) missing.push("fuel-gps-verdict.service must read GPS only for this company's fleet (fleetIds from owned/leased units) and Relay fills of this company");
if (missing.length > 0) {
  console.error("verify-fuel-match-tenant-scope failed");
  for (const snippet of missing) console.error(`  missing: ${snippet}`);
  process.exit(1);
}
console.log("verify-fuel-match-tenant-scope: ok");
