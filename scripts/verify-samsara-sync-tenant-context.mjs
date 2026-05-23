#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const checks = [
  {
    file: "apps/backend/src/integrations/samsara/samsara-master-sync.routes.ts",
    required: [
      "withCompanyScope",
      "syncSamsaraDriversMaster",
      "syncSamsaraVehiclesMaster",
    ],
    reason: "route-triggered master sync must execute inside company scope helper",
  },
  {
    file: "apps/backend/src/cron/samsara-master-sync.cron.ts",
    required: [
      "SELECT set_config('app.operating_company_id', $1, true)",
      "syncSamsaraDriversMaster(client, operatingCompanyId)",
      "syncSamsaraVehiclesMaster(client, operatingCompanyId)",
    ],
    reason: "cron-triggered master sync must set tenant context before writes",
  },
  {
    file: "scripts/seed-samsara-transp.mjs",
    required: [
      "SELECT set_config('app.operating_company_id', $1, true)",
      'upsertProjectionRows(client, "integrations.samsara_drivers"',
      'upsertProjectionRows(client, "integrations.samsara_vehicles"',
    ],
    reason: "one-shot seed+sync script must set tenant context before mirror inserts",
  },
];

function fail(message) {
  console.error(`verify:samsara-sync-tenant-context FAILED\n- ${message}`);
  process.exit(1);
}

for (const check of checks) {
  const abs = path.join(ROOT, check.file);
  if (!fs.existsSync(abs)) {
    fail(`missing required file: ${check.file}`);
  }
  const text = fs.readFileSync(abs, "utf8");
  for (const requiredFragment of check.required) {
    if (!text.includes(requiredFragment)) {
      fail(`${check.file} missing "${requiredFragment}" (${check.reason})`);
    }
  }
}

console.log("verify:samsara-sync-tenant-context OK");
