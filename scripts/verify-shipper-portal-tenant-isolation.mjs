#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = fs.readFileSync(path.join(ROOT, "apps/backend/src/shipper-portal/portal-api.routes.ts"), "utf8");

const required = ["customer_id = $", "portalUser.customer_id", "WHERE l.customer_id"];
for (const needle of required) {
  if (!api.includes(needle)) {
    console.error(`verify:shipper-portal-tenant-isolation FAIL: missing ${needle}`);
    process.exit(1);
  }
}

if (!api.includes("requirePortalSession")) {
  console.error("verify:shipper-portal-tenant-isolation FAIL: portal API must use requirePortalSession");
  process.exit(1);
}

console.log("verify:shipper-portal-tenant-isolation PASS");
