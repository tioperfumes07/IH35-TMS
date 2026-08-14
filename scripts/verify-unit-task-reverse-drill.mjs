#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\.detail\.tasks$","task":"VERTICAL-REVERSE-LINK-UNIT-TASKS"} */
import fs from "node:fs";
const source=fs.readFileSync("apps/frontend/src/components/tasks/TasksTab.tsx","utf8");
const expected='/tasks/chat?taskId=${encodeURIComponent(t.task_id)}';
if(process.argv.includes("--selftest")){if(source.replace(expected,"/tasks").includes(expected))process.exit(1);console.log("verify-unit-task-reverse-drill selftest PASS — exact-task mutation red");process.exit(0);}
if(!source.includes(expected)){console.error("verify-unit-task-reverse-drill FAIL — linked entity task rows must open exact task activity");process.exit(1);}
console.log("verify-unit-task-reverse-drill PASS — unit task rows open exact task activity");
