#!/usr/bin/env node
/**
 * ACCT-F3492 — AccountTypeCatalogPage keeps page-local nested type/detail search;
 * each ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "AccountTypeCatalogPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "AccountTypeCatalogPage: must keep page-local nested search");
  assert(/Search type or detail type/.test(src), "AccountTypeCatalogPage: must keep Search type or detail type… input");
  assert(/suppressToolbarSearch/.test(src), "AccountTypeCatalogPage: ParityTable must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ ACCT-F3492:[\s\S]*?suppressToolbarSearch\n/, "\n");
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-account-type-catalog-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
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
