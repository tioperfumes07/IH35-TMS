#!/usr/bin/env node
/** DRIVER-F6481 — Driver roster staged Status filter uses canonical Combobox chrome. */
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
    'htmlFor="drivers-table-status-filter"',
    'id="drivers-table-status-filter"',
    'dataTestId="drivers-table-status-filter"',
    'options={DRIVER_STATUS_FILTERS.filter((option) => option.value)}',
    'value={staged.draft.status || null}',
    'onChange={(next) => staged.setDraft({ status: next ?? "" })}',
    'placeholder="All statuses"',
    'onApply: (next) => setStatusFilter(next.status)',
    'return enrichedRows.filter((row) => row.status === statusFilter)',
  ]) if (!source.includes(token)) throw new Error(`missing Driver roster status contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace('onApply: (next) => setStatusFilter(next.status)', 'onApply: () => undefined');
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
console.log("verify-driver-roster-status-filter-combobox PASS — staged Combobox preserves Apply + predicate wiring");
