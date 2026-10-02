#!/usr/bin/env node
// ROUND 326 audit M1 (CC-1) — ONE WORK-ORDER CREATOR. 18 files inserted maintenance.work_orders directly, each with its
// own display id / status-history / audit shape. The creator is createWorkOrderWithLines (two-section-service.ts:
// display id, opening status history, audit). Shrink-only: a file not in REMAINING_DIRECT may never insert a work
// order directly; the repointed automatic creators (PM engine, DTC, engine fault) must create through the creator.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-work-order-single-creator";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATOR = "apps/backend/src/maintenance/two-section-service.ts";
// Still inserting directly (2026-10-02) — to be repointed; this list may only SHRINK.
export const REMAINING_DIRECT = new Set([
  "apps/backend/src/integrations/samsara/fault-code-processor.service.ts",
  "apps/backend/src/maintenance/arriving-soon.routes.ts",
  "apps/backend/src/maintenance/defects.routes.ts",
  "apps/backend/src/maintenance/pm-schedule.routes.ts",
  "apps/backend/src/maintenance/pre-flight-dvir.routes.ts",
  "apps/backend/src/maintenance/pre-flight/dvir-routing.service.ts",
  "apps/backend/src/maintenance/predictive-alerts.routes.ts",
  "apps/backend/src/maintenance/service-history-backfill.routes.ts",
  "apps/backend/src/maintenance/triage.routes.ts",
  "apps/backend/src/maintenance/work-orders.routes.ts",
  "apps/backend/src/safety/dvir-submit.service.ts",
  "apps/backend/src/safety/incidents/auto-workflow-trigger.ts",
  "apps/backend/src/safety/safety.routes.ts",
  "apps/backend/src/work-orders/work-orders.routes.ts",
]);
const MUST_USE_CREATOR = [
  "apps/backend/src/maintenance/pm-auto-engine.service.ts",
  "apps/backend/src/telematics/dtc-auto-work-order.service.ts",
  "apps/backend/src/maintenance/work-orders/auto-create-from-fault.ts",
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (!/node_modules|__tests__/.test(e)) walk(p, out); }
    else if (/\.ts$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}

export function problems(files) {
  const p = [];
  for (const [rel, src] of Object.entries(files)) {
    if (rel === CREATOR) continue;
    if (/INSERT INTO maintenance\.work_orders\s*\(/.test(src) && !REMAINING_DIRECT.has(rel)) p.push(`${rel} inserts maintenance.work_orders directly — create through createWorkOrderWithLines`);
  }
  for (const rel of MUST_USE_CREATOR) {
    const src = files[rel] ?? "";
    if (!/await createWorkOrderWithLines\(/.test(src)) p.push(`${rel} must create its work order through createWorkOrderWithLines`);
  }
  return p;
}

function load() {
  return Object.fromEntries(walk(path.join(ROOT, "apps/backend/src")).map((f) => [path.relative(ROOT, f), readFileSync(f, "utf8")]));
}

export function run() {
  return problems(load());
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = load();
  const own = problems(files);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["new direct insert", { ...files, "apps/backend/src/maintenance/new-thing.ts": "await client.query(`INSERT INTO maintenance.work_orders (id) VALUES ($1)`)" }],
      ["pm engine bypasses creator", { ...files, [MUST_USE_CREATOR[0]]: files[MUST_USE_CREATOR[0]].replace("await createWorkOrderWithLines(", "await somethingElse(") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — automatic work orders create through createWorkOrderWithLines; ${REMAINING_DIRECT.size} direct inserters baselined (shrink-only).`);
}
