#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = fs.readFileSync(path.join(root, "apps/backend/src/mdata/vendors.routes.ts"), "utf8");
const api = fs.readFileSync(path.join(root, "apps/frontend/src/api/mdata.ts"), "utf8");
if (!routes.includes("/api/v1/mdata/vendors/ensure-drivers")) {
  console.error("FAIL: ensure-drivers route missing");
  process.exit(1);
}
if (!routes.includes("INSERT INTO mdata.vendors")) {
  console.error("FAIL: ensure-drivers must INSERT vendors");
  process.exit(1);
}
if (!api.includes("ensureDriverVendors") && !api.includes("ensure-drivers")) {
  console.error("FAIL: FE client for ensure-drivers missing");
  process.exit(1);
}
console.log("PASS: verify-acct-ensure-driver-vendors");
