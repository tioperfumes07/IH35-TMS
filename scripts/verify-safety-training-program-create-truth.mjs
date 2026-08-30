#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/safety/training-programs.routes.ts";
const source = fs.readFileSync(file, "utf8");

function verify(text) {
  const failures = [];
  const createStart = text.indexOf('app.post("/api/v1/safety/training-programs"');
  const createEnd = createStart >= 0 ? text.indexOf("\n  });", createStart) : -1;
  const create = createStart >= 0 && createEnd >= 0 ? text.slice(createStart, createEnd) : "";
  if (!/app\.post\("\/api\/v1\/safety\/training-programs", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/.test(create)) failures.push("creator must be rate limited");
  if (!/const trainingProgram = res\.rows\[0\];[\s\S]*?if \(!trainingProgram\?\.id\) throw new Error\("safety_training_program_insert_failed"\)/.test(create)) failures.push("creator must require inserted identity");
  if (!/resource_id: trainingProgram\.id/.test(create)) failures.push("audit must use proven identity");
  if (!/return trainingProgram;/.test(create)) failures.push("201 response must use proven row");
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(`verify-safety-training-program-create-truth: FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(
      'app.post("/api/v1/safety/training-programs", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }',
      'app.post("/api/v1/safety/training-programs", { config: { rateLimit: { max: 0, timeWindow: "1 minute" } } }'
    ),
    source.replace("if (!trainingProgram?.id)", "if (false)"),
    source.replace("resource_id: trainingProgram.id", "resource_id: null"),
    source.replace("return trainingProgram;", "return res.rows[0];"),
  ];
  const survived = mutations.filter((mutation) => verify(mutation).length === 0);
  if (survived.length) {
    console.error(`verify-safety-training-program-create-truth --selftest: FAIL; ${survived.length} mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-safety-training-program-create-truth --selftest: PASS (4/4 mutations red)");
} else {
  console.log("verify-safety-training-program-create-truth: PASS — creator rate-limits and requires its inserted audit identity");
}
