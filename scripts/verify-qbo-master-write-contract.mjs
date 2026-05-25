import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps", "backend", "src", "mdata", "qbo-master-write.routes.ts");
const content = fs.readFileSync(targetFile, "utf8");

const requiredRoutePatterns = [
  /app\.post\("\/api\/v1\/mdata\/qbo\/vendors"/,
  /app\.put\("\/api\/v1\/mdata\/qbo\/vendors\/:id"/,
  /app\.post\("\/api\/v1\/mdata\/qbo\/customers"/,
  /app\.put\("\/api\/v1\/mdata\/qbo\/customers\/:id"/,
  /app\.post\("\/api\/v1\/mdata\/qbo\/items"/,
  /app\.put\("\/api\/v1\/mdata\/qbo\/items\/:id"/,
  /app\.post\("\/api\/v1\/mdata\/qbo\/accounts"/,
  /app\.put\("\/api\/v1\/mdata\/qbo\/accounts\/:id"/,
];

const requiredEnqueuePatterns = [
  /entity:\s*"vendor"[\s\S]*operation:\s*"create"/,
  /entity:\s*"vendor"[\s\S]*operation:\s*"update"/,
  /entity:\s*"customer"[\s\S]*operation:\s*"create"/,
  /entity:\s*"customer"[\s\S]*operation:\s*"update"/,
  /entity:\s*"item"[\s\S]*operation:\s*"create"/,
  /entity:\s*"item"[\s\S]*operation:\s*"update"/,
  /entity:\s*"account"[\s\S]*operation:\s*"create"/,
  /entity:\s*"account"[\s\S]*operation:\s*"update"/,
];

const missing = [];

for (const pattern of requiredRoutePatterns) {
  if (!pattern.test(content)) {
    missing.push(`missing route ${pattern}`);
  }
}

for (const pattern of requiredEnqueuePatterns) {
  if (!pattern.test(content)) {
    missing.push(`missing queue contract ${pattern}`);
  }
}

if (!/enqueueQboMasterEntityPush/.test(content)) {
  missing.push("enqueueQboMasterEntityPush import or usage not found");
}

if (missing.length > 0) {
  console.error("verify-qbo-master-write-contract failed:");
  for (const entry of missing) {
    console.error(` - ${entry}`);
  }
  process.exit(1);
}

console.log("verify-qbo-master-write-contract passed");
