#!/usr/bin/env node
/**
 * MAINT-F3474 — DriverReportsQueuePage + WorkOrdersTable must not mount page-local
 * searchSlot; ParityTable toolbar owns free-text search.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx",
  "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src, label) {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(src.includes("CollapsedListFilters"), `${label}: must keep CollapsedListFilters for chips`);
  assert(!/searchSlot=/.test(src), `${label}: must not mount searchSlot competing with toolbar Search`);
}

function selftest() {
  for (const rel of PAGES) {
    const full = path.join(ROOT, rel);
    const good = fs.readFileSync(full, "utf8");
    checkPage(good, rel);
    const bad = good.replace(
      /testIdPrefix="[^"]+"/,
      `testIdPrefix="x"
              searchSlot={
                <input value={search} onChange={() => {}} placeholder="Search…" />
              }`,
    );
    let failed = false;
    try {
      checkPage(bad, `${rel}:mut`);
    } catch {
      failed = true;
    }
    assert(failed, `selftest ${rel}: expected FAIL with searchSlot`);
  }
  console.log("verify-maint-lists-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-maint-lists-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    for (const rel of PAGES) {
      checkPage(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel);
    }
    console.log("verify-maint-lists-duplicate-search PASS — both maint lists ParityTable-owned search");
  } catch (e) {
    console.error(`verify-maint-lists-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
