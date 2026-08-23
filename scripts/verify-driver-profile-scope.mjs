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
    // `async` is tolerated; a REQUIRED, non-optional operatingCompanyId is not. The assertion this
    // guard exists for is that the company param can never be dropped or made optional — that is what
    // fail-closes the driver roster to 0 rows. Pinning the exact declaration TEXT additionally
    // forbade `export async function …`, which is how the aggregate-envelope unwrap had to be written
    // (LV-DRIVER-DETAIL-PAGE-CRASHES: the endpoint returns { driver, … } whenever the company id is
    // sent, so getDriver must await and unwrap). Widened to the SHAPE, never to the requirement —
    // both the optional-param arm and the must-be-declared arm still fire, mutation-proven.
    // A trailing optional 3rd param (`signal?: AbortSignal`, added for
    // LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING's abort-timeout fix) is tolerated —
    // the REQUIRED-ness of operatingCompanyId (2nd param) is what this guard actually protects.
    // Multi-line Prettier params (`getDriver(\n  id: string,\n  operatingCompanyId: string,`) are
    // also tolerated — whitespace between `getDriver(` and `id:` is allowed, not just after.
  } else if (/export (?:async )?function getDriver\(\s*id: string,\s*operatingCompanyId\?\: string[\s\S]{0,80}?\)/.test(mdataApi)) {
    errs.push("getDriver(id, operatingCompanyId?) must require operatingCompanyId (remove optional ?)");
  } else if (!/export (?:async )?function getDriver\(\s*id: string,\s*operatingCompanyId: string[\s\S]{0,80}?\)/.test(mdataApi)) {
    errs.push("getDriver must be declared as getDriver(id: string, operatingCompanyId: string) (async is allowed)");
  }

  if (!/export function listDriverQualifications\(driverId: string, operatingCompanyId: string, includeInactive\?: boolean\)/.test(mdataApi)) {
    errs.push("listDriverQualifications must require operatingCompanyId");
  }
  if (!/operating_company_id: operatingCompanyId/.test(mdataApi)) {
    errs.push("driver qualification readers must send operating_company_id");
  }
  if (!/export function getDriverQualificationRateHistory\(driverId: string, qualificationId: string, operatingCompanyId: string\)/.test(mdataApi)) {
    errs.push("getDriverQualificationRateHistory must require operatingCompanyId");
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
    // Tolerate a trailing 3rd call-site arg (e.g. `, signal`) — the entity-scope requirement this
    // guard protects is that companyVar is present as the 2nd arg, not that nothing follows it.
    const scopedCall = new RegExp(`getDriver\\(\\s*${idArg}\\s*,\\s*${companyVar}\\s*(?:,[^)]*)?\\)`).test(src);
    if (bareCall && !scopedCall) {
      errs.push(`${file}: getDriver(${idArg}) called without ${companyVar} — entity-scope regression`);
    }
    if (!scopedCall) {
      errs.push(`${file}: expected getDriver(${idArg}, ${companyVar}) scoped call`);
    }
    if (file.endsWith("DriverDetail.tsx")) {
      if (!/listDriverQualifications\(id, companyId, showInactiveQualifications\)/.test(src)) {
        errs.push(`${file}: qualifications GET must use selected companyId`);
      }
      if (!/getDriverQualificationRateHistory\(id, selectedQualificationId, companyId\)/.test(src)) {
        errs.push(`${file}: qualification history GET must use selected companyId`);
      }
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
  const scopedSatelliteApi = `
    export function listDriverQualifications(driverId: string, operatingCompanyId: string, includeInactive?: boolean) {
      new URLSearchParams({ operating_company_id: operatingCompanyId });
    }
    export function getDriverQualificationRateHistory(driverId: string, qualificationId: string, operatingCompanyId: string) {}
  `;
  const goodApi = "export function getDriver(id: string, operatingCompanyId: string) {" + scopedSatelliteApi;
  const badApi = "export function getDriver(id: string, operatingCompanyId?: string) {" + scopedSatelliteApi;
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

  const driverDetailSatellite = `
    useCompanyContext();
    queryFn: () => getDriver(id, companyId),
    enabled: Boolean(id && companyId),
    listDriverQualifications(id, companyId, showInactiveQualifications);
    getDriverQualificationRateHistory(id, selectedQualificationId, companyId);
  `;
  const badSatelliteApi = goodApi.replace(
    "listDriverQualifications(driverId: string, operatingCompanyId: string, includeInactive?: boolean)",
    "listDriverQualifications(driverId: string, includeInactive?: boolean)"
  );
  const badSatellitePage = driverDetailSatellite.replace(
    "getDriverQualificationRateHistory(id, selectedQualificationId, companyId)",
    "getDriverQualificationRateHistory(id, selectedQualificationId)"
  );
  if (
    check({ mdataApi: goodApi, pages: { "apps/frontend/src/pages/DriverDetail.tsx": driverDetailSatellite } }).length > 0 ||
    check({ mdataApi: badSatelliteApi, pages: { "apps/frontend/src/pages/DriverDetail.tsx": driverDetailSatellite } }).length === 0 ||
    check({ mdataApi: goodApi, pages: { "apps/frontend/src/pages/DriverDetail.tsx": badSatellitePage } }).length === 0
  ) {
    console.error(`${LABEL} --selftest FAIL — selected-company qualification satellite mutation escaped`);
    process.exit(1);
  }

  // The real getDriver() shape as of LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING:
  // multi-line Prettier params + a trailing optional 3rd `signal` param, and call sites passing a
  // 3rd `signal` argument. Both must still be accepted as scoped.
  const multilineApi = `export async function getDriver(\n  id: string,\n  operatingCompanyId: string,\n  signal?: AbortSignal\n): Promise<Driver> {` + scopedSatelliteApi;
  const threeArgPage = `
    useCompanyContext();
    const operatingCompanyId = "x";
    queryFn: ({ signal }) => getDriver(id, operatingCompanyId, signal),
    enabled: Boolean(id && operatingCompanyId),
  `;
  const okReal = check({
    mdataApi: multilineApi,
    pages: {
      "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx": threeArgPage,
    },
  });
  if (okReal.length > 0) {
    console.error(`${LABEL} --selftest FAIL — real multi-line/3-arg shape wrongly rejected:`, okReal);
    process.exit(1);
  }

  // Negative: the 3-arg tolerance must not become a blanket escape hatch — a call site missing
  // operatingCompanyId entirely (even with a signal arg following) must still be caught.
  const badThreeArgPage = `
    useCompanyContext();
    queryFn: ({ signal }) => getDriver(id, signal),
    enabled: Boolean(id),
  `;
  const badReal = check({
    mdataApi: multilineApi,
    pages: {
      "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx": badThreeArgPage,
    },
  });
  if (badReal.length === 0) {
    console.error(`${LABEL} --selftest FAIL — missing operatingCompanyId with a trailing arg escaped detection`);
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
