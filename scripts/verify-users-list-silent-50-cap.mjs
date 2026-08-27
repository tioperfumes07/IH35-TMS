#!/usr/bin/env node
// USERS-LIST-SILENT-50-CAP — guard
//
// GET /api/v1/identity/users defaulted to limit=50 (max 200) and returned only `{ users }` — no
// total. Users.tsx (frontend) fetched with no limit at all, treated the returned page as the
// complete roster, and computed every KPI/tab count from it: once an operating company had more
// than 50 identity users (this table includes Driver-role accounts, not just office staff), the
// Users page silently undercounted every total with zero indication of truncation and no
// pagination affordance to reach the rest.
//
// Fixed: backend now returns total_count (a COUNT(*) over the identical WHERE clause); frontend
// requests the backend's own max page size (200) and disclose any remaining truncation via the
// existing CappedListNotice component (the established, purpose-built fix for exactly this class
// — see its own doc comment, which names legal.matters and the drivers export as prior instances).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const BACKEND_ROUTE_FILE = "apps/backend/src/identity/users.routes.ts";
const API_CLIENT_FILE = "apps/frontend/src/api/identity.ts";
const USERS_PAGE_FILE = "apps/frontend/src/pages/Users.tsx";

export function check(files) {
  const failures = [];

  if (!/count\(\*\)::text AS total FROM identity\.users u \$\{whereClause\}/.test(files[BACKEND_ROUTE_FILE])) {
    failures.push(`${BACKEND_ROUTE_FILE} no longer runs a COUNT(*) over the same WHERE clause as the paginated SELECT`);
  }
  if (!/return \{ users, total_count: totalCount \};/.test(files[BACKEND_ROUTE_FILE])) {
    failures.push(`${BACKEND_ROUTE_FILE} GET /api/v1/identity/users no longer returns total_count`);
  }

  if (!/limit: "200"/.test(files[API_CLIENT_FILE])) {
    failures.push(`${API_CLIENT_FILE} listUsers no longer requests the backend's max page size (200)`);
  }
  if (!/total_count: number/.test(files[API_CLIENT_FILE])) {
    failures.push(`${API_CLIENT_FILE} listUsers no longer types total_count on its response`);
  }

  if (!/import \{ CappedListNotice \} from "\.\.\/components\/CappedListNotice"/.test(files[USERS_PAGE_FILE])) {
    failures.push(`${USERS_PAGE_FILE} no longer imports CappedListNotice`);
  }
  if (!/<CappedListNotice/.test(files[USERS_PAGE_FILE])) {
    failures.push(`${USERS_PAGE_FILE} no longer renders CappedListNotice`);
  }
  if (!/all: totalUserCount,/.test(files[USERS_PAGE_FILE])) {
    failures.push(`${USERS_PAGE_FILE} "Total users" tab count no longer reads the server's total_count`);
  }

  return failures;
}

function readAll() {
  const files = {};
  for (const f of [BACKEND_ROUTE_FILE, API_CLIENT_FILE, USERS_PAGE_FILE]) {
    files[f] = fs.readFileSync(path.join(root, f), "utf8");
  }
  return files;
}

function run() {
  const files = readAll();
  const failures = check(files);
  if (failures.length > 0) {
    console.error("FAIL: users-list-silent-50-cap");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Users list returns + consumes + discloses total_count instead of a silent 50/200-row cap");
}

function selftest() {
  const files = readAll();

  const offenderA = { ...files };
  offenderA[BACKEND_ROUTE_FILE] = files[BACKEND_ROUTE_FILE].replace(
    "return { users, total_count: totalCount };",
    "return { users };"
  );
  if (offenderA[BACKEND_ROUTE_FILE] === files[BACKEND_ROUTE_FILE]) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderA).length === 0) {
    console.error("FAIL(selftest): planted offender (backend total_count dropped) was NOT caught");
    process.exit(1);
  }

  const offenderB = { ...files };
  offenderB[USERS_PAGE_FILE] = files[USERS_PAGE_FILE].replace("all: totalUserCount,", "all: allUsers.length,");
  if (offenderB[USERS_PAGE_FILE] === files[USERS_PAGE_FILE]) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderB).length === 0) {
    console.error("FAIL(selftest): planted offender (Total users KPI reverted to allUsers.length) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
