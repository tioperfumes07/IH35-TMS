#!/usr/bin/env node
/**
 * USR-F3494 — UsersPage must not mount page-local free-text search;
 * ParityTable toolbar owns search. Tab filters may remain page-local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/Users.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "UsersPage: must use ParityTable");
  assert(!/\[search,\s*setSearch\]/.test(src), "UsersPage: must not keep page-local search state");
  assert(!/placeholder=["']Search users["']/.test(src), "UsersPage: must not mount Search users input");
  assert(/listTab/.test(src), "UsersPage: must keep tab filter");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad =
    good.replace(/const \[inviteOpen/, `const [search, setSearch] = useState("");\n  const [inviteOpen`) +
    `\n<input placeholder="Search users" value={search} />\n`;
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL with page-local search restored");
  console.log("verify-users-list-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-users-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-users-list-duplicate-search PASS — Users ParityTable-owned search");
  } catch (e) {
    console.error(`verify-users-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
