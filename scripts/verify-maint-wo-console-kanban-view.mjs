#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx");
const SELF = path.join(ROOT, "scripts/verify-maint-wo-console-kanban-view.mjs");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function assertSource(src) {
  const readsView =
    src.includes('get("view") === "kanban"') ||
    /viewParam\s*===\s*["']kanban["']/.test(src) ||
    /toLowerCase\(\)[\s\S]{0,80}kanban/.test(src);
  if (!readsView) fail("must read ?view=kanban from searchParams (case-insensitive OK)");
  if (!src.includes("work-orders-console-kanban")) fail("missing data-testid work-orders-console-kanban");
  if (!src.includes("work-orders-console-kanban-tab")) fail("missing kanban tab testid");
  if (!src.includes("kanbanColumns")) fail("missing kanbanColumns grouping");
  if (!src.includes('set("view", "kanban")')) fail("must persist view=kanban in URL");
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
  const backup = good;
  fs.writeFileSync(
    TARGET,
    good
      .replaceAll("work-orders-console-kanban", "gone")
      .replaceAll('get("view") === "kanban"', 'get("view") === "never"'),
  );
  try {
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(TARGET, backup);
  }
  console.log("PASS: verify-maint-wo-console-kanban-view --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource(fs.readFileSync(TARGET, "utf8"));
  console.log("PASS: verify-maint-wo-console-kanban-view");
}
