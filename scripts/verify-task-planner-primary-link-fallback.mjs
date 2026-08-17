#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/tasks/task.routes.ts";
const source = fs.readFileSync(file, "utf8");

function verify(text) {
  const failures = [];
  const need = (pattern, message) => {
    if (!pattern.test(text)) failures.push(message);
  };

  need(/LEFT JOIN LATERAL \([\s\S]*FROM tasks\.task_link tl[\s\S]*tl\.role = 'about'[\s\S]*LIMIT 1[\s\S]*\) primary_link ON t\.subject_id IS NULL/, "planner must fall back to the first company-scoped about task_link for legacy link-only tasks");
  need(/COALESCE\(t\.subject_type, primary_link\.subject_type\) AS subject_type/, "planner must return the effective subject type");
  need(/COALESCE\(t\.subject_id, primary_link\.subject_id\) AS subject_id/, "planner must return the effective subject id");
  need(/const primaryAboutLink = input\.links\?\.find\([\s\S]*link\.role === "about"[\s\S]*const subjectType = input\.subject_type \?\? linkedSubjectType \?\? null;[\s\S]*const subjectId = input\.subject_id \?\? primaryAboutLink\?\.target_id \?\? null;/, "create must stamp legacy subject columns from the canonical about link");
  need(/input\.priority, subjectType, subjectId, input\.estimated_minutes/, "INSERT must persist the resolved subject pair");
  need(/tl\.operating_company_id = t\.operating_company_id/, "legacy fallback must remain explicitly company scoped");
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(`verify-task-planner-primary-link-fallback FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("tl.role = 'about'", "tl.role = 'result'"),
    source.replace("tl.operating_company_id = t.operating_company_id", "TRUE"),
    source.replace("input.priority, subjectType, subjectId, input.estimated_minutes", "input.priority, input.subject_type ?? null, input.subject_id ?? null, input.estimated_minutes"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (verify(mutation).length === 0) {
      console.error(`verify-task-planner-primary-link-fallback SELFTEST FAILED: mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }
  console.log("verify-task-planner-primary-link-fallback SELFTEST PASS — planted link-role, entity-scope, and create-stamp defects rejected");
}

console.log("verify-task-planner-primary-link-fallback PASS — create and legacy planner rows expose the canonical linked subject");
