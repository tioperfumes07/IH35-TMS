#!/usr/bin/env node
/**
 * DRIVER-F6481 → U12 — Driver roster staged Status filter is MultiSelectDropdown
 * (was Combobox single). Apply + predicate wiring preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/drivers/DriversTable.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to DriversTable");
  for (const token of [
    'data-testid="drivers-table-status-filter"',
    "MultiSelectDropdown",
    "options={DRIVER_STATUS_FILTERS}",
    "selected={staged.draft.status}",
    'onChange={(next) => staged.setDraft((prev) => ({ ...prev, status: next }))}',
    'allLabel="All statuses"',
    "setStatusFilter(next.status);",
    "if (statusFilter.length) out = out.filter((row) => statusFilter.includes(row.status));",
  ]) if (!source.includes(token)) throw new Error(`missing Driver roster status contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace("setStatusFilter(next.status);", "");
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, DRIVER_F6481_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted disconnected Apply stayed green");
  console.log("verify-driver-roster-status-filter-combobox --selftest PASS");
  process.exit(0);
}

assertContract(process.env.DRIVER_F6481_PLANTED_SOURCE ?? diskSource);
console.log("verify-driver-roster-status-filter-combobox PASS — staged MultiSelect preserves Apply + predicate wiring");
