#!/usr/bin/env node
/**
 * BANK leftover refuse + fill-not-shell — Legal matters/landing/alerts/reports + Fuel Home
 * must not reintroduce slate chrome; Legal need-company empties use BoardSection.
 */
import { readFileSync } from "node:fs";

const TARGETS = [
  ["apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx", "legal-matters-need-company"],
  ["apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx", null],
  ["apps/frontend/src/pages/legal/LegalLandingPage.tsx", "legal-landing-need-company"],
  ["apps/frontend/src/pages/legal/alerts/LegalDeadlineAlertsPage.tsx", "legal-deadline-alerts-need-company"],
  ["apps/frontend/src/pages/legal/matters/LegalMatterNewPage.tsx", "legal-matter-new-need-company"],
  ["apps/frontend/src/pages/legal/reports/LegalReportsLandingPage.tsx", "legal-reports-need-company"],
  ["apps/frontend/src/pages/fuel/FuelHome.tsx", null],
];
const LABEL = "verify-91125-legal-fuel-slate-leftover-chrome";

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
    src.includes("disabled:bg-slate-")
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

function u18Hits(path, src) {
  const hits = [];
  if (!path.includes("/pages/legal/")) return hits;
  if (path.endsWith("/LegalLandingPage.tsx")) return hits; // module home
  if (/<PageHeader\b/.test(src) && !/backHref="\/legal"/.test(src)) {
    hits.push("PageHeader backHref must be /legal (U18)");
  }
  return hits;
}

function audit(sources) {
  const fails = [];
  for (const [path, src, testId] of sources) {
    for (const e of leftoverHits(src)) fails.push(`${path}: ${e}`);
    for (const e of boardHits(src, testId)) fails.push(`${path}: ${e}`);
    for (const e of u18Hits(path, src)) fails.push(`${path}: ${e}`);
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
    if (testId0) {
      const boardPlant = src0
        .replace(/from ["'](?:\.\.\/)+components\/v3\/BoardSection["']/g, 'from "../../../components/v3/Stripped"')
        .replace(new RegExp(`testId="${testId0}"`, "g"), 'testId="x"');
      const boardFails = audit([[path0, boardPlant, testId0], ...sources.slice(1)]);
      if (
        !boardFails.some((e) => e.includes(path0) && e.includes("BoardSection")) ||
        !boardFails.some((e) => e.includes(path0) && e.includes(testId0))
      ) {
        console.error(`${LABEL} SELFTEST FAIL BoardSection plant escaped: ${boardFails.join("; ")}`);
        process.exit(1);
      }
    }
    const hrefTarget = sources.find(([p, s]) => p.includes("/pages/legal/") && !p.endsWith("/LegalLandingPage.tsx") && /backHref="\/legal"/.test(s));
    if (hrefTarget) {
      const [hPath, hSrc, hId] = hrefTarget;
      const hrefPlant = hSrc.replace(/backHref="\/legal"/g, 'backHref="/elsewhere"');
      const hrefFails = audit([[hPath, hrefPlant, hId], ...sources.filter(([p]) => p !== hPath)]);
      if (!hrefFails.some((e) => e.includes(hPath) && e.includes("backHref"))) {
        console.error(`${LABEL} SELFTEST FAIL U18 backHref plant escaped`);
        process.exit(1);
      }
    }
    console.log(`${LABEL}: SELFTEST PASS leftover + BoardSection + U18 plants`);
    process.exit(0);
  }
  const fails = audit(sources);
  if (fails.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of fails) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS leftover slate refuse + Legal BoardSection need-company (${TARGETS.length} files)`);
}
main();
