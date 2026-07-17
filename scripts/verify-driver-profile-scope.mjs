#!/usr/bin/env node
/**
 * verify-driver-profile-scope.mjs  (d5-driver-detail-scope-optional-param / DRIVER-D cluster)
 *
 * Every getDriver() call must pass the selected operating_company_id — no bare getDriver(id).
 * The API helper must require operatingCompanyId (not optional) so TypeScript blocks regressions.
 *
 * Usage:
 *   node scripts/verify-driver-profile-scope.mjs
 *   node scripts/verify-driver-profile-scope.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-scope";

const SCOPED_PAGES = [
  {
    file: "apps/frontend/src/pages/DriverDetail.tsx",
    idArg: "id",
    companyVar: "companyId",
  },
  {
    file: "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx",
    idArg: "id",
    companyVar: "operatingCompanyId",
  },
  {
    file: "apps/frontend/src/pages/drivers/DriverLayoverHistoryPage.tsx",
    idArg: "driverId",
    companyVar: "operatingCompanyId",
  },
];

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

/** Pure checks for --selftest and repo scan. */
export function check({ mdataApi, pages }) {
  const errs = [];

  if (!mdataApi) {
    errs.push("apps/frontend/src/api/mdata.ts: missing");
  } else if (/export function getDriver\(id: string, operatingCompanyId\?\: string\)/.test(mdataApi)) {
    errs.push("getDriver(id, operatingCompanyId?) must require operatingCompanyId (remove optional ?)");
  } else if (!/export function getDriver\(id: string, operatingCompanyId: string\)/.test(mdataApi)) {
    errs.push("getDriver must be declared as getDriver(id: string, operatingCompanyId: string)");
  }

  for (const { file, idArg, companyVar } of SCOPED_PAGES) {
    if (!Object.prototype.hasOwnProperty.call(pages, file)) continue;
    const src = pages[file] ?? "";
    if (!src) {
      errs.push(`${file}: missing`);
      continue;
    }
    if (!/useCompanyContext\s*\(/.test(src)) {
      errs.push(`${file}: must read selected company via useCompanyContext()`);
    }
    const bareCall = new RegExp(`getDriver\\(\\s*${idArg}\\s*\\)`).test(src);
    const scopedCall = new RegExp(`getDriver\\(\\s*${idArg}\\s*,\\s*${companyVar}\\s*\\)`).test(src);
    if (bareCall && !scopedCall) {
      errs.push(`${file}: getDriver(${idArg}) called without ${companyVar} — entity-scope regression`);
    }
    if (!scopedCall) {
      errs.push(`${file}: expected getDriver(${idArg}, ${companyVar}) scoped call`);
    }
    const enabledGate = new RegExp(`enabled:\\s*Boolean\\([^)]*${companyVar}[^)]*\\)`).test(src);
    if (!enabledGate) {
      errs.push(`${file}: driver query must gate on ${companyVar} (enabled: Boolean(...))`);
    }
  }

  return errs;
}

export function run() {
  const pageMap = Object.fromEntries(
    SCOPED_PAGES.map(({ file }) => [file, read(file)]),
  );
  return check({ mdataApi: read("apps/frontend/src/api/mdata.ts"), pages: pageMap });
}

if (process.argv.includes("--selftest")) {
  const goodApi = "export function getDriver(id: string, operatingCompanyId: string) {";
  const badApi = "export function getDriver(id: string, operatingCompanyId?: string) {";
  const goodPage = `
    useCompanyContext();
    const operatingCompanyId = "x";
    queryFn: () => getDriver(id, operatingCompanyId),
    enabled: Boolean(id && operatingCompanyId),
  `;
  const badPage = `
    useCompanyContext();
    queryFn: () => getDriver(id),
    enabled: Boolean(id),
  `;

  const ok = check({
    mdataApi: goodApi,
    pages: {
      "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx": goodPage,
    },
  });
  const bad = check({
    mdataApi: badApi,
    pages: {
      "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx": badPage,
    },
  });

  if (ok.length > 0 || bad.length === 0) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const errs = run();
  if (errs.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errs) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — getDriver requires operating_company_id on all profile satellite pages`);
  process.exit(0);
}
