#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","tasks"],"cols":["load"],"leafRe":"^(accounting\\.panel\\.leakage|tasks\\.drawer\\.task)$","task":"WAVE-A-LOAD-INLINE-SURFACES"} */
import fs from "node:fs";
const revenue=fs.readFileSync("apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx","utf8");
const task=fs.readFileSync("apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx","utf8");
const subject=fs.readFileSync("apps/frontend/src/components/tasks/TaskSubjectLink.tsx","utf8");
const fail=(r,t,s)=>[
 ["leakage load drill",r.includes('<EntityLink kind="load" id={row.load_id}')],
 ["drawer subject mounted",t.includes('<TaskSubjectLink subjectType={task.subject_type} subjectId={task.subject_id} />')],
 ["subject maps load",s.includes('load: "load"')],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){if(!fail(revenue,task,subject.replace('load: "load"','load: "broken"')).includes("subject maps load"))process.exit(1);console.log("verify-load-inline-surface-linkage selftest PASS — load mapping mutation red");}
const missing=fail(revenue,task,subject);if(missing.length){console.error(`verify-load-inline-surface-linkage FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-load-inline-surface-linkage PASS — leakage + task drawer load drills");
