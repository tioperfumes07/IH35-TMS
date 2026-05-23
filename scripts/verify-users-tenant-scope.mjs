#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const USERS_ROUTES = "apps/backend/src/identity/users.routes.ts";
const USER_PREFS_ROUTES = "apps/backend/src/identity/user-preferences.routes.ts";
const IDENTITY_ROUTES = "apps/backend/src/identity/routes.ts";

function fail(message) {
  console.error(`verify:users-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing required route file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const usersRoutes = read(USERS_ROUTES);
if (!usersRoutes.includes("operating_company_id")) {
  fail(`${USERS_ROUTES} must reference operating_company_id`);
}
if (!usersRoutes.includes("/api/v1/identity/users")) {
  fail(`${USERS_ROUTES} must include users list/detail handlers`);
}

const userPrefsRoutes = read(USER_PREFS_ROUTES);
if (!userPrefsRoutes.includes("operating_company_id")) {
  fail(`${USER_PREFS_ROUTES} must reference operating_company_id`);
}

const identityRoutes = read(IDENTITY_ROUTES);
if (identityRoutes.includes("/api/v1/identity/users") && !identityRoutes.includes("operating_company_id")) {
  fail(`${IDENTITY_ROUTES} contains users handlers and must reference operating_company_id`);
}

console.log("verify:users-tenant-scope — OK");
