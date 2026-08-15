#!/usr/bin/env node
/**
 * TASK-F3558 — TasksTab (per-entity reverse task list) must use ParityTable
 * (Search+Range+gear), not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/tasks/TasksTab.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "TasksTab: must use ParityTable");
  assert(src.includes('storageKey="entity-tasks-tab"'), "TasksTab: must set storageKey");
  assert(src.includes('tableTestId="entity-tasks-tab-table"'), "TasksTab: must set tableTestId");
  assert(!/<table\b/.test(src), "TasksTab: must not use raw HTML table");
  assert(src.includes("fetchTasksByTarget"), "TasksTab: keep tasks-by-target API");
  assert(src.includes("CreateTaskModal"), "TasksTab: keep + Create modal");
  assert(src.includes("+ Create"), "TasksTab: keep + Create label");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function TasksTab() {",
    '  return <table className="min-w-full" data-testid="entity-tasks-tab-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-tasks-tab-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-tasks-tab-parity-surface-bar PASS");
}
