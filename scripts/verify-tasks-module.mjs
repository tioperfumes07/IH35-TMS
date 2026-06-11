#!/usr/bin/env node
/**
 * Guard: verify-tasks-module.mjs
 * Validates W1B-TASKS-MODULE files are present and correctly wired.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function expectFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
  }
}

function expectContains(relativePath, pattern, label) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
    return;
  }
  const text = fs.readFileSync(absolutePath, "utf8");
  if (!pattern.test(text)) {
    failures.push(`${relativePath}: missing ${label}`);
  }
}

function expectNotContains(relativePath, pattern, label) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const text = fs.readFileSync(absolutePath, "utf8");
  if (pattern.test(text)) {
    failures.push(`${relativePath}: contains forbidden pattern — ${label}`);
  }
}

// 1. Migration file present
expectFile("apps/backend/migrations/0169_w1b_tasks_module.sql");

// 2. Schema grants in db/migrations
expectFile("db/migrations/202606111100_w1b_tasks_schema_grants.sql");
expectContains(
  "db/migrations/202606111100_w1b_tasks_schema_grants.sql",
  /GRANT\s+USAGE\s+ON\s+SCHEMA\s+tasks\s+TO\s+ih35_app/i,
  "GRANT USAGE ON SCHEMA tasks TO ih35_app"
);

// 3. Migration has required tables
expectContains(
  "apps/backend/migrations/0169_w1b_tasks_module.sql",
  /create\s+table\s+tasks\.task/i,
  "tasks.task table"
);
expectContains(
  "apps/backend/migrations/0169_w1b_tasks_module.sql",
  /enable\s+row\s+level\s+security/i,
  "RLS on tasks.task"
);
expectContains(
  "apps/backend/migrations/0169_w1b_tasks_module.sql",
  /events\.log_event/i,
  "spine event logging"
);

// 4. Routes file present
expectFile("apps/backend/src/tasks/task.routes.ts");
expectContains(
  "apps/backend/src/tasks/task.routes.ts",
  /tasks\.task/i,
  "tasks.task reference"
);

// 5. No financial writes in migration
expectNotContains(
  "apps/backend/migrations/0169_w1b_tasks_module.sql",
  /insert\s+into\s+accounting/i,
  "insert into accounting"
);

// 6. CI wired
expectContains("package.json", /"verify:tasks-module"\s*:/, "verify:tasks-module script");
expectContains(".github/workflows/ci.yml", /verify:tasks-module/, "CI gate step");

// Report
if (failures.length > 0) {
  console.error("verify:tasks-module FAIL");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("verify:tasks-module PASS");
