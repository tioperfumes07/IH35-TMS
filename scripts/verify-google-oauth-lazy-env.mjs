#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST_ROOT = fs.existsSync(path.join(ROOT, "apps/backend/dist")) ? path.join(ROOT, "apps/backend/dist") : path.join(ROOT, "dist");
const LUCIA_PATH = path.join(DIST_ROOT, "auth/lucia.js");
const ROUTES_PATH = path.join(DIST_ROOT, "auth/routes.js");

function fail(message) {
  console.error(`verify:google-oauth-lazy-env failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(LUCIA_PATH)) {
  fail(`missing file ${LUCIA_PATH}`);
}
if (!fs.existsSync(ROUTES_PATH)) {
  fail(`missing file ${ROUTES_PATH}`);
}

const luciaSource = fs.readFileSync(LUCIA_PATH, "utf8");
const routesSource = fs.readFileSync(ROUTES_PATH, "utf8");

if (luciaSource.includes("throw new Error(\"OAUTH_GOOGLE_CLIENT_ID is required\")")) {
  fail("lucia still throws for OAUTH_GOOGLE_CLIENT_ID at boot");
}
if (luciaSource.includes("throw new Error(\"OAUTH_GOOGLE_CLIENT_SECRET is required\")")) {
  fail("lucia still throws for OAUTH_GOOGLE_CLIENT_SECRET at boot");
}
if (luciaSource.includes("throw new Error(\"OAUTH_REDIRECT_URI is required\")")) {
  fail("lucia still throws for OAUTH_REDIRECT_URI at boot");
}
if (!luciaSource.includes("function getGoogleOAuthClient()")) {
  fail("lucia missing lazy getGoogleOAuthClient()");
}

if (!routesSource.includes("google_oauth_not_configured")) {
  fail("auth routes missing google_oauth_not_configured response");
}
if (!routesSource.includes("reply.code(503)")) {
  fail("auth routes missing 503 response for oauth guard");
}

console.log("verify:google-oauth-lazy-env: ok");
