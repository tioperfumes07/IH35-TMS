#!/usr/bin/env node
/**
 * ACCT-F3498 — AccountRegisterPage keeps server-bound memo/ref search; ParityTable(s)
 * must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "AccountRegisterPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "AccountRegisterPage: must keep server-bound search state");
  assert(/search:\s*search\.trim\(\)/.test(src), "AccountRegisterPage: must pass search to API");
  assert(
    (src.match(/suppressToolbarSearch/g) || []).length >= 2,
    "AccountRegisterPage: both ParityTables must pass suppressToolbarSearch",
  );
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it to
// a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) =>
      good
        .replace(/\n\s*\/\/ ACCT-F3498:[\s\S]*?suppressToolbarSearch\n/, "\n")
        .replace(/\n\s*suppressToolbarSearch\n/g, "\n"),
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-account-register-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    await selftest();
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
