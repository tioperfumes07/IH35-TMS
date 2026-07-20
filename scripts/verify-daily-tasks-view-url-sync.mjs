#!/usr/bin/env node
/**
 * verify-daily-tasks-view-url-sync.mjs — Ops F: Daily Tasks views use ?view=.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-daily-tasks-view-url-sync";
const PAGE = "apps/frontend/src/pages/daily-tasks/DailyTasksPage.tsx";

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  for (const needle of ["useSearchParams", 'searchParams.get("view")', "parseDailyTasksView", 'params.set("view", next)']) {
    if (!source.includes(needle)) throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${PAGE}`);
  }
  if (source.includes('useState<TaskViewId>("my")')) {
    throw new Error(`${LABEL}: local view useState still present in ${PAGE}`);
  }
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) console.log(`${LABEL}: selftest PASS`);
else run();
