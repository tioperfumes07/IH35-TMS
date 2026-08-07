#!/usr/bin/env node
/**
 * GUARD 2196 — Accident Spawn Liability must create a real driver_liability (SAF-F35).
 * Forbids silent / FINANCIAL-HOLD stub that returns null liability id with 422 not_implemented.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-accident-spawn-liability";
const ROUTE = "apps/backend/src/safety/safety.routes.ts";
const FE = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function spawnHandler(src) {
  const start = src.indexOf('app.post("/api/v1/safety/accidents/:id/spawn-liability"');
  if (start < 0) return "";
  const rest = src.slice(start);
  const next = rest.indexOf("app.post(\"/api/v1/safety/accidents/:id/spawn-wo\"");
  return next < 0 ? rest.slice(0, 8000) : rest.slice(0, next);
}

function assert(sources) {
  const problems = [];
  const route = sources?.[ROUTE] ?? read(ROUTE);
  const handler = spawnHandler(route);
  if (!handler) {
    problems.push(`${ROUTE}: spawn-liability route missing`);
    return problems;
  }
  if (/spawn_liability_not_implemented|FINANCIAL-HOLD|spawned_liability_id:\s*null/.test(handler)) {
    problems.push(`${ROUTE}: spawn-liability still stubs with not_implemented / null id`);
  }
  if (!/INSERT INTO driver_finance\.driver_liabilities/.test(handler)) {
    problems.push(`${ROUTE}: must INSERT driver_finance.driver_liabilities`);
  }
  // Permanent C6 posture (Claude SWEEP-C6): liability seed is EXEMPT — JE on settlement apply.
  // Without this, build-typecheck fails as a NEW C6 gap on every spawn-liability change.
  if (!/C6-MONEY-JE-EXEMPT:/.test(handler) && !/C6-MONEY-JE-EXEMPT:/.test(route)) {
    problems.push(
      `${ROUTE}: spawn-liability must carry C6-MONEY-JE-EXEMPT (recovery subledger; JE on settlement apply)`
    );
  }
  if (!/createSettlementDeduction/.test(handler) && !/createSettlementDeduction/.test(route)) {
    problems.push(`${ROUTE}: must reuse createSettlementDeduction (no new GL math)`);
  }
  if (!/SUM\(amount_cents\)/.test(handler) && !/accident_cost_lines/.test(handler)) {
    problems.push(`${ROUTE}: amount must come from accident_cost_lines sum`);
  }
  if (!/origin = 'safety_accident'/.test(handler) && !/origin = 'safety_accident'/.test(handler.replace(/'/g, '"'))) {
    if (!/safety_accident/.test(handler)) {
      problems.push(`${ROUTE}: must idempotently key origin=safety_accident`);
    }
  }
  const fe = sources?.[FE] ?? read(FE);
  if (/FINANCIAL-HOLD/.test(fe)) {
    problems.push(`${FE}: remove FINANCIAL-HOLD toast copy — spawn is live`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [ROUTE]: read(ROUTE), [FE]: read(FE) };
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    ...live,
    [ROUTE]: live[ROUTE].replace(
      /INSERT INTO driver_finance\.driver_liabilities[\s\S]*?RETURNING id::text/,
      "spawned_liability_id: null /* planted stub */",
    ),
  });
  if (!planted.some((p) => p.includes("INSERT") || p.includes("stubs"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted stub not caught`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accident spawn-liability inserts driver_liabilities + settlement deduction`);
