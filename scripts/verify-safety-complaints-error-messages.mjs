#!/usr/bin/env node

import fs from "node:fs";

const LABEL = "verify-safety-complaints-error-messages";
const TARGET = "apps/backend/src/routes/safety/complaints.ts";

function verify(source) {
  const problems = [];
  const responses = [...source.matchAll(/reply\.code\((400|404)\)\.send\(\{([\s\S]*?)\}\)/g)];

  if (responses.length < 5) {
    problems.push(`${TARGET}: expected all complaint 400/404 response paths`);
  }

  for (const [, status, body] of responses) {
    if (/error:\s*["'](?:validation_error|complaint_consistency_failed|complaint_not_found)["']/.test(body) &&
        !/message:\s*["'][^"']+["']/.test(body)) {
      problems.push(`${TARGET}: ${status} complaint error response is missing a human-readable message`);
    }
  }

  return problems;
}

const source = fs.readFileSync(TARGET, "utf8");
const problems = verify(source);

if (process.argv.includes("--selftest")) {
  const mutated = source.replace(/\n\s*message:\s*"The complaint could not be found\.\",/, "");
  const caught = verify(mutated);
  if (caught.length === 0) {
    console.error(`${LABEL}: SELFTEST FAILED — missing message mutation was not detected`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST OK — missing message mutation detected`);
}

if (problems.length > 0) {
  console.error(`${LABEL}: FAILED`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — complaint validation, consistency, and not-found errors carry human messages`);
