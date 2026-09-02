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

/**
 * MAINT-05→GO-05 SUPERSESSION (2026-09-01, ruling docs/bus/RULING-GO-05-MAINT-05-PARITYTABLE-2026-09-01.md):
 * MAINT-05 (a8cbb319d6, 06:02 CT) locked TableHeaderCell + useTablePref + useColumnReorder because
 * ParityTable then lacked ASC/DESC header-click sort and drag-resize/reorder chrome. COLUMN LAW
 * landed later the same day (ParityTable.tsx: enableColumnResize/enableColumnReorder/controlled
 * sort). GO-05 wave 1 converts both surfaces back onto ParityTable — this guard now checks the
 * CHROME CONTRACT (sortable columns, a stable storageKey, reorder not disabled, URL-persisted
 * sort), not the literal TableHeaderCell/useTablePref/useColumnReorder markup that chrome used to
 * require. A regression that drops the chrome — not just the old markup — still fails this guard.
 */

/** WorkOrdersConsole list + kanban must expose Dispatch-class header sort + column reorder/width. */
function assertConsoleHeaderSort(src) {
  const issues = [];
  if (!src.includes('tableTestId="work-orders-console-headers"')) {
    issues.push("list view must expose tableTestId=work-orders-console-headers (MAINT-05/GO-05)");
  }
  if (!/<ParityTable\b/.test(src)) {
    issues.push("WorkOrdersConsole list must render via ParityTable for ASC/DESC header sort + resize/reorder (MAINT-05/GO-05)");
  }
  if (/<ParityTable[\s\S]{0,600}enableColumnReorder=\{false\}/.test(src)) {
    issues.push("WorkOrdersConsole list must not disable ParityTable's drag-reorder (MAINT-05/GO-05)");
  }
  if (!src.includes('storageKey="work-orders-console-list"')) {
    issues.push("WorkOrdersConsole must persist column widths/order via a stable ParityTable storageKey (MAINT-05/GO-05)");
  }
  if (!/useUrlSort/.test(src) || !/onSortChange/.test(src)) {
    issues.push("WorkOrdersConsole must persist header sort via useUrlSort + ParityTable onSortChange (MAINT-05/GO-05)");
  }
  if (!src.includes('key: "unit_number"') || !/key:\s*"unit_number"[\s\S]{0,80}label:\s*"Unit"[\s\S]{0,80}sortable:\s*true/.test(src)) {
    issues.push("WorkOrdersConsole must render a sortable Unit column (MAINT-05/GO-05)");
  }
  if (!/key:\s*"display_id"[\s\S]{0,80}label:\s*"WO #"[\s\S]{0,80}sortable:\s*true/.test(src)) {
    issues.push("WorkOrdersConsole must render a sortable WO # column (MAINT-05/GO-05)");
  }
  if (!/key:\s*"opened_at"[\s\S]{0,80}label:\s*"Opened"[\s\S]{0,80}sortable:\s*true/.test(src)) {
    issues.push("WorkOrdersConsole must render a sortable Opened/date column (MAINT-05/GO-05)");
  }
  if (!src.includes("work-orders-console-kanban-sort-")) {
    issues.push("kanban columns must expose unit/WO # sort controls (MAINT-05)");
  }
  if (!/sortKanbanRows/.test(src)) {
    issues.push("kanban view must sort cards within each column (MAINT-05)");
  }
  return issues;
}

/** Maintenance home active-WO table must match Dispatch table chrome. */
function assertMaintActiveWoTable(src) {
  const issues = [];
  if (!src.includes('tableTestId="maint-active-work-orders-headers"')) {
    issues.push("WorkOrdersTable must expose tableTestId=maint-active-work-orders-headers (MAINT-05/GO-05)");
  }
  if (!/<ParityTable\b/.test(src)) {
    issues.push("WorkOrdersTable must render via ParityTable for ASC/DESC header sort + resize/reorder (MAINT-05/GO-05)");
  }
  if (/<ParityTable[\s\S]{0,600}enableColumnReorder=\{false\}/.test(src)) {
    issues.push("WorkOrdersTable must not disable ParityTable's drag-reorder (MAINT-05/GO-05)");
  }
  if (!src.includes('storageKey="maint-active-wos"')) {
    issues.push("WorkOrdersTable must persist column widths/order via a stable ParityTable storageKey (MAINT-05/GO-05)");
  }
  if (!/useUrlSort/.test(src) || !/onSortChange/.test(src)) {
    issues.push("WorkOrdersTable must persist header sort via useUrlSort + ParityTable onSortChange (MAINT-05/GO-05)");
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
    consoleSrc.replace('tableTestId="work-orders-console-headers"', 'tableTestId="work-orders-console-header-row"'),
    consoleSrc.replaceAll("<ParityTable", "<table"),
    consoleSrc.replaceAll('storageKey="work-orders-console-list"', 'storageKey="dispatch-board"'),
    consoleSrc.replace(
      '<ParityTable<WoConsoleRow>',
      '<ParityTable<WoConsoleRow>\n        enableColumnReorder={false}',
    ),
    consoleSrc.replaceAll("useUrlSort", "__RemovedUrlSort__"),
    consoleSrc.replace('label: "Unit"', 'label: "Unit Removed"'),
    consoleSrc.replace('label: "WO #"', 'label: "WO Number"'),
    consoleSrc.replace('key: "opened_at",\n        label: "Opened",\n        sortable: true,', 'key: "opened_at",\n        label: "Opened",\n        sortable: false,'),
    consoleSrc.replaceAll("work-orders-console-kanban-sort-", "removed-kanban-sort-"),
  ];
  if (!consoleMutants.every((mutant) => assertConsoleHeaderSort(mutant).length > 0)) {
    fail("selftest mutation escaped WorkOrdersConsole MAINT-05/GO-05 header-sort guard");
  }

  const maintMutants = [
    maintSrc.replace('tableTestId="maint-active-work-orders-headers"', 'tableTestId="maint-active-wo-header-row"'),
    maintSrc.replaceAll("<ParityTable", "<table"),
    maintSrc.replaceAll('storageKey="maint-active-wos"', 'storageKey="fleet-maint"'),
    maintSrc.replace('<ParityTable<WorkOrder>', '<ParityTable<WorkOrder>\n        enableColumnReorder={false}'),
    maintSrc.replaceAll("useUrlSort", "__RemovedUrlSort__"),
  ];
  if (!maintMutants.every((mutant) => assertMaintActiveWoTable(mutant).length > 0)) {
    fail("selftest mutation escaped WorkOrdersTable MAINT-05/GO-05 header-sort guard");
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
