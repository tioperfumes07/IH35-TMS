#!/usr/bin/env node
/**
 * LST-F3490 — DriverTeamsPage must not mount page-local free-text search;
 * ParityTable toolbar owns search. Status filter may remain page-local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(src = fs.readFileSync(path.join(ROOT, PAGE), "utf8")) {
  assert(src.includes("ParityTable"), "DriverTeamsPage: must use ParityTable");
  assert(!/\[search,\s*setSearch\]/.test(src), "DriverTeamsPage: must not keep page-local search state");
  assert(!/Search by team or driver name/.test(src), "DriverTeamsPage: must not mount page-local search input");
  assert(/StatusFilter|setStatus/.test(src), "DriverTeamsPage: must keep status filter");
}

function selftest() {
  check();
  const good = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const bad =
    good.replace(/const \[status/, `const [search, setSearch] = useState("");\n  const [status`) +
    `\n<input placeholder="Search by team or driver name" value={search} />\n`;
  let failed = false;
  try {
    check(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL with page-local search restored");
  console.log("verify-driver-teams-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-driver-teams-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-driver-teams-duplicate-search PASS — DriverTeams ParityTable-owned search");
  } catch (e) {
    console.error(`verify-driver-teams-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
