#!/usr/bin/env node
/**
 * ENG-60: POST /api/v1/insurance/lawsuits must be 410 Gone (insurance.lawsuit retired).
 * Creates go through legal.matters type=lawsuit — no INSERT into the side table.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/insurance/lawsuit.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const routeStart = candidate.indexOf('app.post(\n    "/api/v1/insurance/lawsuits"');
  const nextRoute = routeStart < 0 ? -1 : candidate.indexOf('app.patch(', routeStart);
  const route = routeStart < 0 || nextRoute < 0 ? "" : candidate.slice(routeStart, nextRoute);
  const checks = [
    ["creator limiter", /insurance\/lawsuits"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["410 gone", /\.code\(410\)\.send\(LAWSUIT_SIDE_TABLE_GONE\)/],
  ];
  const failed = checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
  if (!/insurance_lawsuit_retired/.test(candidate)) failed.push("retired error body");
  if (!/redirect:\s*"\/legal\/lawsuits"/.test(candidate)) failed.push("legal redirect");
  if (/INSERT INTO insurance\.lawsuit/.test(route)) failed.push("side-table insert still present");
  return failed;
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-lawsuit-create-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [".code(410).send(LAWSUIT_SIDE_TABLE_GONE)", ".code(201).send({})"],
    ['redirect: "/legal/lawsuits"', 'redirect: "/insurance/lawsuits"'],
    ["insurance_lawsuit_retired", "insurance_lawsuit_ok"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-insurance-lawsuit-create-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-lawsuit-create-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-lawsuit-create-truth PASS — ENG-60 POST insurance lawsuits is 410 Gone");
