#!/usr/bin/env node
// ROUND 326 audit M2 (CC-1) — ONE PM-DUE EVALUATOR. The PM auto engine was miles-only (maintenance.pm_schedules had no
// last-service date), so a days PM never auto-created a work order, while the UI judged the same PM by date
// (evaluatePmDue); and a completed PM work order never advanced its schedule, so the engine re-minted it. Fails if:
//   1. the engine stops judging a days PM through evaluatePmDue (pmScheduleDueInput);
//   2. completing a work order stops advancing its PM schedule (both status routes);
//   3. the service-history backfill stops stamping last_service_date.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-pm-due-evaluator";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  engine: "apps/backend/src/maintenance/pm-auto-engine.service.ts",
  routes: "apps/backend/src/maintenance/work-orders.routes.ts",
  backfill: "apps/backend/src/maintenance/service-history-backfill.routes.ts",
};

export function problems(src) {
  const p = [];
  if (!/if \(schedule\.interval_kind === "days"\) \{[\s\S]{0,900}evaluatePmDue\(pmScheduleDueInput\(schedule\), null\)/.test(src.engine)) p.push("the PM engine must judge a days PM through evaluatePmDue (the UI's evaluator)");
  if (!/export async function advancePmScheduleOnWorkOrderComplete/.test(src.engine) || !/SET last_service_date = \$3::date/.test(src.engine)) p.push("a completed PM work order must advance its schedule (last_service_date)");
  if ((src.routes.match(/if \(parsed\.data\.new_status === "complete"\) await advancePmScheduleOnWorkOrderComplete\(/g) ?? []).length < 2) p.push("both work-order status routes must advance the PM schedule on complete");
  if (!/last_service_date = \$4::date/.test(src.backfill)) p.push("the service-history backfill must stamp last_service_date");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["miles-only again", { ...src, engine: src.engine.replace("evaluatePmDue(pmScheduleDueInput(schedule), null)", "({ is_due: false } as never)") }],
      ["no advance on complete", { ...src, routes: src.routes.replaceAll('if (parsed.data.new_status === "complete") await advancePmScheduleOnWorkOrderComplete(', "void (") }],
      ["backfill no date", { ...src, backfill: src.backfill.replace("last_service_date = $4::date", "last_service_odometer = $1") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — days PMs judged by evaluatePmDue, completed PM work orders advance their schedule, backfill stamps the date.`);
}
