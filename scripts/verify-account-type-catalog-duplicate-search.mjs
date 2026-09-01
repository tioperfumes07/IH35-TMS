#!/usr/bin/env node
/**
 * ACCT-F3492 — AccountTypeCatalogPage keeps page-local nested type/detail search;
 * each ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "AccountTypeCatalogPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "AccountTypeCatalogPage: must keep page-local nested search");
  assert(/Search type or detail type/.test(src), "AccountTypeCatalogPage: must keep Search type or detail type… input");
  assert(/suppressToolbarSearch/.test(src), "AccountTypeCatalogPage: ParityTable must pass suppressToolbarSearch");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  const bad = good.replace(/\n\s*\/\/ ACCT-F3492:[\s\S]*?suppressToolbarSearch\n/, "\n");
      return bad;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-account-type-catalog-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    await selftest();
  } catch (e) {
    console.error(`verify-account-type-catalog-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-account-type-catalog-duplicate-search PASS — AccountTypeCatalog suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-account-type-catalog-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
