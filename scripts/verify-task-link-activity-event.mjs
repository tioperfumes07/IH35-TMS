#!/usr/bin/env node
/** Ratchet the canonical task-link activity event across schema, writer, and reader. */
import fs from "node:fs";
import process from "node:process";

const migrationPath = "db/migrations/202612900100_tasks_activity_link_added_event.sql";
const routePath = "apps/backend/src/tasks/task.routes.ts";
const pagePath = "apps/frontend/src/pages/tasks/TasksChatPage.tsx";
const apiPath = "apps/frontend/src/api/tasks.ts";

let migration = fs.readFileSync(migrationPath, "utf8");
let routes = fs.readFileSync(routePath, "utf8");
let page = fs.readFileSync(pagePath, "utf8");
let api = fs.readFileSync(apiPath, "utf8");

if (process.argv.includes("--selftest")) {
  migration = migration.replace(/,\s*'link_added'/, "");
}

const failures = [];
if (!/CHECK\s*\(event_type\s+IN\s*\([\s\S]*'link_added'[\s\S]*\)\)/m.test(migration)) {
  failures.push("tasks.task_activity constraint must admit link_added");
}
if ((routes.match(/'link_added'/g) ?? []).length < 2) {
  failures.push("both task create and add-link paths must append link_added");
}
if (!/a\.event_type\s*===\s*"link_added"[\s\S]{0,100}"linked a record"/.test(page)) {
  failures.push("task activity UI must label link_added honestly");
}
if (!/event_type:\s*[^;]*"link_added"/.test(api)) {
  failures.push("TaskActivity type must include link_added");
}

if (failures.length) {
  console.error("verify-task-link-activity-event FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(process.argv.includes("--selftest") ? 0 : 1);
}
if (process.argv.includes("--selftest")) {
  console.error("verify-task-link-activity-event SELFTEST FAIL: planted defect was not detected");
  process.exit(1);
}
console.log("verify-task-link-activity-event PASS");
