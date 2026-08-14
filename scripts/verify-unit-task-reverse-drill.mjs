#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\.detail\.tasks$","task":"VERTICAL-REVERSE-LINK-UNIT-TASKS"} */
import fs from "node:fs";
const source = fs.readFileSync("apps/frontend/src/components/tasks/TasksTab.tsx", "utf8");
const entityLink = fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8");
const expectedKind = 'kind="task"';
const expectedId = "id={t.task_id}";
if (process.argv.includes("--selftest")) {
  if (source.replace(expectedKind, 'kind="load"').includes(expectedKind)) process.exit(1);
  console.log("verify-unit-task-reverse-drill selftest PASS — exact-task mutation red");
  process.exit(0);
}
if (!source.includes(expectedKind) || !source.includes(expectedId) || !/case "task":[\s\S]*?\/tasks\/chat\?taskId=/.test(entityLink)) {
  console.error("verify-unit-task-reverse-drill FAIL — linked entity task rows must open exact task activity");
  process.exit(1);
}
console.log("verify-unit-task-reverse-drill PASS — unit task rows open exact task activity");
