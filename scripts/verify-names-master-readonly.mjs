#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesFile = path.join(ROOT, "apps/backend/src/lists/names-master.routes.ts");

function fail(message) {
  console.error(`verify:names-master-readonly FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(routesFile)) fail("missing names-master.routes.ts");
const src = fs.readFileSync(routesFile, "utf8");
const writeMethods = ["app.post", "app.patch", "app.put", "app.delete"];
for (const method of writeMethods) {
  if (src.includes(method) && src.includes("/api/v1/lists/names")) {
    fail(`${method} found for /api/v1/lists/names`);
  }
}
console.log("verify:names-master-readonly PASS");
