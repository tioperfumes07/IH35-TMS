#!/usr/bin/env node
/**
 * verify-settlements-table-no-phantom-loads.mjs
 *
 * 0441-mod10-settlement-line-ui-nonexistent-colu — SettlementsTable "Loads"
 * must bind a real per-row load_count (from settlement_lines → driver_bills),
 * never a hardcoded "—" / "no real per-row field yet" placeholder.
 *
 * Static only (no DB). Usage:
 *   node scripts/verify-settlements-table-no-phantom-loads.mjs
 *   node scripts/verify-settlements-table-no-phantom-loads.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";
const API = "apps/frontend/src/api/driverFinance.ts";
const ROUTES = "apps/backend/src/driver-finance/settlements.routes.ts";
const LABEL = "verify-settlements-table-no-phantom-loads";

/** Pure checks — takes source texts so --selftest can inject fixtures. */
export function check({ tableSrc, apiSrc, routesSrc }) {
  const f = [];
  if (!tableSrc) f.push(`${TABLE}: missing`);
  if (!apiSrc) f.push(`${API}: missing`);
  if (!routesSrc) f.push(`${ROUTES}: missing`);
  if (f.length) return f;

  if (/no real per-row field yet/i.test(tableSrc)) {
    f.push(`${TABLE}: still documents phantom Loads column ("no real per-row field yet")`);
  }
  // Loads cell must read load_count (not a lone em-dash placeholder between period/gross).
  if (!/\bload_count\b/.test(tableSrc)) {
    f.push(`${TABLE}: must render row.load_count for the Loads column`);
  }
  if (!/\bload_count\b/.test(apiSrc)) {
    f.push(`${API}: SettlementListRow must declare load_count`);
  }
  if (!/AS load_count/.test(routesSrc)) {
    f.push(`${ROUTES}: list query must SELECT ... AS load_count`);
  }
  if (!/settlement_lines/.test(routesSrc) || !/driver_bills/.test(routesSrc)) {
    f.push(`${ROUTES}: load_count must aggregate via settlement_lines → driver_bills`);
  }
  // ACCT-F275 — COALESCE + LEFT JOIN (sibling: verify-settlement-load-count-counts-both-paths.mjs).
  // COUNT(DISTINCT db.load_id) alone over INNER join dropped bill-less lines while looking "wired".
  if (!/COUNT\s*\(\s*DISTINCT\s+COALESCE\(\s*db\.load_id\s*,\s*sl\.load_id\s*\)\s*\)/i.test(routesSrc)) {
    f.push(`${ROUTES}: load_count must COUNT(DISTINCT COALESCE(db.load_id, sl.load_id))`);
  }
  if (!/LEFT JOIN\s+driver_finance\.driver_bills\s+db/i.test(routesSrc)) {
    f.push(`${ROUTES}: load_count must LEFT JOIN driver_bills (INNER join drops bill-less lines)`);
  }
  return f;
}

export function run() {
  return check({
    tableSrc: fs.readFileSync(path.join(ROOT, TABLE), "utf8"),
    apiSrc: fs.readFileSync(path.join(ROOT, API), "utf8"),
    routesSrc: fs.readFileSync(path.join(ROOT, ROUTES), "utf8"),
  });
}

function selftest() {
  const good = {
    tableSrc: `case "loads": return Number(row.load_count ?? 0);\n<td>{Number(row.load_count ?? 0)}</td>`,
    apiSrc: `load_count: number;`,
    routesSrc: `
      (
        SELECT COUNT(DISTINCT COALESCE(db.load_id, sl.load_id))::int
        FROM driver_finance.settlement_lines sl
        LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
        WHERE sl.settlement_id = s.id
          AND COALESCE(db.load_id, sl.load_id) IS NOT NULL
      ) AS load_count
    `,
  };
  const badPhantom = {
    tableSrc: `// "Loads" has no real per-row field yet\n<td>—</td>`,
    apiSrc: `gross_pay: number;`,
    routesSrc: `SELECT v.*, s.payment_method FROM views.driver_settlement_with_debt v`,
  };
  const cases = [
    { name: "good", src: good, want: 0 },
    { name: "phantom", src: badPhantom, wantMin: 3 },
  ];
  for (const c of cases) {
    const got = check(c.src).length;
    if (c.want != null && got !== c.want) {
      console.error(`${LABEL} --selftest ${c.name}: expected ${c.want} findings, got ${got}`);
      process.exit(1);
    }
    if (c.wantMin != null && got < c.wantMin) {
      console.error(`${LABEL} --selftest ${c.name}: expected >=${c.wantMin} findings, got ${got}`);
      process.exit(1);
    }
  }
  console.log(`[${LABEL}] --selftest OK`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const findings = run();
    if (findings.length) {
      console.error(`[${LABEL}] FAILED`);
      for (const e of findings) console.error("  ✗ " + e);
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — SettlementsTable Loads binds load_count (no phantom —)`);
  }
}
