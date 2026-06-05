#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  PASS8_ARTIFACTS,
  PASS8_COUNTS,
  ensureAuditDir,
  nowIso,
  recommendationFromAreas,
  toKey,
} from "./pass-8-shared.mjs";

const STEPS = [
  "scripts/pass-8-walk-all-modules.mjs",
  "scripts/pass-8-walk-all-workflows.mjs",
  "scripts/pass-8-walk-all-error-codes.mjs",
  "scripts/pass-8-walk-all-must-clauses.mjs",
  "scripts/pass-8-walk-all-locked-invariants.mjs",
  "scripts/pass-8-walk-integration-health.mjs",
  "scripts/pass-8-walk-financial-integrity.mjs",
];

function runStep(stepPath) {
  const res = spawnSync("node", [stepPath], { encoding: "utf8", env: process.env });
  const raw = `${res.stdout || ""}`.trim();
  if (res.status !== 0) {
    throw new Error(`${stepPath} exited with ${res.status}: ${(res.stderr || "").trim()}`);
  }
  const lastLine = raw.split(/\r?\n/).filter(Boolean).at(-1);
  if (!lastLine) {
    throw new Error(`${stepPath} produced no JSON output`);
  }
  return JSON.parse(lastLine);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# PASS-8 Pre-Prod Smoke Results");
  lines.push("");
  lines.push(`- Timestamp: ${report.generated_at}`);
  lines.push(`- Branch: ${report.branch}`);
  lines.push(`- Head SHA: ${report.head_sha}`);
  lines.push(`- Recommendation (computed): ${report.recommendation}`);
  lines.push(`- Overall: ${report.overall_status}`);
  lines.push("");
  lines.push("| Area | Expected | Checked | Pass | Fail | Status |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const area of report.areas) {
    lines.push(
      `| ${area.area} | ${area.expected} | ${area.checked} | ${area.pass_count} | ${area.fail_count} | ${area.status} |`
    );
  }
  lines.push("");
  lines.push("## Failures");
  for (const area of report.areas) {
    if (area.failures.length === 0) continue;
    lines.push(`- ${area.area}: ${area.failures.join("; ")}`);
  }
  if (report.areas.every((a) => a.failures.length === 0)) {
    lines.push("- none");
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("- PASS-8 recommendation is computed from area statuses only.");
  lines.push("- Final GO/NO-GO decision is owned by Jorge.");
  return `${lines.join("\n")}\n`;
}

const areas = STEPS.map(runStep);
const overallStatus = areas.every((a) => a.status === "PASS") ? "PASS" : "FAIL";
const recommendation = recommendationFromAreas(areas);

const totals = areas.reduce(
  (acc, a) => {
    acc.pass_count += a.pass_count;
    acc.fail_count += a.fail_count;
    return acc;
  },
  { pass_count: 0, fail_count: 0 }
);

const report = {
  generated_at: nowIso(),
  branch: spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim(),
  head_sha: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
  expected_counts: PASS8_COUNTS,
  areas: areas.map((a) => ({ ...a, key: toKey(a.area) })),
  totals,
  overall_status: overallStatus,
  recommendation,
};

ensureAuditDir();
fs.writeFileSync(PASS8_ARTIFACTS.json, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(PASS8_ARTIFACTS.md, renderMarkdown(report));

console.log(`PASS-8 complete: ${overallStatus} (${recommendation})`);
console.log(`JSON: ${PASS8_ARTIFACTS.json}`);
console.log(`MD: ${PASS8_ARTIFACTS.md}`);

if (overallStatus !== "PASS") {
  process.exit(1);
}
