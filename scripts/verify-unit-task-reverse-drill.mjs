#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.detail.tasks"],"task":"FLEET-F5907-CURRENT-LOAD-TASKS-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
const source = fs.readFileSync("apps/frontend/src/components/tasks/TasksTab.tsx", "utf8");
const entityLink = fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8");
const matrixSource = fs.readFileSync("docs/specs/scoreboard/modules/fleet.required.json", "utf8");
const feedSource = fs.readFileSync("docs/specs/scoreboard/wire-sprint-built.json", "utf8");
const selfSource = fs.readFileSync("scripts/verify-unit-task-reverse-drill.mjs", "utf8");
const expectedKind = 'kind="task"';
const expectedId = "id={t.task_id}";
const HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.detail.tasks"],"task":"FLEET-F5907-CURRENT-LOAD-TASKS-REVERSE-EXACT","vertical":"class-sweep"} */';
const mutateTaskLeaf = (text, mutate) => {
  const parsed = JSON.parse(text);
  const leaf = parsed.leaves.find((row) => row.id === "unit.detail.tasks");
  mutate(leaf);
  return JSON.stringify(parsed);
};
function failures(files) {
  const found = [];
  if (!files.source.includes(expectedKind) || !files.source.includes(expectedId) || !/case "task":[\s\S]*?\/tasks\/chat\?taskId=/.test(files.entityLink)) found.push("linked entity task rows must open exact task activity");
  let matrix;
  try { matrix = JSON.parse(files.matrix); } catch (error) { found.push(`Fleet matrix parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((row) => row.id === "unit.detail.tasks");
  if (!leaf?.required?.includes("reverse_link")) found.push("unit.detail.tasks must require reverse_link");
  if (leaf?.route_hint !== "/fleet/units/:id/detail?tab=tasks") found.push("unit.detail.tasks must name mounted route /fleet/units/:id/detail?tab=tasks");
  if (!files.self.split('import fs from "node:fs";')[0].includes(HEADER)) found.push("exact Fleet unit-tasks header missing");
  try { if (JSON.parse(files.feed).entries?.some((entry) => entry.guard === "scripts/verify-unit-task-reverse-drill.mjs")) found.push("manual feed duplicates Fleet unit-tasks ownership"); }
  catch (error) { found.push(`feed parse: ${error.message}`); }
  return found;
}
const current = { source, entityLink, matrix: matrixSource, feed: feedSource, self: selfSource };
if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...current, source: source.replace(expectedKind, 'kind="load"') },
    { ...current, matrix: mutateTaskLeaf(matrixSource, (leaf) => { leaf.id += ".broken"; }) },
    { ...current, matrix: mutateTaskLeaf(matrixSource, (leaf) => { leaf.required = leaf.required.filter((col) => col !== "reverse_link"); }) },
    { ...current, matrix: mutateTaskLeaf(matrixSource, (leaf) => { leaf.route_hint = "/broken"; }) },
    { ...current, self: selfSource.replace(HEADER, HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) },
    { ...current, feed: JSON.stringify({ entries: [{ guard: "scripts/verify-unit-task-reverse-drill.mjs" }] }) },
  ];
  mutations.forEach((mutation, index) => { if (!failures(mutation).length) { console.error(`verify-unit-task-reverse-drill selftest FAIL — mutation ${index + 1} escaped`); process.exit(1); } });
  console.log(`verify-unit-task-reverse-drill selftest PASS — ${mutations.length}/${mutations.length} runtime/evidence mutations red`);
  process.exit(0);
}
const found = failures(current);
if (found.length) {
  console.error(`verify-unit-task-reverse-drill FAIL — ${found.join("; ")}`);
  process.exit(1);
}
console.log("verify-unit-task-reverse-drill PASS — unit task rows open exact task activity");
