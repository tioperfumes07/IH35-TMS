#!/usr/bin/env node
/** TASKS-PLANNER-V2-CONNECTIVITY — polymorphic task-link contract + mutation proof. */
import fs from "node:fs";
import process from "node:process";

const LABEL = "verify-task-link-contract";
const MIGRATION = "db/migrations/202607031700_tasks_connectivity.sql";
const ROUTES = "apps/backend/src/tasks/task.routes.ts";
const checks = [
  ["migration", /CREATE TABLE IF NOT EXISTS\s+tasks\.task_link/i, "creates tasks.task_link"],
  ["migration", /role\s+text[\s\S]{0,120}CHECK\s*\(\s*role\s+IN\s*\(\s*'about'\s*,\s*'result'\s*\)/i, "role is about/result"],
  ...["vendor", "customer", "expense", "bill", "bill_payment", "policy", "work_order"].map((kind) => ["migration", new RegExp(`'${kind}'`), `target kind ${kind}`]),
  ["migration", /ALTER TABLE\s+tasks\.task_link\s+ENABLE ROW LEVEL SECURITY/i, "enables RLS"],
  ["migration", /ALTER TABLE\s+tasks\.task_link\s+FORCE ROW LEVEL SECURITY/i, "forces RLS"],
  ["migration", /CREATE INDEX IF NOT EXISTS\s+\w+\s+ON\s+tasks\.task_link\s*\(\s*target_type\s*,\s*target_id\s*\)/i, "reverse target index"],
  ["migration", /voided_at\s+timestamptz/i, "void-not-delete column"],
  ["migration", /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s+ON\s+tasks\.task_link\s+TO\s+ih35_app/i, "least-privilege grant"],
  ["routes", /\/:id\/links/, "task links endpoint"],
  ["routes", /INSERT INTO tasks\.task_link/i, "task link writer"],
  ["routes", /role\s*===?\s*["']result["']/, "result completion trigger"],
  ["routes", /status\s*=\s*'completed'/i, "completed status writer"],
  ["routes", /tasks\.task_link tl[\s\S]{0,200}target_type/i, "reverse target lookup"],
];

function readSources(root = process.cwd()) {
  return { migration: fs.readFileSync(`${root}/${MIGRATION}`, "utf8"), routes: fs.readFileSync(`${root}/${ROUTES}`, "utf8") };
}

export function run(sources = readSources()) {
  const errors = checks.filter(([source, pattern]) => !pattern.test(sources[source] ?? "")).map(([, , message]) => message);
  if (/GRANT\s+[^;]*\bDELETE\b[^;]*\bON\b[^;]*tasks\.task_link/i.test(sources.migration ?? "")) errors.push("DELETE grant forbidden");
  const targetIdLine = (sources.migration ?? "").split(/\r?\n/).find((line) => /^\s*target_id\s+uuid/i.test(line)) ?? "";
  if (/REFERENCES/i.test(targetIdLine)) errors.push("polymorphic target_id hard FK forbidden");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  const baseline = run(live);
  if (baseline.length) throw new Error(`production baseline failed: ${baseline.join("; ")}`);
  let rejected = 0;
  for (const [source, pattern, message] of checks) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const planted = live[source].replace(new RegExp(pattern.source, flags), "/* planted task-link defect */");
    if (planted === live[source] || !run({ ...live, [source]: planted }).includes(message)) throw new Error(`mutation escaped: ${message}`);
    rejected += 1;
  }
  const deletePlant = `${live.migration}\nGRANT DELETE ON tasks.task_link TO ih35_app;`;
  if (!run({ ...live, migration: deletePlant }).includes("DELETE grant forbidden")) throw new Error("mutation escaped: DELETE grant");
  rejected += 1;
  const fkPlant = live.migration.replace(/^(\s*target_id\s+uuid[^,]*)(,?)/im, "$1 REFERENCES tasks.task(id)$2");
  if (fkPlant === live.migration || !run({ ...live, migration: fkPlant }).includes("polymorphic target_id hard FK forbidden")) throw new Error("mutation escaped: target hard FK");
  rejected += 1;
  console.log(`[${LABEL}] SELFTEST PASS — ${rejected}/${checks.length + 2} production defects rejected.`);
} else {
  const errors = run();
  if (errors.length) {
    console.error(`[${LABEL}] FAIL — task-link contract drift:\n${errors.map((error) => `  ✗ ${error}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — tasks.task_link polymorphic contract + completion path intact.`);
}
