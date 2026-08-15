#!/usr/bin/env node
/**
 * LV-WORK-ORDERS-CONSOLE-DUPLICATE-SEARCH
 * Server-side search lives in filterBar; ParityTable must suppressToolbarSearch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx");
const TABLE = path.join(ROOT, "apps/frontend/src/components/parity/ParityTable.tsx");
const TOOLBAR = path.join(ROOT, "apps/frontend/src/components/table/UniversalListToolbar.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkSources({ page, table, toolbar }) {
  assert(page.includes("ParityTable"), "WorkOrdersConsoleListPage: must use ParityTable");
  assert(
    /placeholder=["']Search WO #, unit, vendor, driver/.test(page),
    "WorkOrdersConsoleListPage: must keep server-side Search WO input in filterBar",
  );
  assert(
    /suppressToolbarSearch/.test(page),
    "WorkOrdersConsoleListPage: must pass suppressToolbarSearch so toolbar Search rows… is not a competing control",
  );
  assert(
    /suppressToolbarSearch\??:/.test(table) || /suppressToolbarSearch\s*=/.test(table),
    "ParityTable: must declare suppressToolbarSearch prop",
  );
  assert(/hideSearch=\{suppressToolbarSearch\}/.test(table), "ParityTable: must pass hideSearch={suppressToolbarSearch}");
  assert(/hideSearch\??:/.test(toolbar) || /hideSearch\s*=/.test(toolbar), "UniversalListToolbar: must support hideSearch");
}

function selftest() {
  const page = fs.readFileSync(PAGE, "utf8");
  const table = fs.readFileSync(TABLE, "utf8");
  const toolbar = fs.readFileSync(TOOLBAR, "utf8");
  checkSources({ page, table, toolbar });

  const badPage = page.replace(/\n\s*suppressToolbarSearch\n/, "\n");
  let failed = false;
  try {
    checkSources({ page: badPage, table, toolbar });
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL when suppressToolbarSearch removed");
  console.log("verify-work-orders-console-no-dup-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-work-orders-console-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkSources({
      page: fs.readFileSync(PAGE, "utf8"),
      table: fs.readFileSync(TABLE, "utf8"),
      toolbar: fs.readFileSync(TOOLBAR, "utf8"),
    });
    console.log("verify-work-orders-console-no-dup-search PASS — server search only + suppressToolbarSearch");
  } catch (e) {
    console.error(`verify-work-orders-console-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
