#!/usr/bin/env node
/**
 * BANK leftover refuse + fill-not-shell — ApplicantsPipeline need-company BoardSection.
 */
import { readFileSync } from "node:fs";

const TARGETS = [
  ["apps/frontend/src/pages/driver-finance/components/PendingAckNotice.tsx", null],
  ["apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx", null],
  ["apps/frontend/src/pages/drivers/ApplicantsPipelinePage.tsx", "drivers-applicants-need-company"],
];
const LABEL = "verify-91162-drvfin-applicants-slate-leftover-chrome";

function leftoverHits(src) {
  const hits = [];
  if (
    src.includes("text-slate-") ||
    src.includes("border-slate-") ||
    src.includes("border-l-slate-") ||
    src.includes("border-t-slate-") ||
    src.includes("bg-slate-") ||
    src.includes("hover:bg-slate-") ||
    src.includes("hover:text-slate-") ||
    src.includes("focus:bg-slate-") ||
    src.includes("divide-slate-") ||
    src.includes("sm:divide-slate-") ||
    src.includes("ring-slate-") ||
    src.includes("decoration-slate-") ||
    src.includes("focus:ring-slate-") ||
    src.includes("focus-visible:ring-slate-") ||
    src.includes("focus:border-slate-") ||
    src.includes("outline-slate-") ||
    src.includes("focus-visible:outline-slate-") ||
    src.includes("accent-slate-") ||
    src.includes("disabled:bg-slate-") ||
    src.includes("hover:border-slate-")
  ) {
    hits.push("leftover slate class");
  }
  return hits;
}

function boardHits(src, testId) {
  const hits = [];
  if (!testId) return hits;
  if (!/from ["'](?:\.\.\/)+components\/v3\/BoardSection["']/.test(src)) hits.push("must import BoardSection");
  if (!src.includes(`testId="${testId}"`)) hits.push(`need-company BoardSection testId=${testId} required`);
  return hits;
}

function audit(sources) {
  const fails = [];
  for (const [path, src, testId] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
    for (const e of boardHits(src, testId)) fails.push(`${path}: ${e}`);
  }
  return fails;
}

function main() {
  const sources = TARGETS.map(([path, testId]) => [path, readFileSync(path, "utf8"), testId]);
  if (process.argv.includes("--selftest")) {
    const [path0, src0, testId0] = sources[0];
    const planted = `${src0}\n<span className="text-slate-700 border-slate-200 bg-slate-50">plant</span>\n`;
    if (!audit([[path0, planted, testId0], ...sources.slice(1)]).some((e) => e.includes(path0) && e.includes("leftover slate class"))) {
      console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`);
      process.exit(1);
    }
    const app = sources.find(([, , tid]) => tid === "drivers-applicants-need-company");
    if (app) {
      const [apath, asrc, atid] = app;
      const boardPlant = asrc
        .replace(/from ["'](?:\.\.\/)+components\/v3\/BoardSection["']/g, 'from "../../components/v3/Stripped"')
        .replace(new RegExp(`testId="${atid}"`, "g"), 'testId="x"');
      const boardFails = audit(sources.map(([p, s, tid]) => (p === apath ? [p, boardPlant, tid] : [p, s, tid])));
      if (
        !boardFails.some((e) => e.includes(apath) && e.includes("BoardSection")) ||
        !boardFails.some((e) => e.includes(apath) && e.includes(atid))
      ) {
        console.error(`${LABEL} SELFTEST FAIL Applicants BoardSection plant escaped`);
        process.exit(1);
      }
    }
    console.log(`${LABEL}: SELFTEST PASS leftover + Applicants BoardSection plants`);
    process.exit(0);
  }
  const fails = audit(sources);
  if (fails.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of fails) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS leftover slate refuse + Applicants need-company BoardSection (${TARGETS.length} files)`);
}
main();
