#!/usr/bin/env node
/** FACT-S01 — Factoring home KPI + need-company + summary ListErrorBanner.
 * ROUND 443.267 board 4: KPI strip / ListErrorBanner / getFactoringSummary live on FactoringHomeBoard;
 * FactoringHome still mounts the board, keeps need-company, and keeps canonical factor writers. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-s01-home-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const BOARD = "apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive(home, board) {
  const problems = [];
  if (!home.includes('data-testid="factoring-home-need-company"')) problems.push("need-company missing");
  if (!/<FactoringHomeBoard/.test(home)) problems.push("FactoringHomeBoard not mounted");
  if (!board.includes('data-testid="factoring-home-kpi-row"')) problems.push("kpi-row missing on board");
  if (!board.includes("ListErrorBanner")) problems.push("ListErrorBanner missing on board");
  if (!board.includes("summaryQuery.isError")) problems.push("summary error gate missing on board");
  if (!board.includes("getFactoringSummary")) problems.push("KPI must use getFactoringSummary");
  if (!board.includes("enabled: Boolean(companyId)")) problems.push("summary not company-gated");
  if (home.includes("activeFactorVendor")) problems.push("dual-path activeFactorVendor present");
  if (/parseVendorNotes|serializeVendorNotes/.test(home)) problems.push("vendor-notes profile path present");
  if (!home.includes("listFactors") || !home.includes("updateFactor")) problems.push("canonical factor profile writers missing");
  if (!board.includes("No factor configured")) problems.push("honest empty copy missing");
  return problems;
}

if (SELFTEST) {
  const home = read(PAGE);
  const board = read(BOARD);
  const live = assertLive(home, board);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const planted = board.replace(/data-testid="factoring-home-kpi-row"/, 'data-testid="x"');
  if (!assertLive(home, planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive(read(PAGE), read(BOARD));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
