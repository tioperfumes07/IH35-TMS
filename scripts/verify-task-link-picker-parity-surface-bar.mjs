#!/usr/bin/env node
/**
 * TASK-F3582 — TaskLinkPicker modal list must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/tasks/TaskLinkPicker.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "TaskLinkPicker: must use ParityTable");
  assert(src.includes('storageKey="task-link-picker-open"'), "TaskLinkPicker: storageKey");
  assert(src.includes('tableTestId="task-link-picker-table"'), "TaskLinkPicker: tableTestId");
  assert(src.includes("embedded"), "TaskLinkPicker: ParityTable must be embedded in modal");
  assert(src.includes("createTaskLink"), "TaskLinkPicker: keep createTaskLink");
  assert(src.includes("Link &amp; complete") || src.includes("Link & complete"), "TaskLinkPicker: keep link action");
  assert(!/<table\b/.test(src), "TaskLinkPicker: must not use raw HTML table");
  // BANK-F91329 leftover refuse — TaskLinkPicker.tsx page-scoped text token ratchet
  assert(!src.includes("text-[11px]"), "TaskLinkPicker.tsx: leftover text-[11px]");
  assert(!src.includes("#8A92AB"), "TaskLinkPicker.tsx: leftover off-scale muted #8A92AB");
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
    "export function TaskLinkPicker() {",
    '  return <table className="min-w-full" data-testid="task-link-picker-table"><tbody /></table>;',
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

  // BANK-F91329 leftover plant — TaskLinkPicker page-scoped text token ratchet
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
  console.log("verify-task-link-picker-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-task-link-picker-parity-surface-bar PASS");
}
