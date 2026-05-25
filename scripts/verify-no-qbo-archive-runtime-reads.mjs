import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const disallowedPattern = /\bqbo_archive\./g;
const targets = [
  "apps/backend/src/mdata/vendors.routes.ts",
  "apps/backend/src/mdata/customers.routes.ts",
  "apps/backend/src/mdata/drivers.routes.ts",
  "apps/backend/src/mdata/units.routes.ts",
  "apps/backend/src/mdata/equipment.routes.ts",
  "apps/backend/src/mdata/qbo-master-write.routes.ts",
  "apps/backend/src/qbo/master-data-sync.service.ts",
  "apps/backend/src/qbo/master-data-sync.routes.ts",
];

const KNOWN_OFFENDERS_DEBT = new Set([]);

const offenders = [];
for (const relativePath of targets) {
  if (KNOWN_OFFENDERS_DEBT.has(relativePath)) continue;
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  if (!disallowedPattern.test(content)) continue;
  offenders.push(relativePath);
}

if (offenders.length > 0) {
  console.error("verify-no-qbo-archive-runtime-reads failed:");
  for (const offender of offenders) {
    console.error(` - ${offender}`);
  }
  process.exit(1);
}

console.log("verify-no-qbo-archive-runtime-reads passed");
