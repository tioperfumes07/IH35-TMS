#!/usr/bin/env node
/**
 * verify-tasks-planner-v3.mjs
 * Assert TASKS-PLANNER-REDESIGN-V3 deliverables.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`[verify-tasks-v3] FAIL: missing file: ${rel}`); process.exit(1); }
  return fs.readFileSync(abs, "utf8");
}
let failed = false;
function fail(msg) { console.error(`[verify-tasks-v3] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-tasks-v3] PASS: ${msg}`); }

// Migration
const mig = read("db/migrations/202606120001_tasks_planner_v3.sql");
if (!mig.includes("progress_pct")) fail("migration missing progress_pct column");
else pass("migration adds progress_pct");
if (!mig.includes("task_type")) fail("migration missing task_type table");
else pass("migration creates task_type table");
if (!mig.includes("ROW LEVEL SECURITY") || !mig.includes("NULLIF")) fail("migration missing RLS NULLIF pattern");
else pass("migration has RLS with NULLIF");

// Backend routes
const routes = read("apps/backend/src/tasks/task.routes.ts");
if (!routes.includes("progress_pct")) fail("task.routes.ts missing progress_pct");
else pass("task.routes.ts handles progress_pct");
if (!routes.includes("/types")) fail("task.routes.ts missing /types endpoints");
else pass("task.routes.ts has /types endpoints");
if (!routes.includes("/:id/progress")) fail("task.routes.ts missing /:id/progress");
else pass("task.routes.ts has /:id/progress PATCH");
if (!routes.includes("by_employee")) fail("task.routes.ts planner missing by_employee grouping");
else pass("task.routes.ts planner groups by_employee");

// Backend registration
const index = read("apps/backend/src/index.ts");
if (!index.includes("taskRoutes") || !index.includes("/api/v1/tasks")) fail("index.ts missing task routes registration");
else pass("index.ts registers task routes at /api/v1/tasks");

// Frontend API
const api = read("apps/frontend/src/api/tasks.ts");
if (!api.includes("fetchPlannerTasks")) fail("api/tasks.ts missing fetchPlannerTasks");
else pass("api/tasks.ts has fetchPlannerTasks");
if (!api.includes("fetchTaskTypes")) fail("api/tasks.ts missing fetchTaskTypes");
else pass("api/tasks.ts has fetchTaskTypes");
if (!api.includes("updateTaskProgress")) fail("api/tasks.ts missing updateTaskProgress");
else pass("api/tasks.ts has updateTaskProgress");

// Planner grid component
const grid = read("apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx");
if (!grid.includes("UniversalFilterBar")) fail("TaskPlannerGrid.tsx missing UniversalFilterBar");
else pass("TaskPlannerGrid.tsx uses UniversalFilterBar");
if (!grid.includes("by_employee")) fail("TaskPlannerGrid.tsx missing by_employee grouping");
else pass("TaskPlannerGrid.tsx groups by_employee");
if (!grid.includes("LOCALSTORAGE_COL_KEY")) fail("TaskPlannerGrid.tsx missing persisted col width");
else pass("TaskPlannerGrid.tsx persists column width");
if (!grid.includes("onResizeMouseDown")) fail("TaskPlannerGrid.tsx missing resizable column");
else pass("TaskPlannerGrid.tsx has resizable employee column");
if (!grid.includes("drawer") && !grid.includes("TaskDrawer")) fail("TaskPlannerGrid.tsx missing detail drawer");
else pass("TaskPlannerGrid.tsx has detail drawer");

// TaskBoardPage wired
const boardPage = read("apps/frontend/src/pages/tasks/TaskBoardPage.tsx");
if (!boardPage.includes("TaskPlannerGrid")) fail("TaskBoardPage.tsx not wired to TaskPlannerGrid");
else pass("TaskBoardPage.tsx uses TaskPlannerGrid");

if (failed) { console.error("\n[verify-tasks-v3] FAILED"); process.exit(1); }
console.log("\n[verify-tasks-v3] ALL CHECKS PASSED");
