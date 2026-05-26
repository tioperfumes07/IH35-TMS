#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const checks = [
  "apps/backend/src/maintenance/vehicles.routes.ts",
  "apps/backend/src/maintenance/drivers.routes.ts",
  "apps/backend/src/maintenance/parts.routes.ts",
  "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx",
  "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx",
  "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx",
];

const missing = checks.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
if (missing.length > 0) {
  console.error("verify:list-detail-source-parity FAIL");
  for (const file of missing) console.error(`- missing:${file}`);
  process.exit(1);
}

console.log("verify:list-detail-source-parity OK");
