#!/usr/bin/env node
/** @matrix-built {"modules":["tasks"],"cols":["reverse_link"],"leafRe":"^tasks\\.drawer\\.task$","task":"LINK-F5171-TASK-DRAWER-REVERSE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-task-drawer-reverse-links";
const PLANNER = "apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx";
const SUBJECT = "apps/frontend/src/components/tasks/TaskSubjectLink.tsx";

export function failures(files) {
  const found = [];
  if (!/<TaskSubjectLink subjectType=\{task\.subject_type\} subjectId=\{task\.subject_id\} \/>/.test(files.planner)) {
    found.push(`${PLANNER}: drawer must preserve its typed subject reverse drill`);
  }
  if (!/<EntityLink[\s\S]{0,100}kind="task"[\s\S]{0,100}id=\{task\.task_id\}/.test(files.planner)) {
    found.push(`${PLANNER}: drawer must preserve the exact task activity drill`);
  }
  if (!/load: "load"/.test(files.subject)) {
    found.push(`${SUBJECT}: load subjects must resolve through canonical EntityLink kind=load`);
  }
  if (!/<EntityLink kind=\{kind\} id=\{subjectId\}/.test(files.subject)) {
    found.push(`${SUBJECT}: supported subjects must render their canonical EntityLink`);
  }
  return found;
}

const current = {
  planner: fs.readFileSync(PLANNER, "utf8"),
  subject: fs.readFileSync(SUBJECT, "utf8"),
};

if (process.argv.includes("--selftest")) {
  if (failures(current).length) {
    console.error(`${LABEL} SELFTEST FAIL — repository baseline is red`);
    process.exit(1);
  }
  const mutations = [
    { ...current, planner: current.planner.replace("<TaskSubjectLink subjectType={task.subject_type} subjectId={task.subject_id} />", "<span>subject</span>") },
    { ...current, planner: current.planner.replace('kind="task"', 'kind="audit_event"') },
    { ...current, subject: current.subject.replace('load: "load"', 'load: "task"') },
    { ...current, subject: current.subject.replace("<EntityLink kind={kind} id={subjectId}", "<EntityLink kind=\"task\" id={subjectId}") },
  ];
  mutations.forEach((mutation, index) => {
    if (!failures(mutation).length) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${index + 1} escaped`);
      process.exit(1);
    }
  });
  console.log(`${LABEL} SELFTEST PASS — four drawer/subject regressions detected`);
  process.exit(0);
}

const found = failures(current);
if (found.length) {
  console.error(`${LABEL} FAIL\n- ${found.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — task drawer drills to exact task activity and canonical typed subject`);
