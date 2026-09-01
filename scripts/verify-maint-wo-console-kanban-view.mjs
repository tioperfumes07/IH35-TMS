#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONSOLE_FILE = path.join(ROOT, "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx");
const MAINT_WO_TABLE = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx");
const SELF = path.join(ROOT, "scripts/verify-maint-wo-console-kanban-view.mjs");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function kanbanViewIssues(src) {
  const issues = [];
  const readsView =
    src.includes('get("view") === "kanban"') ||
    /viewParam\s*===\s*["']kanban["']/.test(src) ||
    /toLowerCase\(\)[\s\S]{0,80}kanban/.test(src);
  if (!readsView) issues.push("must read ?view=kanban from searchParams (case-insensitive OK)");
  if (!src.includes('data-testid="work-orders-console-kanban"')) issues.push("missing data-testid work-orders-console-kanban");
  if (!src.includes("work-orders-console-kanban-tab")) issues.push("missing kanban tab testid");
  if (!src.includes("kanbanColumns")) issues.push("missing kanbanColumns grouping");
  if (!src.includes('set("view", "kanban")')) issues.push("must persist view=kanban in URL");
  return issues;
}

/** MAINT-05 — WorkOrdersConsole list + kanban must expose Dispatch-class header sort + column reorder/width. */
function assertConsoleHeaderSort(src) {
  const issues = [];
  if (!src.includes('data-testid="work-orders-console-headers"')) {
    issues.push("list view must expose work-orders-console-headers row (MAINT-05)");
  }
  if (!/<TableHeaderCell/.test(src)) {
    issues.push("WorkOrdersConsole list must use TableHeaderCell for ASC/DESC header sort (MAINT-05)");
  }
  if (!src.includes('useTablePref("work-orders-console-list"')) {
    issues.push("WorkOrdersConsole must persist column widths/order via useTablePref (MAINT-05)");
  }
  if (!/useColumnReorder/.test(src)) {
    issues.push("WorkOrdersConsole must wire useColumnReorder for drag-reorder (MAINT-05)");
  }
  if (!/useUrlSort/.test(src) || !/toggleHeaderSort|toggleSort/.test(src)) {
    issues.push("WorkOrdersConsole must persist header sort via useUrlSort toggle (MAINT-05)");
  }
  if (!src.includes('key: "unit_number"') || !src.includes('header: "Unit"')) {
    issues.push("WorkOrdersConsole must render a sortable Unit column (MAINT-05)");
  }
  if (!src.includes('key: "display_id"') || !src.includes('header: "WO #"')) {
    issues.push("WorkOrdersConsole must render a sortable WO # column (MAINT-05)");
  }
  if (!src.includes('key: "opened_at"') || !src.includes('header: "Opened"')) {
    issues.push("WorkOrdersConsole must render a sortable Opened/date column (MAINT-05)");
  }
  if (!src.includes("work-orders-console-kanban-sort-")) {
    issues.push("kanban columns must expose unit/WO # sort controls (MAINT-05)");
  }
  if (!/sortKanbanRows/.test(src)) {
    issues.push("kanban view must sort cards within each column (MAINT-05)");
  }
  return issues;
}

/** MAINT-05 — Maintenance home active-WO table must match Dispatch table chrome. */
function assertMaintActiveWoTable(src) {
  const issues = [];
  if (!src.includes('data-testid="maint-active-work-orders-headers"')) {
    issues.push("WorkOrdersTable must expose maint-active-work-orders-headers (MAINT-05)");
  }
  if (!/<TableHeaderCell/.test(src)) {
    issues.push("WorkOrdersTable must use TableHeaderCell for ASC/DESC header sort (MAINT-05)");
  }
  if (!src.includes('useTablePref("maint-active-wos"')) {
    issues.push("WorkOrdersTable must persist column widths/order via useTablePref (MAINT-05)");
  }
  if (!/useColumnReorder/.test(src)) {
    issues.push("WorkOrdersTable must wire useColumnReorder for drag-reorder (MAINT-05)");
  }
  if (!/useUrlSort/.test(src)) {
    issues.push("WorkOrdersTable must persist header sort via useUrlSort (MAINT-05)");
  }
  return issues;
}

function assertSource(consoleSrc, maintSrc) {
  for (const issue of kanbanViewIssues(consoleSrc)) fail(issue);
  for (const issue of assertConsoleHeaderSort(consoleSrc)) fail(issue);
  for (const issue of assertMaintActiveWoTable(maintSrc)) fail(issue);
}

function selftest() {
  const consoleSrc = fs.readFileSync(CONSOLE_FILE, "utf8");
  const maintSrc = fs.readFileSync(MAINT_WO_TABLE, "utf8");
  assertSource(consoleSrc, maintSrc);

  const consoleMutants = [
    consoleSrc.replace('data-testid="work-orders-console-headers"', 'data-testid="work-orders-console-header-row"'),
    consoleSrc.replaceAll("<TableHeaderCell", "<th"),
    consoleSrc.replace('useTablePref("work-orders-console-list"', 'useTablePref("dispatch-board"'),
    consoleSrc.replaceAll("useColumnReorder", "__RemovedColumnReorder__"),
    consoleSrc.replaceAll("useUrlSort", "__RemovedUrlSort__"),
    consoleSrc.replaceAll("work-orders-console-kanban-sort-", "removed-kanban-sort-"),
  ];
  if (!consoleMutants.every((mutant) => assertConsoleHeaderSort(mutant).length > 0)) {
    fail("selftest mutation escaped WorkOrdersConsole MAINT-05 header-sort guard");
  }

  const maintMutants = [
    maintSrc.replace('data-testid="maint-active-work-orders-headers"', 'data-testid="maint-active-wo-header-row"'),
    maintSrc.replaceAll("<TableHeaderCell", "<th"),
    maintSrc.replace('useTablePref("maint-active-wos"', 'useTablePref("fleet-maint"'),
    maintSrc.replaceAll("useColumnReorder", "__RemovedColumnReorder__"),
  ];
  if (!maintMutants.every((mutant) => assertMaintActiveWoTable(mutant).length > 0)) {
    fail("selftest mutation escaped WorkOrdersTable MAINT-05 header-sort guard");
  }

  const kanbanMutants = [
    consoleSrc.replace('data-testid="work-orders-console-kanban"', 'data-testid="gone-kanban"'),
    consoleSrc.replaceAll("kanbanColumns", "removedKanbanColumns"),
    consoleSrc.replaceAll('set("view", "kanban")', 'set("view", "table")'),
  ];
  if (!kanbanMutants.every((mutant) => kanbanViewIssues(mutant).length > 0)) {
    fail("selftest mutation escaped kanban view guard");
  }

  console.log("PASS: verify-maint-wo-console-kanban-view --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource(fs.readFileSync(CONSOLE_FILE, "utf8"), fs.readFileSync(MAINT_WO_TABLE, "utf8"));
  console.log("PASS: verify-maint-wo-console-kanban-view");
}
