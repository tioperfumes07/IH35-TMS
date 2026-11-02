#!/usr/bin/env node
/**
 * BANK leftover refuse + fill-not-shell — drivers team/retention/deductions + list/profile need-company BoardSection.
 */
import { readFileSync } from "node:fs";

const TARGETS = [
  ["apps/frontend/src/pages/drivers/TeamSplitConfig.tsx", "team-split-config-need-company"],
  ["apps/frontend/src/pages/drivers/RetentionDashboard.tsx", null],
  ["apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx", "pending-settlement-deductions-need-company"],
  ["apps/frontend/src/pages/drivers/DriversListPage.tsx", "drivers-list-need-company"],
  ["apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "driver-profile-need-company"],
  ["apps/frontend/src/pages/drivers/MessagesInboxPage.tsx", "drivers-messages-need-company"],
  ["apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx", "drivers-onboarding-need-company"],
  ["apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx", "auto-deduction-policies-need-company"],
  ["apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx", "driver-hos-detail-need-company"],
  ["apps/frontend/src/pages/drivers/DriverLayoverHistoryPage.tsx", "driver-layover-history-need-company"],
];
const LABEL = "verify-91127-drv-team-ret-deduct-slate-leftover-chrome";

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
  // Drivers list is module home; other PageHeader leaves back to /drivers
  if (path.endsWith("/DriversListPage.tsx")) return hits;
  if (/<PageHeader\b/.test(src) && !/backHref="\/drivers"/.test(src)) {
    hits.push("PageHeader backHref must be /drivers (U18)");
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
        .replace(/from ["'](?:\.\.\/)+components\/v3\/BoardSection["']/g, 'from "../../components/v3/Stripped"')
        .replace(new RegExp(`testId="${testId0}"`, "g"), 'testId="x"');
      const boardFails = audit([[path0, boardPlant, testId0], ...sources.slice(1)]);
      if (
        !boardFails.some((e) => e.includes(path0) && e.includes("BoardSection")) ||
        !boardFails.some((e) => e.includes(path0) && e.includes(testId0))
      ) {
        console.error(`${LABEL} SELFTEST FAIL BoardSection plant escaped`);
        process.exit(1);
      }
    }
    const hrefTarget = sources.find(([p, s]) => !p.endsWith("/DriversListPage.tsx") && /backHref="\/drivers"/.test(s));
    if (hrefTarget) {
      const [hPath, hSrc, hId] = hrefTarget;
      const hrefPlant = hSrc.replace(/backHref="\/drivers"/g, 'backHref="/elsewhere"');
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
  console.log(`${LABEL}: PASS leftover slate refuse + drivers need-company BoardSection (${TARGETS.length} files)`);
}
main();
