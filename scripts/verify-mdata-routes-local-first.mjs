import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const routeDir = path.join(repoRoot, "apps", "backend", "src", "mdata");
const routeFiles = [
  "vendors.routes.ts",
  "customers.routes.ts",
  "accounts.routes.ts",
  "items.routes.ts",
  "drivers.routes.ts",
  "units.routes.ts",
  "equipment.routes.ts",
];

const disallowedRemoteReadPatterns = [/\bqbo_archive\./i, /\bintegrations\.samsara_(drivers|vehicles)\b/i];
const requiredLocalPattern = /\bfrom\s+mdata\./i;

const violations = [];

for (const fileName of routeFiles) {
  const filePath = path.join(routeDir, fileName);
  if (!fs.existsSync(filePath)) {
    violations.push(`${fileName}:missing_route_file`);
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (!requiredLocalPattern.test(content)) {
    violations.push(`${fileName}:missing_local_mdata_read`);
  }
  for (const pattern of disallowedRemoteReadPatterns) {
    if (pattern.test(content)) {
      violations.push(`${fileName}:disallowed_remote_read:${pattern}`);
    }
  }
}

if (violations.length > 0) {
  console.error("verify-mdata-routes-local-first failed:");
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log("verify-mdata-routes-local-first passed");
