#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","tasks"],"cols":["connectivity"],"leafRe":"^(dispatch\\.modal\\.save_load_template|tasks\\.drawer\\.task)$","task":"VERTICAL-CONNECTIVITY-INLINE-ROUTES"} */
import fs from "node:fs";
const dispatch=JSON.parse(fs.readFileSync("docs/specs/scoreboard/modules/dispatch.required.json","utf8"));
const tasks=JSON.parse(fs.readFileSync("docs/specs/scoreboard/modules/tasks.required.json","utf8"));
const manifest=fs.readFileSync("apps/frontend/src/routes/manifest.tsx","utf8");
const drawer=fs.readFileSync("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx","utf8");
const taskPage=fs.readFileSync("apps/frontend/src/pages/tasks/TaskBoardPage.tsx","utf8");
const route=(m,id)=>m.leaves.find(l=>l.id===id)?.route_hint;
const failures=(d=dispatch,t=tasks)=>[
 ["save template embedded surface",route(d,"dispatch.modal.save_load_template")==="surface://pages/dispatch/LoadTemplateLibrary.tsx"],
 ["save modal mounted in load drawer",drawer.includes("<SaveLoadTemplateModal")],
 ["task drawer route",route(t,"tasks.drawer.task")==="/tasks"],
 ["tasks route mounted",manifest.includes('path="/tasks"')],
 ["planner grid mounted on task page",taskPage.includes("<TaskPlannerGrid />")],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){const t=structuredClone(tasks);t.leaves.find(l=>l.id==="tasks.drawer.task").route_hint="/tasks/planner";if(!failures(dispatch,t).includes("task drawer route"))process.exit(1);console.log("verify-inline-surface-connectivity-routes selftest PASS — dead route mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-inline-surface-connectivity-routes FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-inline-surface-connectivity-routes PASS — embedded save modal and task drawer resolve through real mounts");
