#!/usr/bin/env node
/**
 * ACCT-F3498 — AccountRegisterPage keeps server-bound memo/ref search; ParityTable(s)
 * must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "AccountRegisterPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "AccountRegisterPage: must keep server-bound search state");
  assert(/search:\s*search\.trim\(\)/.test(src), "AccountRegisterPage: must pass search to API");
  assert(
    (src.match(/suppressToolbarSearch/g) || []).length >= 2,
    "AccountRegisterPage: both ParityTables must pass suppressToolbarSearch",
  );
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ ACCT-F3498:[\s\S]*?suppressToolbarSearch\n/, "\n").replace(
    /\n\s*suppressToolbarSearch\n/g,
    "\n",
  );
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-account-register-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-account-register-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-account-register-suppress-toolbar-search PASS — AccountRegister suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-account-register-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
