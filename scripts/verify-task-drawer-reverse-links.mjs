#!/usr/bin/env node
/** @matrix-built {"modules":["tasks"],"cols":["reverse_link"],"leafRe":"^tasks\\.drawer\\.task$","task":"LINK-F5171-TASK-DRAWER-REVERSE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-task-drawer-reverse-links";
const PLANNER = "apps/frontend/src/pages/tasks/TaskPlannerGrid.tsx";
const SUBJECT = "apps/frontend/src/components/tasks/TaskSubjectLink.tsx";
const MINE = "apps/frontend/src/pages/tasks/TasksMinePage.tsx";
const CALENDAR = "apps/frontend/src/pages/tasks/TasksCalendarPage.tsx";
const API = "apps/frontend/src/api/tasks.ts";
const ROUTES = "apps/backend/src/tasks/task.routes.ts";

export function failures(files) {
  const found = [];
  if (!/<TaskSubjectLink subjectType=\{task\.subject_type\} subjectId=\{task\.subject_id\} subjectLabel=\{task\.subject_label\} \/>/.test(files.planner)) {
    found.push(`${PLANNER}: drawer must preserve its typed and human-labeled subject reverse drill`);
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
  if (!/maintenance_order: "work_order"/.test(files.subject)) found.push(`${SUBJECT}: canonical maintenance_order subjects must use the work-order route`);
  if (!/entityLabel\(subjectLabel, subjectId, subjectType\)/.test(files.subject)) found.push(`${SUBJECT}: subject EntityLink must consume the resolved human label`);
  if (!/subject_label: string \| null/.test(files.api)) found.push(`${API}: task contract must type subject_label`);
  for (const [file, source, row] of [[MINE, files.mine, "row"], [CALENDAR, files.calendar, "t"]]) {
    if (!new RegExp(`subjectLabel=\\{${row}\\.subject_label\\}`).test(source)) found.push(`${file}: mounted consumer must forward subject_label`);
  }
  if ((files.routes.match(/END AS subject_label/g) ?? []).length < 2) found.push(`${ROUTES}: list and planner must both project subject_label`);
  for (const scope of [
    /subject_load\.operating_company_id = t\.operating_company_id/,
    /COALESCE\(subject_unit\.currently_leased_to_company_id, subject_unit\.owner_company_id\) = t\.operating_company_id/,
    /subject_driver\.operating_company_id = t\.operating_company_id/,
    /subject_customer\.operating_company_id = t\.operating_company_id/,
    /subject_wo\.operating_company_id = t\.operating_company_id/,
  ]) if ((files.routes.match(new RegExp(scope.source, "g")) ?? []).length < 2) found.push(`${ROUTES}: both reads must retain subject label scope ${scope}`);
  return found;
}

const current = {
  planner: fs.readFileSync(PLANNER, "utf8"),
  subject: fs.readFileSync(SUBJECT, "utf8"),
  mine: fs.readFileSync(MINE, "utf8"),
  calendar: fs.readFileSync(CALENDAR, "utf8"),
  api: fs.readFileSync(API, "utf8"),
  routes: fs.readFileSync(ROUTES, "utf8"),
};

if (process.argv.includes("--selftest")) {
  if (failures(current).length) {
    console.error(`${LABEL} SELFTEST FAIL — repository baseline is red`);
    process.exit(1);
  }
  const mutations = [
    { ...current, planner: current.planner.replace("<TaskSubjectLink subjectType={task.subject_type} subjectId={task.subject_id} subjectLabel={task.subject_label} />", "<span>subject</span>") },
    { ...current, planner: current.planner.replace('kind="task"', 'kind="audit_event"') },
    { ...current, subject: current.subject.replace('load: "load"', 'load: "task"') },
    { ...current, subject: current.subject.replace("<EntityLink kind={kind} id={subjectId}", "<EntityLink kind=\"task\" id={subjectId}") },
    { ...current, subject: current.subject.replace('maintenance_order: "work_order"', 'maintenance_order: "task"') },
    { ...current, subject: current.subject.replace("entityLabel(subjectLabel, subjectId, subjectType)", "entityLabel(null, subjectId, subjectType)") },
    { ...current, api: current.api.replace("subject_label: string | null", "subject_label?: string | null") },
    { ...current, mine: current.mine.replace("subjectLabel={row.subject_label}", "subjectLabel={null}") },
    { ...current, calendar: current.calendar.replace("subjectLabel={t.subject_label}", "subjectLabel={null}") },
    { ...current, routes: current.routes.replace("END AS subject_label", "END AS missing_subject_label") },
    { ...current, routes: current.routes.replace(/subject_customer\.operating_company_id = t\.operating_company_id/g, "TRUE") },
  ];
  mutations.forEach((mutation, index) => {
    if (!failures(mutation).length) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${index + 1} escaped`);
      process.exit(1);
    }
  });
  console.log(`${LABEL} SELFTEST PASS — eleven drawer/subject label regressions detected`);
  process.exit(0);
}

const found = failures(current);
if (found.length) {
  console.error(`${LABEL} FAIL\n- ${found.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — task drawer drills to exact task activity and canonical typed subject`);
