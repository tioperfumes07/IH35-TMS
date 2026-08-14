#!/usr/bin/env node
/** @matrix-built {"modules":["inventory","tasks"],"cols":["reverse_link"],"leafRe":"^(assignments\.wo_link|tasks\.drawer\.task)$","task":"VERTICAL-REVERSE-LINK-EXISTING-FK-DRILLS"} */
import fs from "node:fs";
const inventory=fs.readFileSync("apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx","utf8");
const tasks=fs.readFileSync("apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx","utf8");
const chat=fs.readFileSync("apps/frontend/src/pages/tasks/TasksChatPage.tsx","utf8");
const routes=fs.readFileSync("apps/frontend/src/routes/manifest.tsx","utf8");
const failures=(inv=inventory,task=tasks)=>[
 ["inventory work-order FK",inv.includes('kind="work_order"')&&inv.includes("id={row.work_order_id}")],
 ["inventory human label",inv.includes("row.work_order_display_id")&&inv.includes("entityLabel(")],
 ["task activity drill",task.includes('to={`/tasks/chat?taskId=${encodeURIComponent(task.task_id)}`}')],
 ["task route mounted",routes.includes('path="/tasks/chat"')],
 ["task param consumed",chat.includes('searchParams.get("taskId")')&&chat.includes("fetchTaskActivity(activeTaskId)")],
].filter(([,ok])=>!ok).map(([name])=>name);
if(process.argv.includes("--selftest")){const inv=inventory.replace('kind="work_order"','kind="work_order_broken"');const task=tasks.replace("encodeURIComponent(task.task_id)","encodeURIComponent('broken')");const a=failures(inv,tasks),b=failures(inventory,task);if(!a.includes("inventory work-order FK")||!b.includes("task activity drill"))process.exit(1);console.log("verify-existing-fk-reverse-drills selftest PASS — 2/2 mutations red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-existing-fk-reverse-drills FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-existing-fk-reverse-drills PASS — inventory WO + task activity reverse drills");
