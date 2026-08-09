#!/usr/bin/env node
/**
 * FAIL-SET1 + FAIL-SET2 ratchet — Settlements list + detail header must show human period and driver.
 *
 * SET1: period dates through formatDateUS — never raw ISO in JSX.
 * SET2: never render driver_display_id / driverDisplayId (view defines it as d.id::text UUID).
 *
 * Covers SettlementsTable + SettlementHeader + SettlementDetailPage call site.
 * Static only — no DB, no network, no build.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";
const HEADER = "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx";
const DETAIL = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const failures = [];

function checkTable() {
  const src = readFileSync(join(repoRoot, TABLE), "utf8");
  const code = stripComments(src);
  const displayIdUse = /driver_display_id/.exec(code);
  if (displayIdUse) {
    const line = code.slice(0, displayIdUse.index).split("\n").length;
    failures.push(
      `${TABLE}:${line}: renders \`driver_display_id\`, which the view defines as \`d.id::text\` — that is a raw UUID, not a display id.`,
    );
  }
  for (const field of ["period_start", "period_end"]) {
    const raw = new RegExp(`\\{\\s*row\\.${field}\\s*\\}`).exec(code);
    if (raw) {
      const line = code.slice(0, raw.index).split("\n").length;
      failures.push(
        `${TABLE}:${line}: renders \`row.${field}\` raw — an ISO timestamp reaches the user. Use formatDateUS().`,
      );
    }
  }
  if (!/formatDateUS\s*\(\s*row\.period_start/.test(code) || !/formatDateUS\s*\(\s*row\.period_end/.test(code)) {
    failures.push(`${TABLE}: the Period cell must render both period_start and period_end through formatDateUS().`);
  }
}

function checkHeader() {
  const src = readFileSync(join(repoRoot, HEADER), "utf8");
  const code = stripComments(src);
  if (/driverDisplayId|driver_display_id/.test(code)) {
    failures.push(`${HEADER}: must not accept/render driverDisplayId / driver_display_id (UUID-as-label)`);
  }
  if (!/formatDateUS\s*\(\s*periodStart/.test(code) || !/formatDateUS\s*\(\s*periodEnd/.test(code)) {
    failures.push(`${HEADER}: Settlement Period must format periodStart and periodEnd via formatDateUS()`);
  }
  if (/\{periodStart\}\s*[—\-]\s*\{periodEnd\}/.test(code)) {
    failures.push(`${HEADER}: raw periodStart/periodEnd interpolated into JSX`);
  }
}

function checkDetail() {
  const src = readFileSync(join(repoRoot, DETAIL), "utf8");
  const code = stripComments(src);
  if (/driverDisplayId\s*=/.test(code) || /driver_display_id/.test(code)) {
    failures.push(`${DETAIL}: must not pass driver_display_id / driverDisplayId into SettlementHeader`);
  }
}

function checkPreSettlements() {
  const TARGET = "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx";
  const src = readFileSync(join(repoRoot, TARGET), "utf8");
  const code = stripComments(src);
  if (/driver_display_id/.test(code)) {
    failures.push(`${TARGET}: must not use driver_display_id (UUID-as-label)`);
  }
  if (!/formatDateUS\s*\(\s*settlement\.period_start/.test(code) || !/formatDateUS\s*\(\s*settlement\.period_end/.test(code)) {
    failures.push(`${TARGET}: period labels must use formatDateUS`);
  }
}

checkTable();
checkHeader();
checkDetail();
checkPreSettlements();

if (failures.length > 0) {
  console.error("FAIL verify-settlements-grid-honest-labels");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "PASS verify-settlements-grid-honest-labels — list+header+presettlements period formatted, no uuid-as-display-id",
);
