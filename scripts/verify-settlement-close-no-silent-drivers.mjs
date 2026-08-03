#!/usr/bin/env node
/**
 * SettlementCloseArrivalPage — no silent listDrivers(limit:500); names from open-by-driver join.
 * Cursor even claim: 2136.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-close-no-silent-drivers";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx";
const ROUTE = "apps/backend/src/driver-finance/pre-settlement.routes.ts";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const page = readRel(root, PAGE);
  const route = readRel(root, ROUTE);
  if (!page) problems.push(`missing ${PAGE}`);
  if (!route) problems.push(`missing ${ROUTE}`);
  if (!page || !route) return problems;

  const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (/listDrivers\(/.test(pageCode) || /limit:\s*500/.test(pageCode)) {
    problems.push(`${PAGE}: must not silent-fetch listDrivers(limit:500)`);
  }
  if (!/driver_name/.test(pageCode)) {
    problems.push(`${PAGE}: must use driver_name from open-by-driver payload`);
  }
  if (!/AS driver_name/.test(route) || !/JOIN mdata\.drivers/.test(route)) {
    problems.push(`${ROUTE}: open-by-driver must JOIN mdata.drivers AS driver_name`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-settle-close-"));
  try {
    const fe = path.join(stubRoot, "apps/frontend/src/pages/driver-finance");
    const be = path.join(stubRoot, "apps/backend/src/driver-finance");
    fs.mkdirSync(fe, { recursive: true });
    fs.mkdirSync(be, { recursive: true });
    fs.writeFileSync(
      path.join(fe, "SettlementCloseArrivalPage.tsx"),
      `listDrivers({ operating_company_id: companyId, status: "Active", limit: 500 })
const map = driverNameById
`
    );
    fs.writeFileSync(
      path.join(be, "pre-settlement.routes.ts"),
      `SELECT s.id AS settlement_id, s.driver_id FROM driver_finance.driver_settlements s`
    );
    const planted = collectProblems(stubRoot);
    if (!planted.length) {
      console.error(`${LABEL} SELFTEST FAIL: planted stub did not FAIL`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — settlement close no silent drivers`);
}
