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
  // BANK-F91318 leftover refuse — DriversMasterDataPage.tsx page-scoped text token ratchet
  assert(!src.includes("text-[11px]"), "DriversMasterDataPage.tsx: leftover text-[11px]");
  assert(!src.includes("#8A92AB"), "DriversMasterDataPage.tsx: leftover off-scale muted #8A92AB");
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

  // BANK-F91318 leftover plant — DriversMasterDataPage page-scoped text token ratchet
  let leftoverCaught = false;
  await withMutatedCopy(
    realPath,
    (good) => good + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n',
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch (e) {
        if (String(e.message || e).includes("leftover text-[11px]")) leftoverCaught = true;
      }
    },
  );
  assert(leftoverCaught, "selftest: leftover plant escaped");
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
