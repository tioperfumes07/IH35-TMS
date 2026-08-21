#!/usr/bin/env node
/** @matrix-built {"modules":["tasks"],"cols":["unit"],"leafRe":"^(nav\\.(board|mine)|board\\.(planner_grid|create)|mine\\.list)$","task":"LINK-F5167-TASKS-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 5 genuine tasks leaves.
 * nav.board/nav.mine are real navigate() targets in TasksModuleTabs.tsx pointing at /tasks and
 * /tasks/mine, which render TaskPlannerGrid (board.planner_grid) and TasksMinePage (mine.list) —
 * both draw subject_type="unit" rows through the real TaskSubjectLink kind-map. board.create
 * (CreateTaskModal) has a real EntityPicker kind="unit" for subject_type="unit" tasks.
 *
 * Self-test: node scripts/verify-tasks-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tasks-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/tasks/TasksModuleTabs.tsx", /\{ id: "board", label: "Task Board", to: "\/tasks" \}/],
  ["apps/frontend/src/pages/tasks/TasksModuleTabs.tsx", /\{ id: "mine", label: "My Tasks", to: "\/tasks\/mine" \}/],
  ["apps/frontend/src/components/tasks/TaskSubjectLink.tsx", /unit: "unit",/],
  ["apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx", /<TaskSubjectLink subjectType=\{task\.subject_type\} subjectId=\{task\.subject_id\}(?: subjectLabel=\{task\.subject_label\})? \/>/],
  ["apps/frontend/src/pages/tasks/TasksMinePage.tsx", /<TaskSubjectLink subjectType=\{row\.subject_type\} subjectId=\{row\.subject_id\}(?: subjectLabel=\{row\.subject_label\})? \/>/],
  ["apps/frontend/src/pages/tasks/TasksChatPage.tsx", /<TaskSubjectLink\s+subjectType=\{selectedTask\.subject_type\}\s+subjectId=\{selectedTask\.subject_id\}\s+subjectLabel=\{selectedTask\.subject_label\}\s+\/>/],
  ["apps/frontend/src/components/tasks/CreateTaskModal.tsx", /kind=\{entityKind as "customer" \| "vendor" \| "driver" \| "unit" \| "load"\}/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real unit-scoped task wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — tasks' 5 unit-scoped board/mine/create leaves are real`);
