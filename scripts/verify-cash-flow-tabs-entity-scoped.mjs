#!/usr/bin/env node
/**
 * CASH-T01 / CASH-T02 — Cash-flow "Actual vs Projected" and "Manual Daily Projections" tabs
 * must be mounted from CashFlowPage, entity-scoped via operatingCompanyId, and must handle
 * loading/error/empty states.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILES = {
  page: "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx",
  avp: "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx",
  mdp: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
};

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  const failures = [];
  for (const [label, p] of Object.entries(FILES)) {
    if (!exists(p)) failures.push(`MISSING: ${p}`);
  }
  if (failures.length) return failures;

  const pageSrc = read(FILES.page);
  const avpSrc = read(FILES.avp);
  const mdpSrc = read(FILES.mdp);

  // Page mounts both tabs and passes operatingCompanyId.
  for (const [name, importName] of [
    ["ActualVsProjectedTab", "ActualVsProjectedTab"],
    ["ManualDailyProjectionsTab", "ManualDailyProjectionsTab"],
  ]) {
    if (!pageSrc.includes(importName)) {
      failures.push(`${FILES.page}: must import ${name}`);
    }
    if (!new RegExp(`<${name}\\s+operatingCompanyId=\\{`).test(pageSrc)) {
      failures.push(`${FILES.page}: must render <${name} operatingCompanyId={...} />`);
    }
  }

  // Tabs scope queries to the selected operating company.
  for (const [label, src] of [
    [FILES.avp, avpSrc],
    [FILES.mdp, mdpSrc],
  ]) {
    if (!/operatingCompanyId/.test(src)) {
      failures.push(`${label}: must consume operatingCompanyId prop`);
    }
    if (!/queryKey:\s*\[[^\]]*operatingCompanyId/.test(src)) {
      failures.push(`${label}: must include operatingCompanyId in React Query key`);
    }
    if (!/getActualVsProjected|listForecastEntries|getForecastOpeningBalance/.test(src)) {
      failures.push(`${label}: must call a canonical cash-flow/forecast API`);
    }
    if (!/isError|isLoading|emptyText/.test(src)) {
      failures.push(`${label}: must surface error/loading/empty states`);
    }
  }

  // ManualDailyProjectionsTab writes through the API, not ad-hoc fetch.
  if (!/createForecastEntry|updateForecastEntry|deleteForecastEntry|putForecastOpeningBalance/.test(mdpSrc)) {
    failures.push(`${FILES.mdp}: must use canonical forecast mutation APIs`);
  }

  // BANK-F91304 leftover refuse — ManualDailyProjectionsTab.tsx page-scoped text token ratchet
  if (mdpSrc.includes("text-[11px]")) failures.push(`${FILES.mdp}: leftover text-[11px]`);
  if (mdpSrc.includes("#8A92AB") || mdpSrc.includes("#334155")) failures.push(`${FILES.mdp}: leftover off-scale muted`);

  // No raw fetch / XMLHttpRequest.
  for (const [label, src] of Object.entries({ [FILES.avp]: avpSrc, [FILES.mdp]: mdpSrc })) {
    if (/\bfetch\s*\(|XMLHttpRequest|axios/.test(src)) {
      failures.push(`${label}: must not use raw fetch/axios — use API module`);
    }
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, FILES.page);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, backup.replace("<ActualVsProjectedTab", "<ActualVsProjectedTabX"), "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-cash-flow-tabs-entity-scoped] SELFTEST FAIL: planted rename did not fail");
        process.exit(1);
      }
      // BANK-F91304 leftover plant — ManualDailyProjectionsTab page-scoped text token ratchet
      const mdpPath = path.join(ROOT, FILES.mdp);
      const mdpBackup = fs.readFileSync(mdpPath, "utf8");
      try {
        fs.writeFileSync(mdpPath, mdpBackup + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n', "utf8");
        const leftoverHits = run();
        if (!leftoverHits.some((e) => e.includes("leftover text-[11px]")) || !leftoverHits.some((e) => e.includes("leftover off-scale muted"))) {
          console.error("[verify-cash-flow-tabs-entity-scoped] SELFTEST FAIL leftover plant escaped", leftoverHits.filter((e) => e.includes("leftover")));
          process.exit(1);
        }
      } finally {
        fs.writeFileSync(mdpPath, mdpBackup, "utf8");
      }
      console.log(`[verify-cash-flow-tabs-entity-scoped] SELFTEST PASS (${planted.length} planted failures detected + leftover plant)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-cash-flow-tabs-entity-scoped] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-cash-flow-tabs-entity-scoped] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
