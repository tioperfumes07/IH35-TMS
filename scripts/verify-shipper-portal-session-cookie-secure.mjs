#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "apps/backend/src/shipper-portal/portal-session.middleware.ts"), "utf8");
const auth = fs.readFileSync(path.join(ROOT, "apps/backend/src/shipper-portal/portal-auth.routes.ts"), "utf8");

if (!src.includes("httpOnly: true") || !auth.includes("portalSessionCookieOptions")) {
  console.error("verify:shipper-portal-session-cookie-secure FAIL: portal cookie must set httpOnly via portalSessionCookieOptions");
  process.exit(1);
}

if (!src.includes("sameSite") || !src.includes("secure")) {
  console.error("verify:shipper-portal-session-cookie-secure FAIL: portal cookie must set secure + sameSite");
  process.exit(1);
}

if (!auth.includes('PORTAL_SESSION_COOKIE')) {
  console.error("verify:shipper-portal-session-cookie-secure FAIL: portal_session cookie name missing");
  process.exit(1);
}

console.log("verify:shipper-portal-session-cookie-secure PASS");
