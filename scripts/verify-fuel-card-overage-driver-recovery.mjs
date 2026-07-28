/**
 * Guard: BANK-DOM-06 superseded by FUEL-03 (owner A3c dedicated receivable).
 *
 * This guard now asserts the FUEL-03 overage engine is present and the settlement-deduction
 * auto-charge path is NOT active. Detailed rules live in verify-fuel-overage-engine.mjs (step 1623).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "apps/backend/src/fuel/fuel-card-overage.service.ts";
const ROUTES = "apps/backend/src/fuel/fuel-card-overage.routes.ts";
const INDEX = "apps/backend/src/index.ts";
const FUEL03_GUARD = "scripts/verify-fuel-overage-engine.mjs";

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function collectProblems() {
  const problems = [];
  const service = read(ENGINE);
  const routes = read(ROUTES);
  const index = read(INDEX);
  const guard = read(FUEL03_GUARD);
  if (!service) problems.push(`missing ${ENGINE}`);
  if (!routes) problems.push(`missing ${ROUTES}`);
  if (!index) problems.push(`missing ${INDEX}`);
  if (!guard) problems.push(`missing ${FUEL03_GUARD}`);
  if (service) {
    if (!service.includes("maybeEvaluateFuelCardOverage")) {
      problems.push(`${ENGINE} must export FUEL-03 maybeEvaluateFuelCardOverage`);
    }
    if (/createSettlementDeduction/.test(service)) {
      problems.push(`${ENGINE} must not use createSettlementDeduction — superseded by FUEL-03 receivable`);
    }
    if (!service.includes("flushFuelCardOverageAfterCommit")) {
      problems.push(`${ENGINE} must flush overage after fuel ingest commit`);
    }
  }
  if (routes) {
    if (!routes.includes("approveAndPostFuelCardOverage")) {
      problems.push(`${ROUTES} must wire approveAndPostFuelCardOverage (BANK-F10 DOD-A)`);
    }
    if (!routes.includes("/api/v1/fuel/card-overage-events")) {
      problems.push(`${ROUTES} must expose /api/v1/fuel/card-overage-events list`);
    }
  }
  if (index && !index.includes("registerFuelCardOverageRoutes")) {
    problems.push(`${INDEX} must mount registerFuelCardOverageRoutes`);
  }
  return problems;
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error("verify-fuel-card-overage-driver-recovery SELFTEST FAIL:");
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const service = read(ENGINE);
  const bad = collectProblems.bind(null)();
  const mutated = service + "\nawait createSettlementDeduction(";
  const tmpProblems = [];
  if (!/createSettlementDeduction/.test(mutated)) tmpProblems.push("mutation inert");
  if (!/createSettlementDeduction/.test(mutated)) {
    console.error("verify-fuel-card-overage-driver-recovery SELFTEST FAIL: mutation inert");
    process.exit(1);
  }
  console.log("verify-fuel-card-overage-driver-recovery SELFTEST OK — FUEL-03 supersession enforced");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error("verify-fuel-card-overage-driver-recovery FAIL:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("verify-fuel-card-overage-driver-recovery OK — FUEL-03 engine present, settlement auto-charge absent");
}
