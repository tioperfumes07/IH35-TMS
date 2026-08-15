#!/usr/bin/env node
/**
 * LST-F3466 — ItemsListPage server search in CollapsedListFilters must pair with
 * ParityTable suppressToolbarSearch (flat view) so toolbar "Search rows…" does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/lists/accounting/ItemsListPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src) {
  assert(src.includes("ParityTable"), "ItemsListPage: must use ParityTable");
  assert(
    /placeholder=["']Search items…["']/.test(src) || /placeholder=["']Search items\u2026["']/.test(src),
    "ItemsListPage: must keep server-side Search items… in searchSlot",
  );
  assert(
    /filterBar=\{filterBar\}[\s\S]*?suppressToolbarSearch/.test(src) ||
      /suppressToolbarSearch[\s\S]*?filterBar=\{filterBar\}/.test(src),
    "ItemsListPage: flat ParityTable with filterBar must pass suppressToolbarSearch",
  );
}

function selftest() {
  const full = path.join(ROOT, PAGE);
  const good = fs.readFileSync(full, "utf8");
  checkPage(good);
  const bad = good.replace(/\n\s*suppressToolbarSearch\n/, "\n");
  let failed = false;
  try {
    checkPage(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-items-list-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-items-list-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkPage(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
    console.log("verify-items-list-suppress-toolbar-search PASS — ItemsListPage suppresses toolbar search");
  } catch (e) {
    console.error(`verify-items-list-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
