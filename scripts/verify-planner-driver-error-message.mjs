#!/usr/bin/env node
/** Ratchet the planner qualification response against bare machine-code operator errors. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/backend/src/dispatch/planner.routes.ts";
const LABEL = "verify-planner-driver-error-message";

export function audit(src) {
  const problems = [];
  const branch = src.match(/if \(result\.error === "driver_not_qualified"\)[\s\S]*?\n\s*\}/)?.[0] ?? "";
  if (!branch.includes('error: "E_DRIVER_NOT_QUALIFIED"')) {
    problems.push(`${TARGET}: planner must retain stable E_DRIVER_NOT_QUALIFIED code`);
  }
  if (!/message:\s*"Selected driver does not meet dispatch qualification requirements for this load\."/.test(branch)) {
    problems.push(`${TARGET}: qualification response must carry operator-facing message`);
  }
  if (!/details:\s*result\.details/.test(branch)) {
    problems.push(`${TARGET}: qualification response must preserve structured details`);
  }
  return problems;
}

function selftest() {
  const good = `if (result.error === "driver_not_qualified") {
    return reply.code(422).send({ error: "E_DRIVER_NOT_QUALIFIED", message: "Selected driver does not meet dispatch qualification requirements for this load.", details: result.details });
  }`;
  const bad = `if (result.error === "driver_not_qualified") {
    return reply.code(422).send({ error: "E_DRIVER_NOT_QUALIFIED", details: result.details });
  }`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (!audit(bad).some((problem) => problem.includes("operator-facing message"))) {
    failures.push("bare-code regression was not detected");
  }
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — planner qualification errors carry code, message, and details`);
}
