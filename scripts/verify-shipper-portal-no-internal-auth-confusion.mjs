#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const session = fs.readFileSync(path.join(ROOT, "apps/backend/src/shipper-portal/portal-session.middleware.ts"), "utf8");
const api = fs.readFileSync(path.join(ROOT, "apps/backend/src/shipper-portal/portal-api.routes.ts"), "utf8");
const auth = fs.readFileSync(path.join(ROOT, "apps/backend/src/shipper-portal/portal-auth.routes.ts"), "utf8");

if (!session.includes("internal_session_not_valid_for_portal")) {
  console.error("verify:shipper-portal-no-internal-auth-confusion FAIL: internal session rejection missing");
  process.exit(1);
}

if (!api.includes("rejectInternalSessionOnPortalRoute")) {
  console.error("verify:shipper-portal-no-internal-auth-confusion FAIL: portal API must reject internal-only sessions");
  process.exit(1);
}

if (!auth.includes("/api/v1/portal/auth/login") || !api.includes("requirePortalSession")) {
  console.error("verify:shipper-portal-no-internal-auth-confusion FAIL: separate portal auth/session path missing");
  process.exit(1);
}

console.log("verify:shipper-portal-no-internal-auth-confusion PASS");
