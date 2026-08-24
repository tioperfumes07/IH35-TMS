#!/usr/bin/env node
/**
 * DAILY-TASKS-F1 — `cancelDailyTask` (apps/frontend/src/api/dailyTasks.ts), a real, backend-authorized
 * POST /api/v1/daily-tasks/:id/cancel (creator, assignee, or Owner/Administrator/Manager per the
 * backend's canManageTask predicate), was exported but referenced NOWHERE in the entire frontend --
 * grep confirmed zero call sites outside its own definition. DailyTasksPage.tsx only ever wired
 * Accept and Complete; a created daily task could never be cancelled by any user through the UI, a
 * silent capability gap (the backend explicitly models a "cancelled" status + "cancelled" timeline
 * event; the frontend's own STATUS_STEPS/statusBadge already render that state -- it was reachable by
 * data, just never by any control). Live-reproduced: created a real task via Quick Create, no Cancel
 * affordance existed anywhere (row actions, detail drawer) to remove it.
 *
 * Fix: wire cancelDailyTask into DailyTasksPage.tsx -- a cancelMut mutation, a gated "Cancel" row
 * action (mirrors the existing Accept/Complete canAccept/canComplete pattern, but allows the task's
 * creator OR assignee OR an Owner/Administrator/Manager, matching the backend's canManageTask exactly),
 * and a small reason-collecting Modal (the backend requires a non-empty cancellation_reason).
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };

  need(/import\s*\{[^}]*\bcancelDailyTask\b[^}]*\}\s*from\s*"\.\.\/\.\.\/api\/dailyTasks"/.test(text), "cancelDailyTask must be imported from ../../api/dailyTasks");
  need(/mutationFn:\s*\(\{\s*id,\s*reason\s*\}[^)]*\)\s*=>\s*cancelDailyTask\(id,\s*reason\)/.test(text), "a mutation must call cancelDailyTask(id, reason)");
  need(/const canCancel\s*=/.test(text), "a canCancel gate must exist");
  need(
    /task\.created_by_user_id === userId \|\| task\.assigned_to_user_id === userId \|\| isManager/.test(text),
    "canCancel must allow the task's creator OR assignee OR a manager role, matching the backend's canManageTask predicate"
  );
  need(
    /\["Owner",\s*"Administrator",\s*"Manager"\]\.includes\(auth\.user\?\.role/.test(text),
    "the manager-role check must use the canonical Owner/Administrator/Manager role list"
  );
  need(
    /task\.status !== "completed" &&\s*\n?\s*task\.status !== "cancelled"/.test(text),
    "canCancel must exclude already-completed and already-cancelled tasks"
  );
  need(/canCancel \? \(/.test(text), "a Cancel button must render when canCancel is true");
  need(/setCancelTaskId\(task\.id\)/.test(text), "the Cancel button's onClick must open the cancel-reason modal for this task");
  need(/title="Cancel Task"/.test(text), "a cancellation-reason Modal must exist");
  need(/disabled=\{!cancelReason\.trim\(\)\}/.test(text), "the Cancel Task confirm button must require a non-empty reason (the backend rejects an empty cancellation_reason)");

  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-daily-tasks-cancel-wired FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drop cancelDailyTask import", mutate: (t) => t.replace(/,\s*cancelDailyTask/, "") },
    { name: "drop mutationFn call", mutate: (t) => t.replace("cancelDailyTask(id, reason)", "Promise.resolve()") },
    { name: "drop canCancel gate", mutate: (t) => t.replace(/const canCancel\s*=[\s\S]*?isManager\);/, "") },
    { name: "drop creator/assignee/manager predicate", mutate: (t) => t.replace("task.created_by_user_id === userId || task.assigned_to_user_id === userId || isManager", "isManager") },
    { name: "drop manager role list", mutate: (t) => t.replace('["Owner", "Administrator", "Manager"].includes(auth.user?.role ?? "")', "false") },
    { name: "drop completed/cancelled exclusion", mutate: (t) => t.replace('task.status !== "completed" &&\n            task.status !== "cancelled" &&\n            ', "") },
    { name: "remove Cancel button click wiring", mutate: (t) => t.replace("setCancelTaskId(task.id);", "") },
    { name: "remove reason-required guard", mutate: (t) => t.replace('disabled={!cancelReason.trim()}', "") },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-daily-tasks-cancel-wired SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-daily-tasks-cancel-wired PASS — cancelDailyTask is wired to a real gated Cancel action + reason modal, matching the backend's own authorization rule");
