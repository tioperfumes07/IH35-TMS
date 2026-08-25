#!/usr/bin/env node
import { readFileSync } from "node:fs";

const original = readFileSync("apps/backend/src/tasks/task-alarm.job.ts", "utf8");

function violations(source) {
  const failures = [];
  const required = [
    ["FOR UPDATE SKIP LOCKED", "due task row lock"],
    ['client.query("SAVEPOINT task_alarm_item")', "per-task savepoint"],
    ["AND operating_company_id = $2::uuid", "company-scoped stamp"],
    ["AND operating_company_id = $2::uuid\n              AND alarm_notified_at IS NULL", "company-scoped compare-and-set stamp"],
    ["RETURNING task_id::text", "stamp result proof"],
    ["if (!stamped.rows[0]) throw new Error", "lost-stamp rollback gate"],
    ['client.query("ROLLBACK TO SAVEPOINT task_alarm_item")', "partial-write rollback"],
    ['client.query("RELEASE SAVEPOINT task_alarm_item")', "savepoint release"],
  ];
  for (const [needle, label] of required) if (!source.includes(needle)) failures.push(`missing ${label}`);
  if ((source.match(/RELEASE SAVEPOINT task_alarm_item/g) ?? []).length < 2) failures.push("missing success/error savepoint release");
  if (/catch\s*\{\s*\/\/ best-effort per task/.test(source)) failures.push("partial notification is still swallowed without rollback");
  return failures;
}

const mutations = [
  "FOR UPDATE SKIP LOCKED",
  'client.query("SAVEPOINT task_alarm_item")',
  "AND operating_company_id = $2::uuid",
  "AND operating_company_id = $2::uuid\n              AND alarm_notified_at IS NULL",
  "RETURNING task_id::text",
  "if (!stamped.rows[0]) throw new Error",
  'client.query("ROLLBACK TO SAVEPOINT task_alarm_item")',
  'await client.query("RELEASE SAVEPOINT task_alarm_item");\n        fired++',
  'await client.query("RELEASE SAVEPOINT task_alarm_item");\n        // Per-task rollback',
];

if (process.argv.includes("--selftest")) {
  if (violations(original).length) process.exit(1);
  let caught = 0;
  for (const needle of mutations) {
    const mutated = original.replace(needle, "");
    if (mutated === original) process.exit(1);
    if (violations(mutated).length) caught += 1;
  }
  if (caught !== mutations.length) process.exit(1);
  console.log(`verify:task-alarm-atomic-delivery SELFTEST PASS (${caught}/${mutations.length})`);
  process.exit(0);
}

const failures = violations(original);
if (failures.length) {
  console.error(`verify:task-alarm-atomic-delivery FAIL: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify:task-alarm-atomic-delivery PASS");
