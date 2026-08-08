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

function collectProblems(serviceOverride) {
  const problems = [];
  const service = serviceOverride ?? read(ENGINE);
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
    // LV-TXN-009 — THE DEDUPE MUST BE CONSULTED, NOT MERELY CALLED.
    //
    // The approve path used to run `await loadExistingOverageDeductionLink(...)` with the result
    // UNASSIGNED, under a comment claiming it existed "so we never double-create a settlement
    // deduction". It deduped nothing: a read whose result is discarded is not a use, and no amount
    // of populating the FKs would have changed that. It survived because verify-no-dead-schema only
    // asks whether the columns are REFERENCED — a bare SELECT satisfies that while protecting
    // nothing. Same family as a CI assertion that evaluates an empty table and passes vacuously.
    //
    // So assert the shape that actually protects the driver: the result is BOUND to a name, and
    // that name is BRANCHED on. Both halves are required — binding without branching is the same
    // no-op wearing a variable.
    if (service.includes("loadExistingOverageDeductionLink")) {
      const bound = /(?:const|let|var)\s+(\w+)\s*=\s*await\s+loadExistingOverageDeductionLink\s*\(/.exec(
        service
      );
      if (!bound) {
        problems.push(
          `${ENGINE} calls loadExistingOverageDeductionLink but DISCARDS its result — bind it to a ` +
            `variable. An unassigned await is a read that protects nothing (LV-TXN-009).`
        );
      } else {
        const name = bound[1];
        const branched = new RegExp(
          `if\\s*\\([^)]*\\b${name}\\.(?:deduction_id|overage_deduction_id)\\b`
        ).test(service);
        if (!branched) {
          problems.push(
            `${ENGINE} binds loadExistingOverageDeductionLink to \`${name}\` but never branches on ` +
              `${name}.deduction_id / ${name}.overage_deduction_id — the driver can still be charged ` +
              `twice for the same gallon (LV-TXN-009).`
          );
        }
      }
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

  // The previous selftest built a mutated string and then regex-tested THE STRING IT JUST BUILT,
  // never feeding it back through collectProblems. It could not fail — the one property a selftest
  // exists to have. Every mutation below is now run through the REAL checker and must come back RED.
  const mutations = [
    {
      why: "settlement auto-charge reintroduced",
      src: service + "\nawait createSettlementDeduction(",
    },
    {
      why: "dedupe result DISCARDED (the LV-TXN-009 defect verbatim)",
      src: service.replace(
        /(?:const|let|var)\s+\w+\s*=\s*await\s+loadExistingOverageDeductionLink\s*\(/,
        "await loadExistingOverageDeductionLink("
      ),
    },
    {
      why: "dedupe BOUND but never branched on (the no-op wearing a variable)",
      src: service.replace(
        /if\s*\([^)]*\b\w+\.(?:deduction_id|overage_deduction_id)\b[^)]*\)/,
        "if (false)"
      ),
    },
    {
      why: "flush-after-commit removed",
      src: service.replaceAll("flushFuelCardOverageAfterCommit", "flushRemoved"),
    },
  ];

  const inert = [];
  for (const m of mutations) {
    if (m.src === service) {
      inert.push(`${m.why} — MUTATION INERT (it changed nothing; the guard proves nothing here)`);
      continue;
    }
    if (collectProblems(m.src).length === 0) inert.push(`${m.why} — NOT DETECTED`);
  }
  if (inert.length) {
    console.error("verify-fuel-card-overage-driver-recovery SELFTEST FAIL:");
    for (const p of inert) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    `verify-fuel-card-overage-driver-recovery SELFTEST OK — ${mutations.length}/${mutations.length} mutations detected ` +
      `(supersession, discarded dedupe, unbranched dedupe, missing flush)`
  );
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
