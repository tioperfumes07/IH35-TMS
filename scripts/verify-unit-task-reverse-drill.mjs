#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\\.detail\\.tasks$","task":"VERTICAL-REVERSE-LINK-UNIT-TASKS"} */
import fs from "node:fs";

const sources = {
  tab: fs.readFileSync("apps/frontend/src/components/tasks/TasksTab.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
  matrix: fs.readFileSync("docs/specs/scoreboard/modules/fleet.required.json", "utf8"),
};

function failures(candidate) {
  const missing = [];
  if (!candidate.tab.includes('kind="task"')) missing.push("canonical task kind");
  if (!candidate.tab.includes("id={t.task_id}")) missing.push("exact task id");
  if (!/case "task":[\s\S]*?\/tasks\/chat\?taskId=/.test(candidate.entityLink)) missing.push("mounted task resolver");
  try {
    const leaf = JSON.parse(candidate.matrix).leaves?.find((item) => item.id === "unit.detail.tasks");
    if (!leaf?.required?.includes("reverse_link")) missing.push("exact unit tasks leaf owns reverse_link");
  } catch {
    missing.push("fleet Required matrix parses");
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["tab", 'kind="task"', 'kind="load"', "canonical task kind"],
    ["tab", "id={t.task_id}", "id={t.id}", "exact task id"],
    ["entityLink", 'case "task":', 'case "task_removed":', "mounted task resolver"],
    ["matrix", '"id": "unit.detail.tasks"', '"id": "unit.detail.tasks.removed"', "exact unit tasks leaf owns reverse_link"],
  ];
  for (const [key, needle, replacement, expected] of mutations) {
    const mutant = { ...sources, [key]: sources[key].replace(needle, replacement) };
    if (mutant[key] === sources[key]) throw new Error(`fixture drifted: ${expected}`);
    if (!failures(mutant).includes(expected)) throw new Error(`mutation escaped: ${expected}`);
  }
  console.log(`verify-unit-task-reverse-drill SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects caught`);
  process.exit(0);
}

const missing = failures(sources);
if (missing.length) {
  console.error(`verify-unit-task-reverse-drill FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-unit-task-reverse-drill PASS — exact fleet unit task leaf opens canonical task activity");
