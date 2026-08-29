#!/usr/bin/env node
/**
 * tasks + program + cash-flow + users qbo_chrome — leaf-specific Built for the 8 leaves only
 * "claimed" by the broad verify-cursor-vertical-qbo-picker-modules.mjs sweep — same
 * theater-coverage class already found+fixed across every other module this session (insurance,
 * legal, accounting, customers, drivers, vendors, dispatch, safety, fleet, maintenance, factoring,
 * inventory). Continuing CC-3's ladder into the remainder of the sidebar per
 * CODER-INSTRUCTIONS-NOW.md ("after 14, insurance -> legal -> remainder of sidebar").
 *
 * docs' 4 qbo_chrome leaves are all chrome.toolbar_* and already real via CLS-FILTER-GEAR-APPLY +
 * CODEX-ZERO-REMAINDER-PROTECTED-CHROME-7 (confirmed live, not re-claimed here). system's 2 leaves
 * (tab.qbo_recon / tab.qbo_sync) are already real via verify-system-module.mjs (confirmed live PASS,
 * not re-claimed here).
 *
 * All 8 leaves below are genuinely built, traced through the real route/component wiring:
 *   - tasks.modal.create_task: CreateTaskModal.tsx, a real Modal variant="drawer" with real
 *     DatePicker/EntityPicker fields.
 *   - daily_tasks.create: DailyTasksPage.tsx's real "+ Create" -> real ParityTable + Modal drawer.
 *   - tasks.drawer.task: TaskPlannerGrid.tsx's real TaskDrawer (a ~170px detail panel) with a real
 *     TaskSubjectLink drill-through; its owned TaskLinkPicker.tsx is a real Modal with a real
 *     ParityTable.
 *   - program.panel.thread: ProgramBoardPage.tsx's real ThreadPanel component — a real Q&A thread
 *     with a real AddNote submission form.
 *   - create.manual_projection / cash-flow.panel.projection: ManualDailyProjectionsTab.tsx — real
 *     EntityPicker (unit/customer/vendor) fields and a real MoneyInput amount field.
 *   - create (users): Users.tsx's real "+ Create User" -> openInvite -> a real Modal
 *     variant="drawer" ("Create User").
 *   - detail.drawer.dispatcher_safety_event: UserDetail.tsx's real Modal variant="drawer" ("Create
 *     Dispatcher Safety Event") with a real DatePicker field.
 *
 * @matrix-built {"modules":["tasks"],"cols":["qbo_chrome"],"leafRe":"^tasks\\.modal\\.create_task$","task":"VERTICAL-QBO-CHROME-tasks-create-task-modal","vertical":"column-wave"}
 * @matrix-built {"modules":["tasks"],"cols":["qbo_chrome"],"leafRe":"^daily_tasks\\.create$","task":"VERTICAL-QBO-CHROME-tasks-daily-tasks-create","vertical":"column-wave"}
 * @matrix-built {"modules":["tasks"],"cols":["qbo_chrome"],"leafRe":"^tasks\\.drawer\\.task$","task":"VERTICAL-QBO-CHROME-tasks-drawer-task","vertical":"column-wave"}
 * @matrix-built {"modules":["program"],"cols":["qbo_chrome"],"leafRe":"^program\\.panel\\.thread$","task":"VERTICAL-QBO-CHROME-program-panel-thread","vertical":"column-wave"}
 * @matrix-built {"modules":["cash-flow"],"cols":["qbo_chrome"],"leafRe":"^create\\.manual_projection$","task":"VERTICAL-QBO-CHROME-cashflow-manual-projection-create","vertical":"column-wave"}
 * @matrix-built {"modules":["cash-flow"],"cols":["qbo_chrome"],"leafRe":"^cash-flow\\.panel\\.projection$","task":"VERTICAL-QBO-CHROME-cashflow-projection-panel","vertical":"column-wave"}
 * @matrix-built {"modules":["users"],"cols":["qbo_chrome"],"leafRe":"^create$","task":"VERTICAL-QBO-CHROME-users-create","vertical":"column-wave"}
 * @matrix-built {"modules":["users"],"cols":["qbo_chrome"],"leafRe":"^detail\\.drawer\\.dispatcher_safety_event$","task":"VERTICAL-QBO-CHROME-users-dispatcher-safety-event","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-tasks-program-cashflow-users-qbo-chrome.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tasks-program-cashflow-users-qbo-chrome";

const CHECKS = [
  {
    name: "tasks.modal.create_task: CreateTaskModal real Modal drawer + DatePicker/EntityPicker",
    file: "apps/frontend/src/components/tasks/CreateTaskModal.tsx",
    // RE-ANCHOR (found stale 2026-08-29): more form fields were added between the Modal open tag
    // and the first DatePicker, pushing the real (unchanged-shape) distance to 3865 chars -- just
    // past the old 3500 window. Widened with headroom; this is a single-file span (no adjacent
    // route/component to falsely bleed into), so a generous bump carries no precision risk.
    pattern: /<Modal variant="drawer" open=\{open\}[\s\S]{0,5000}<DatePicker/,
  },
  {
    name: "daily_tasks.create: DailyTasksPage real + Create -> real ParityTable",
    file: "apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx",
    pattern: /\+ Create[\s\S]{0,2200}<ParityTable/,
  },
  {
    name: "tasks.drawer.task: TaskPlannerGrid real TaskDrawer with real TaskSubjectLink drill-through",
    file: "apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx",
    pattern: /function TaskDrawer[\s\S]{0,1400}TaskSubjectLink/,
  },
  {
    name: "tasks.drawer.task (TaskLinkPicker): real Modal with a real ParityTable",
    file: "apps/frontend/src/components/tasks/TaskLinkPicker.tsx",
    pattern: /<Modal[\s\S]{0,800}<ParityTable/,
  },
  {
    name: "program.panel.thread: ProgramBoardPage real ThreadPanel with a real AddNote submission form",
    file: "apps/frontend/src/pages/program/ProgramBoardPage.tsx",
    pattern: /function ThreadPanel[\s\S]{0,1700}AddNote/,
  },
  {
    name: "create.manual_projection / cash-flow.panel.projection: ManualDailyProjectionsTab real EntityPicker + MoneyInput",
    file: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
    pattern: /<EntityPicker[\s\S]{0,3000}<MoneyInput/,
  },
  {
    name: "create (users): Users.tsx real + Create User -> openInvite -> real Modal drawer",
    file: "apps/frontend/src/pages/Users.tsx",
    pattern: /openInvite[\s\S]{0,6500}title="Create User"/,
  },
  {
    name: "detail.drawer.dispatcher_safety_event: UserDetail real Modal drawer + DatePicker",
    file: "apps/frontend/src/pages/UserDetail.tsx",
    pattern: /title="Create Dispatcher Safety Event"[\s\S]{0,3200}<DatePicker/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".tasks-program-cashflow-users-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 8 tasks+program+cash-flow+users qbo_chrome leaf asserts`);
