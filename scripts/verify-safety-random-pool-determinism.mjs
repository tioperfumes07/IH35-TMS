#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_RANDOM_POOL_ROOT ?? process.cwd();
const routePath = path.resolve(ROOT, "apps/backend/src/safety/drug-pool.routes.ts");

const source = fs.existsSync(routePath) ? fs.readFileSync(routePath, "utf8") : "";
const failures = [];

if (!source.includes("seededPick(")) failures.push("missing_seeded_function");
if (!source.includes("seed")) failures.push("missing_seed_input");
if (!source.includes("period")) failures.push("missing_period_input");
if (source.includes("Math.random(")) failures.push("forbidden_math_random");
if (source.includes("Date.now(")) failures.push("forbidden_date_now");
if (!source.includes("appendCrudAudit")) failures.push("missing_audit_seed_record");

if (failures.length > 0) {
  console.error("verify:safety-random-pool-determinism FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:safety-random-pool-determinism OK");
