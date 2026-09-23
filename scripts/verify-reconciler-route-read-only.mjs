#!/usr/bin/env node
// The reconciler exception queue (GET /api/v1/reconciler/exceptions) is detection only. "A GET must
// never write": the handler must (1) refuse any role outside RECONCILER_READER_ROLES before it opens a
// database scope, (2) set the transaction read-only before runReconciler runs any invariant, and
// (3) be registered exactly once in apps/backend/src/index.ts. Static source scan; --selftest plants
// each regression and requires a failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-reconciler-route-read-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/reconciler/reconciler.routes.ts";
const INDEX = "apps/backend/src/index.ts";

export function check(routeSrc, indexSrc) {
  const failures = [];
  if (routeSrc == null) return [`missing ${ROUTE}`];
  if (indexSrc == null) return [`missing ${INDEX}`];
  const code = routeSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const roleGate = code.search(/RECONCILER_READER_ROLES\.has\(/);
  const scope = code.search(/withCompanyScope\(/);
  const readOnly = code.search(/SET LOCAL transaction_read_only = on/);
  const run = code.search(/runReconciler\(/);
  if (roleGate < 0) failures.push(`${ROUTE}: no RECONCILER_READER_ROLES check`);
  if (scope < 0) failures.push(`${ROUTE}: no withCompanyScope (membership + company scope)`);
  if (roleGate >= 0 && scope >= 0 && roleGate > scope) failures.push(`${ROUTE}: the role check runs after the database scope opens`);
  if (readOnly < 0) failures.push(`${ROUTE}: the transaction is never set read-only`);
  if (run < 0) failures.push(`${ROUTE}: runReconciler is not called`);
  if (readOnly >= 0 && run >= 0 && readOnly > run) failures.push(`${ROUTE}: read-only is set after runReconciler starts`);
  if (/app\.(post|put|patch|delete)\(/.test(code)) failures.push(`${ROUTE}: a write route lives in the detection-only reconciler routes file`);
  const roles = /RECONCILER_READER_ROLES[^=]*=\s*new Set\(\[([^\]]*)\]\)/.exec(code)?.[1] ?? "";
  const listed = [...roles.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  if (listed.join(",") !== "Administrator,Owner") failures.push(`${ROUTE}: reader roles are [${listed.join(", ")}], expected [Administrator, Owner]`);

  const registrations = (indexSrc.match(/registerReconcilerRoutes\(app\)/g) ?? []).length;
  if (registrations !== 1) failures.push(`${INDEX}: registerReconcilerRoutes(app) appears ${registrations} times, expected 1`);
  return failures;
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

if (process.argv.includes("--selftest")) {
  const route = read(ROUTE);
  const index = read(INDEX);
  const clean = check(route, index);
  if (clean.length) {
    console.error(`${LABEL} --selftest FAIL: the real tree is not clean:\n  - ${clean.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["read-only line removed", route.replace(/\s*await client\.query\("SET LOCAL transaction_read_only = on"\);/, ""), index],
    ["role check removed", route.replace('if (!RECONCILER_READER_ROLES.has(String(user.role ?? ""))) {', "if (false) {"), index],
    ["Dispatcher added to readers", route.replace('new Set(["Owner", "Administrator"])', 'new Set(["Owner", "Administrator", "Dispatcher"])'), index],
    ["route registered twice", route, index.replace("registerReconcilerRoutes(app);", "registerReconcilerRoutes(app);\n  registerReconcilerRoutes(app);")],
  ];
  for (const [what, r, i] of plants) {
    if (r === route && i === index) {
      console.error(`${LABEL} --selftest FAIL: plant "${what}" did not apply`);
      process.exit(1);
    }
    if (check(r, i).length === 0) {
      console.error(`${LABEL} --selftest FAIL: plant "${what}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${plants.length} planted regressions each caught; real tree clean`);
  process.exit(0);
}

const failures = check(read(ROUTE), read(INDEX));
if (failures.length) {
  console.error(`${LABEL}: FAIL\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — role gate before scope, read-only before the first invariant, no write route, registered once.`);
