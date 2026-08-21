#!/usr/bin/env node
/** @matrix-built {"modules":["tasks"],"cols":["qbo_chrome"],"leafRe":"^tasks\\.board$","task":"TASKS-BOARD-SINGLE-CREATE-BUTTON-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law, "no box-in-box"): TasksModuleTabs.tsx already renders one
 * persistent "+ Create Task" affordance shared across every Tasks tab (TASKS-6). TaskBoardPage.tsx
 * used to ALSO render its own independent "+ Create Task" PageHeader action + CreateTaskModal
 * instance, so the Task Board tab specifically showed two stacked create-task affordances. This
 * guard locks in the fix: TaskBoardPage renders TasksModuleTabs (the one canonical create button)
 * and does not mount its own second CreateTaskModal.
 */
import fs from "node:fs";
const LABEL = "verify-tasks-board-single-create-button-chrome-law";
const FILE = "apps/frontend/src/pages/tasks/TaskBoardPage.tsx";

function audit(src) {
  const failures = [];
  if (!/<TasksModuleTabs/.test(src)) failures.push("TaskBoardPage must render TasksModuleTabs (the shared canonical create-task affordance)");
  if (/<CreateTaskModal/.test(src)) failures.push("TaskBoardPage must not mount its own CreateTaskModal — that duplicates TasksModuleTabs' own instance");
  if (/>\s*\+\s*Create Task\s*</.test(src)) failures.push("TaskBoardPage must not render its own '+ Create Task' button — TasksModuleTabs already owns that affordance");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["reintroduce-modal", (s) => s.replace(
      '<TasksModuleTabs />',
      '<TasksModuleTabs />\n        <CreateTaskModal open={false} operatingCompanyId="" onClose={() => {}} />',
    )],
    ["reintroduce-button", (s) => s.replace(
      '<PageHeader title="Task Board" />\n        <TasksModuleTabs />',
      '<PageHeader title="Task Board" actions={<button>+ Create Task</button>} />\n        <TasksModuleTabs />',
    )],
    ["remove-tabs", (s) => s.replace("<TasksModuleTabs />", "")],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Task Board renders exactly one "+ Create Task" affordance (TasksModuleTabs' shared one), no duplicate box-in-box create button/modal`);
