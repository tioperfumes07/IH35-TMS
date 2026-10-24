#!/usr/bin/env node
/**
 * BANK-F01 / AUDIT row 2 — Cash posting KPI must not double-convert dollars.
 *
 * History:
 * - #3997: backend returned cents → frontend divided by 100 before money.format.
 * - #4011: backend returns dollars (authoritativeTotalCash / 100) → frontend must NOT divide again.
 *
 * This guard fails closed on either side drifting alone: raw cents assigned in the API payload,
 * or a stale frontend /100 after the API already converted.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGE = "apps/frontend/src/pages/banking/BankingHome.tsx";
const ROUTE = "apps/backend/src/banking/banking.routes.ts";
const BOARD = "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx";
const FE = "apps/frontend/src";
const LABEL = "verify-banking-cash-kpi-cents-unit";

export function auditPage(src) {
  const problems = [];
  const re = /const\s+(cashPosting)\s*=\s*Number\(([^)]*?\btotal_cash\b[^)]*?)\)([^;\n]*)/g;
  const matches = [...src.matchAll(re)];
  // 443.290: the 443.267 Banking Home board (BankingHomeBoard) dropped the Cash-posting KPI — a page with no selector
  // is not a defect; every remaining reader of total_cash anywhere in the frontend is checked by auditFrontendReaders.
  if (matches.length === 0) return problems;
  for (const m of matches) {
    const tail = m[3] ?? "";
    if (/\/\s*100/.test(tail)) {
      problems.push(
        `${PAGE}: \`${m[1]}\` divides total_cash by 100, but the API already returns dollars ` +
          `(authoritativeTotalCash / 100). That double-converts the headline Cash KPI 100× vs tiles.`
      );
    }
  }
  return problems;
}

/** Every frontend read of total_cash (API dollars) must not divide by 100 again. [{ rel, src }] -> problems */
export function auditFrontendReaders(files) {
  const problems = [];
  for (const { rel, src } of files) {
    for (const line of src.split("\n")) {
      if (/\btotal_cash\b/.test(line) && /\btotal_cash\b[^;]*\/\s*100\b/.test(line)) {
        problems.push(`${rel}: reads total_cash and divides by 100 — the API already returns dollars (authoritativeTotalCash / 100); that double-converts 100x.`);
      }
    }
  }
  return problems;
}

/** The live Banking Home money KPIs (443.267 board) format CENTS exactly once, through formatUsdCents. */
export function auditBoard(src) {
  const problems = [];
  for (const k of ["opIn", "opOut"]) {
    if (!src.includes(`formatUsdCents(kpiSplit.${k})`)) problems.push(`${BOARD}: the Money ${k === "opIn" ? "in" : "out"} KPI must format kpiSplit.${k} (cents) through formatUsdCents once`);
  }
  if (/formatUsdCents\([^()]*\/\s*100\b/.test(src)) problems.push(`${BOARD}: formatUsdCents is given a value already divided by 100 — cents are converted once, by the formatter`);
  return problems;
}

function frontendFiles(dir = join(ROOT, FE), out = []) {
  for (const e of readdirSync(dir)) {
    const abs = join(dir, e);
    if (statSync(abs).isDirectory()) { if (e !== "node_modules" && e !== "generated") frontendFiles(abs, out); continue; }
    if (!/\.(ts|tsx)$/.test(e) || /\.test\.|__tests__/.test(abs)) continue;
    const src = readFileSync(abs, "utf8");
    if (src.includes("total_cash")) out.push({ rel: abs.slice(ROOT.length), src });
  }
  return out;
}

export function auditRoute(src) {
  const problems = [];
  if (!/sumAuthoritativeDepositoryCashCents/.test(src)) {
    problems.push(
      `${ROUTE}: total_cash must still derive from sumAuthoritativeDepositoryCashCents so tiles and KPI share one source.`
    );
  }
  if (!/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(src)) {
    problems.push(
      `${ROUTE}: total_cash must be authoritativeTotalCash / 100 (dollars). Raw cents in the KPI payload ` +
        `inflates Cash posting 100× vs per-account tile dollars.`
    );
  }
  if (/total_cash:\s*authoritativeTotalCash\s*[,}\n]/.test(src) && !/total_cash:\s*authoritativeTotalCash\s*\/\s*100/.test(src)) {
    problems.push(`${ROUTE}: total_cash must not assign raw authoritativeTotalCash cents to the KPI payload.`);
  }
  return problems;
}

function auditTree() {
  return [
    ...auditPage(readFileSync(join(ROOT, PAGE), "utf8")),
    ...auditFrontendReaders(frontendFiles()),
    ...auditBoard(readFileSync(join(ROOT, BOARD), "utf8")),
    ...auditRoute(readFileSync(join(ROOT, ROUTE), "utf8")),
  ];
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);

  const doubleConvert = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0) / 100;`;
  if (!auditPage(doubleConvert).some((p) => p.includes("double-converts")))
    failures.push("case1 FAIL — frontend /100 after API dollars was NOT caught");

  const fixedPage = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);`;
  if (auditPage(fixedPage).length !== 0) failures.push("case2 FAIL — direct dollar read wrongly flagged");

  const rawCentsRoute = `sumAuthoritativeDepositoryCashCents(); total_cash: authoritativeTotalCash,`;
  if (!auditRoute(rawCentsRoute).some((p) => p.includes("must not assign raw")))
    failures.push("case3 FAIL — raw cents route assignment was NOT caught");

  const goodRoute =
    `sumAuthoritativeDepositoryCashCents(client, companyId); total_cash: authoritativeTotalCash / 100,`;
  if (auditRoute(goodRoute).length !== 0) failures.push("case4 FAIL — dollar route wrongly flagged");

  // 443.290 — the live derivations after the 443.267 board.
  if (!auditFrontendReaders([{ rel: "x.tsx", src: "const cash = Number(summary.total_cash ?? 0) / 100;" }]).some((p) => p.includes("double-converts")))
    failures.push("case5 FAIL — a frontend total_cash reader dividing by 100 was NOT caught");
  if (auditFrontendReaders([{ rel: "x.tsx", src: "const cash = Number(summary.total_cash ?? 0);" }]).length !== 0)
    failures.push("case6 FAIL — a direct dollar reader was wrongly flagged");
  const board = readFileSync(join(ROOT, BOARD), "utf8");
  if (!auditBoard(board.replace("formatUsdCents(kpiSplit.opIn)", "formatUsdCents(kpiSplit.opIn / 100)")).some((p) => p.includes("already divided")))
    failures.push("case7 FAIL — a board KPI dividing cents before the formatter was NOT caught");
  if (!auditBoard(board.replace("formatUsdCents(kpiSplit.opOut)", "money.format(kpiSplit.opOut)")).some((p) => p.includes("Money out")))
    failures.push("case8 FAIL — a board KPI bypassing the cents formatter was NOT caught");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — double /100 caught, dollar API + direct frontend read pass, raw cents rejected`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Cash KPI uses API dollars once (no frontend /100 after backend /100)`);
}

main();
