#!/usr/bin/env node
/**
 * TASK-F3582 — TaskLinkPicker modal list must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/tasks/TaskLinkPicker.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "TaskLinkPicker: must use ParityTable");
  assert(src.includes('storageKey="task-link-picker-open"'), "TaskLinkPicker: storageKey");
  assert(src.includes('tableTestId="task-link-picker-table"'), "TaskLinkPicker: tableTestId");
  assert(src.includes("embedded"), "TaskLinkPicker: ParityTable must be embedded in modal");
  assert(src.includes("createTaskLink"), "TaskLinkPicker: keep createTaskLink");
  assert(src.includes("Link &amp; complete") || src.includes("Link & complete"), "TaskLinkPicker: keep link action");
  assert(!/<table\b/.test(src), "TaskLinkPicker: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function TaskLinkPicker() {",
    '  return <table className="min-w-full" data-testid="task-link-picker-table"><tbody /></table>;',
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
  console.log("verify-task-link-picker-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-task-link-picker-parity-surface-bar PASS");
}
