#!/usr/bin/env node
// CLS-F6938 — server-paged ParityTable consumers must expose one authoritative pager.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [
  ["apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "pageSize={pageSize}"],
  ["apps/frontend/src/components/dispatch/DispatchList.tsx", "pageSize={limit}"],
  ["apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx", "pageSize={PAGE_SIZE}"],
  ["apps/frontend/src/pages/audit/AuditTrailPage.tsx", "pageSize={PAGE_SIZE}"],
  ["apps/frontend/src/pages/maintenance/TireProgramPage.tsx", "pageSize={EVENT_PAGE_SIZE}"],
  ["apps/frontend/src/pages/maintenance/VendorDetailPage.tsx", "pageSize={pageSize}"],
];

export function checkFile(file, text, expectedPageSize) {
  const failures = [];
  const tables = [...text.matchAll(/<ParityTable(?:<[^>]+>)?[\s\S]*?\/>/g)].map((match) => match[0]);
  const serverTables = tables.filter((table) => table.includes(expectedPageSize));
  if (!serverTables.length) failures.push(`${file}: missing controlled server page size ${expectedPageSize}`);
  if (serverTables.some((table) => !/\bhidePager\b/.test(table))) {
    failures.push(`${file}: server-paged ParityTable must hide its local pager`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `<ParityTable rows={rows} pageSize={PAGE_SIZE} hidePager columns={columns} />`;
  const bad = `<ParityTable rows={rows} pageSize={PAGE_SIZE} columns={columns} />`;
  if (checkFile("fixture", good, "pageSize={PAGE_SIZE}").length !== 0) process.exit(1);
  if (checkFile("fixture", bad, "pageSize={PAGE_SIZE}").length !== 1) process.exit(1);
  console.log("verify-server-paged-paritytable-single-pager: selftest PASS (2/2)");
  process.exit(0);
}

const failures = checks.flatMap(([file, expected]) =>
  checkFile(file, fs.readFileSync(path.join(root, file), "utf8"), expected)
);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`verify-server-paged-paritytable-single-pager: PASS (${checks.length} mounted surfaces)`);

