#!/usr/bin/env node
/**
 * ENG-60: PATCH /api/v1/insurance/lawsuits/:id must be 410 Gone (insurance.lawsuit retired).
 * Updates go through legal.matters type=lawsuit — no UPDATE of the side table.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/insurance/lawsuit.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const routeStart = candidate.indexOf('/api/v1/insurance/lawsuits/:id"');
  const route = routeStart < 0 ? "" : candidate.slice(routeStart);
  const checks = [
    ["mutation limiter", /lawsuits\/:id"[\s\S]{0,180}rateLimit:\s*\{\s*max:\s*120,\s*timeWindow:\s*"1 minute"/],
    ["410 gone", /\.code\(410\)\.send\(LAWSUIT_SIDE_TABLE_GONE\)/],
  ];
  const failed = checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
  if (!/insurance_lawsuit_retired/.test(candidate)) failed.push("retired error body");
  if (!/redirect:\s*"\/legal\/lawsuits"/.test(candidate)) failed.push("legal redirect");
  if (/UPDATE insurance\.lawsuit/.test(route)) failed.push("side-table update still present");
  return failed;
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-lawsuit-update-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [".code(410).send(LAWSUIT_SIDE_TABLE_GONE)", ".code(200).send({})"],
    ["insurance_lawsuit_retired", "insurance_lawsuit_ok"],
    ['redirect: "/legal/lawsuits"', 'redirect: "/insurance/lawsuits"'],
    ['{ config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },', "{ config: {} },"],
  ];
  for (const [from, to] of mutations) {
    // Prefer the PATCH occurrence (last 410) so create's 410 does not mask the mutate guard.
    const index = from.includes("410") ? source.lastIndexOf(from) : source.indexOf(from);
    const changed = index < 0 ? source : `${source.slice(0, index)}${to}${source.slice(index + from.length)}`;
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-insurance-lawsuit-update-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-lawsuit-update-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-lawsuit-update-truth PASS — ENG-60 PATCH insurance lawsuits is 410 Gone");
