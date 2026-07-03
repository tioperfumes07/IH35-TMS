#!/usr/bin/env node
/**
 * verify:qbo-sync-routes-auth — route-auth contract for the /api/v1/qbo-sync/* backend family.
 *
 * Every registered qbo-sync route handler must pass through the canonical auth middleware
 * (requireAuth, directly or via a currentAuthUser() helper that calls it) before doing work.
 * This is defense-in-depth for the VENDOR-401 defect class: it fails the build if any future
 * qbo-sync route is registered without an auth guard.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "apps", "backend", "src", "qbo-sync");

function fail(messages) {
  console.error("verify:qbo-sync-routes-auth — FAILED");
  for (const m of messages) console.error(`- ${m}`);
  process.exit(1);
}

const routeFiles = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".routes.ts"))
  .map((f) => path.join(DIR, f));

if (routeFiles.length === 0) {
  fail(["no *.routes.ts files found under apps/backend/src/qbo-sync — guard target moved"]);
}

const problems = [];
let handlerCount = 0;

for (const file of routeFiles) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");

  if (!/from "\.\.\/auth\/session-middleware\.js"/.test(text) || !/\brequireAuth\b/.test(text)) {
    problems.push(`${rel}: must import requireAuth from ../auth/session-middleware.js`);
    continue;
  }

  // Locate each route registration and confirm its handler body invokes an auth guard.
  const routeRe = /app\.(get|post|put|patch|delete)\(\s*(["'`])(\/api\/v1\/qbo-sync\/[^"'`]+)\2\s*,\s*async\s*\([^)]*\)\s*=>\s*\{/g;
  let m;
  while ((m = routeRe.exec(text)) !== null) {
    handlerCount += 1;
    const routePath = m[3];
    // Extract the handler body by brace-matching from the opening `{`.
    let depth = 1;
    let i = routeRe.lastIndex;
    for (; i < text.length && depth > 0; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") depth -= 1;
    }
    const body = text.slice(routeRe.lastIndex, i);
    if (!/requireAuth\s*\(|currentAuthUser\s*\(/.test(body)) {
      problems.push(`${rel}: route ${routePath} has no requireAuth/currentAuthUser guard in its handler`);
    }
  }
}

if (handlerCount === 0) {
  fail(["no /api/v1/qbo-sync/* route registrations matched — guard pattern is stale"]);
}
if (problems.length > 0) fail(problems);

console.log(`verify:qbo-sync-routes-auth — OK (${handlerCount} qbo-sync route handlers, all auth-guarded)`);
