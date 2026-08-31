#!/usr/bin/env node
/**
 * MAINT-F3522 — Drivers Master Data keeps server-bound search;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "DriversMasterDataPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "DriversMasterDataPage: must keep server-bound search");
  assert(/listMaintenanceDrivers\([^)]*\{\s*search\s*\}/.test(src), "DriversMasterDataPage: must pass search to listMaintenanceDrivers");
  assert(/suppressToolbarSearch/.test(src), "DriversMasterDataPage: must pass suppressToolbarSearch");
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
  const bad = good.replace(/\n\s*\/\/ MAINT-F3522:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
  assert(!/suppressToolbarSearch/.test(bad), "selftest fixture must remove all suppressToolbarSearch tokens");
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
  console.log("verify-drivers-master-data-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    await selftest();
  } catch (e) {
    console.error(`verify-drivers-master-data-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-drivers-master-data-suppress-toolbar-search PASS — drivers master data suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-drivers-master-data-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
