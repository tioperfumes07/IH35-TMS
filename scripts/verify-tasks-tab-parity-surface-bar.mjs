#!/usr/bin/env node
/**
 * TASK-F3558 — TasksTab (per-entity reverse task list) must use ParityTable
 * (Search+Range+gear), not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/tasks/TasksTab.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "TasksTab: must use ParityTable");
  assert(src.includes('storageKey="entity-tasks-tab"'), "TasksTab: must set storageKey");
  assert(src.includes('tableTestId="entity-tasks-tab-table"'), "TasksTab: must set tableTestId");
  assert(!/<table\b/.test(src), "TasksTab: must not use raw HTML table");
  assert(src.includes("fetchTasksByTarget"), "TasksTab: keep tasks-by-target API");
  assert(src.includes("CreateTaskModal"), "TasksTab: keep + Create modal");
  assert(src.includes("+ Create"), "TasksTab: keep + Create label");
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
  const planted = [
    "export function TasksTab() {",
    '  return <table className="min-w-full" data-testid="entity-tasks-tab-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
      return planted;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-tasks-tab-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-tasks-tab-parity-surface-bar PASS");
}
