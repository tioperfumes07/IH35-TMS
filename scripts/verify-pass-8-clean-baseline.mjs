#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const reportPath = path.join(process.cwd(), "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.json");
if (!fs.existsSync(reportPath)) {
  console.error(`[verify-pass-8-clean-baseline] missing report: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report.overall_status !== "PASS") {
  console.error(
    `[verify-pass-8-clean-baseline] baseline is not clean (overall=${report.overall_status}, recommendation=${report.recommendation})`
  );
  process.exit(1);
}

const failedAreas = (report.areas || []).filter((a) => a.status !== "PASS").map((a) => a.area);
if (failedAreas.length > 0) {
  console.error(`[verify-pass-8-clean-baseline] failed areas present: ${failedAreas.join(", ")}`);
  process.exit(1);
}

console.log("[verify-pass-8-clean-baseline] PASS");
