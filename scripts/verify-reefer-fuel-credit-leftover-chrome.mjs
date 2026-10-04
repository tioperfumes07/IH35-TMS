#!/usr/bin/env node
// BANK-F91552 leftover refuse — Reefer fuel credit banner + vehicle-profile reefer trailer link
// must use house tokens, never leftover Tailwind slate-* classes.
import { readFileSync } from "node:fs";

const REPORT = "apps/frontend/src/pages/reports/ReeferFuelCreditReportPage.tsx";
const SECTION = "apps/frontend/src/components/vehicle-profile/ReeferSection.tsx";
const LABEL = "verify-reefer-fuel-credit-leftover-chrome";

function leftoverHits(src) {
  const hits = [];
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("bg-slate-")) {
    hits.push("leftover slate class");
  }
  return hits;
}

function audit(reportSrc, sectionSrc) {
  const fails = [];
  for (const e of leftoverHits(reportSrc)) fails.push(`${REPORT}: ${e}`);
  for (const e of leftoverHits(sectionSrc)) fails.push(`${SECTION}: ${e}`);
  if (!reportSrc.includes('data-testid="reefer-missing-banner"')) {
    fails.push(`${REPORT}: missing reefer-missing-banner`);
  }
  if (!/border-\[#E5E7EB\].*bg-\[#F7F8FA\].*text-\[#4B5563\]/.test(reportSrc) && !/text-\[#4B5563\].*border-\[#E5E7EB\].*bg-\[#F7F8FA\]/.test(reportSrc)) {
    if (!reportSrc.includes("border-[#E5E7EB]") || !reportSrc.includes("bg-[#F7F8FA]") || !reportSrc.includes("text-[#4B5563]")) {
      fails.push(`${REPORT}: missing-gallons banner must use house #E5E7EB / #F7F8FA / #4B5563`);
    }
  }
  if (!sectionSrc.includes("text-[#1F2A44]")) {
    fails.push(`${SECTION}: trailer link must use house #1F2A44`);
  }
  return fails;
}

function main() {
  const reportSrc = readFileSync(REPORT, "utf8");
  const sectionSrc = readFileSync(SECTION, "utf8");
  const selftest = process.argv.includes("--selftest");

  if (selftest) {
    const plantedReport = `${reportSrc}\n<div className="text-slate-700 border-slate-200 bg-slate-50">plant</div>\n`;
    if (!audit(plantedReport, sectionSrc).some((e) => e.includes(REPORT) && e.includes("leftover slate class"))) {
      console.error(`${LABEL} SELFTEST FAIL leftover report plant escaped`);
      process.exit(1);
    }
    const plantedSection = `${sectionSrc}\n<a className="text-slate-700">plant</a>\n`;
    if (!audit(reportSrc, plantedSection).some((e) => e.includes(SECTION) && e.includes("leftover slate class"))) {
      console.error(`${LABEL} SELFTEST FAIL leftover section plant escaped`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS leftover slate class plant`);
    process.exit(0);
  }

  const fails = audit(reportSrc, sectionSrc);
  if (fails.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of fails) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS leftover slate class refuse`);
}

main();
