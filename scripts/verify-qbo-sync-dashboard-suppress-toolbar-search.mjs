#!/usr/bin/env node
/**
 * ACCT-F3500 — QBOSyncStatusDashboardPage keeps server-bound error-text search;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/qbo/QBOSyncStatusDashboardPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "QBOSyncStatusDashboardPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "QBOSyncStatusDashboardPage: must keep server-bound search");
  assert(/search:\s*search\.trim\(\)/.test(src), "QBOSyncStatusDashboardPage: must pass search to API");
  assert(/suppressToolbarSearch/.test(src), "QBOSyncStatusDashboardPage: must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ ACCT-F3500:[\s\S]*?suppressToolbarSearch\n/, "\n");
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-qbo-sync-dashboard-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-qbo-sync-dashboard-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-qbo-sync-dashboard-suppress-toolbar-search PASS — QBO sync dashboard suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-qbo-sync-dashboard-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
