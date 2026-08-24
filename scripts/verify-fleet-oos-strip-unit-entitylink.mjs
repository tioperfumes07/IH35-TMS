#!/usr/bin/env node
/**
 * FleetOosStrip must EntityLink each OOS unit card
 * (Exact Leaves home.overview|kanban|list|round_trips :unit via shared strip).
 *
 * FAIL: unitNumber rendered as plain text while unitId is present.
 * PASS: EntityLink kind=unit + data-testid=fleet-oos-unit-link.
 *
 * Self-test: node scripts/verify-fleet-oos-strip-unit-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-oos-strip-unit-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/FleetOosStrip.tsx");

export function collectProblems(src) {
  const problems = [];
  if (!/EntityLink/.test(src)) problems.push("must use EntityLink");
  if (!/kind=["']unit["']/.test(src)) problems.push("must EntityLink kind=unit");
  if (!/data-testid=["']fleet-oos-unit-link["']/.test(src)) problems.push("must expose fleet-oos-unit-link");
  if (/<span className="font-semibold text-gray-900">\{row\.unitNumber\}<\/span>/.test(src)) problems.push("must not render plain unitNumber span");
  return problems;
}

function check() {
  const problems = collectProblems(fs.readFileSync(FILE, "utf8"));
  if (problems.length) throw new Error(`${LABEL}: ${problems.join("; ")}`);
}

function selftest() {
  const good = '<EntityLink kind="unit" data-testid="fleet-oos-unit-link">{row.unitNumber}</EntityLink>';
  if (collectProblems(good).length) throw new Error("selftest good fixture must pass");
  const mutations = [
    [good.replaceAll("EntityLink", "PlainLink"), "must use EntityLink"],
    [good.replace('kind="unit"', 'kind="load"'), "kind=unit"],
    [good.replace("fleet-oos-unit-link", "removed-unit-link"), "expose fleet-oos-unit-link"],
    [`${good}<span className="font-semibold text-gray-900">{row.unitNumber}</span>`, "must not render plain"],
  ];
  for (const [fixture, expected] of mutations) {
    const problems = collectProblems(fixture);
    if (!problems.some((problem) => problem.includes(expected))) {
      throw new Error(`selftest mutation escaped: ${expected} (${JSON.stringify(problems)})`);
    }
  }
  console.log(`${LABEL}: OK — selftest PASS ${mutations.length}/${mutations.length}`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
