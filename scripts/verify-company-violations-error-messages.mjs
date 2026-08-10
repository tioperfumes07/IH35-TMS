#!/usr/bin/env node

import fs from "node:fs";

const LABEL = "verify-company-violations-error-messages";
const TARGET = "apps/backend/src/safety/company-violations.routes.ts";

function verify(source) {
  const problems = [];
  const required = [
    "Check the company violation details and try again.",
    "You do not have permission to change company violations.",
    "The company violation could not be found.",
    "Make at least one change before saving the company violation.",
    "Enter a fine amount before resolving this violation as a monetary fine.",
    "This company violation has already been resolved.",
    "We couldn't resolve the company violation. Try again.",
  ];

  for (const message of required) {
    if (!source.includes(message)) problems.push(`${TARGET}: missing message: ${message}`);
  }
  if (!/req\.log\.error\([\s\S]{0,120}\{ err: error, violationId: params\.data\.id \}/.test(source)) {
    problems.push(`${TARGET}: unexpected resolution failures must be logged with the violation id`);
  }
  if (/catch \(error\)[\s\S]{0,1200}throw error;/.test(source)) {
    problems.push(`${TARGET}: resolve catch must not rethrow an unhandled operator-facing failure`);
  }
  if (/reply\.code\((?:400|403|404|409|422)\)\.send\(\{ error:/.test(source)) {
    problems.push(`${TARGET}: contains a bare handled error response without human message parity`);
  }
  return problems;
}

const source = fs.readFileSync(TARGET, "utf8");
const problems = verify(source);

if (process.argv.includes("--selftest")) {
  const mutated = source.replace(/\n\s*message: "This company violation has already been resolved\.\",/, "");
  const caught = verify(mutated);
  if (caught.length === 0) {
    console.error(`${LABEL}: SELFTEST FAILED — missing resolution message mutation was not detected`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST OK — missing resolution message mutation detected`);
}

if (problems.length > 0) {
  console.error(`${LABEL}: FAILED`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — company violation handled failures carry human messages and generic failures are logged`);
