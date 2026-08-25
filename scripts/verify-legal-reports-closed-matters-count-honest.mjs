#!/usr/bin/env node
/**
 * GUARD — verify-legal-reports-closed-matters-count-honest
 *
 * LEGAL-REPORTS-CLOSED-COUNT-SCOPED-TO-CLAIM-AMOUNT: the Legal Reports "Closed matters (count)"
 * card read `settlement_history.closed_n`, a backend field scoped to `status='closed' AND
 * amount_claimed_against_us IS NOT NULL` (correct for computing an average settled claim, wrong
 * for a total count). A real closed matter with no monetary claim amount
 * (`CC3-F12-VERIFY-20260823`, live Neon) was invisible: card showed 0 while 1 closed matter
 * existed. Fix: a separate unscoped `total_closed_matters` count, and the FE card reads that.
 *
 * METHOD: static source-text assertions on the backend summary function and the FE card.
 * --selftest mutates the REAL files and requires the assertions to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-legal-reports-closed-matters-count-honest";
const BACKEND = "apps/backend/src/legal/matters.service.ts";
const FE = "apps/frontend/src/pages/legal/reports/LegalReportsLandingPage.tsx";

export function checkBackend(text) {
  const problems = [];
  const fn = text.slice(text.indexOf("export async function legalMattersReportsSummary"));
  if (!/total_closed_matters/.test(fn)) {
    problems.push("legalMattersReportsSummary does not return total_closed_matters.");
    return problems;
  }
  // The totalClosed query must NOT filter on amount_claimed_against_us.
  const varStart = fn.indexOf("const totalClosed = await client.query(");
  if (varStart === -1) {
    problems.push("could not find `const totalClosed = await client.query(...)`.");
    return problems;
  }
  const varEnd = fn.indexOf(");", varStart);
  const totalClosedBlock = fn.slice(varStart, varEnd === -1 ? undefined : varEnd);
  if (!/status = 'closed'/.test(totalClosedBlock)) {
    problems.push("totalClosed query does not filter on status = 'closed'.");
  }
  if (/amount_claimed_against_us/.test(totalClosedBlock)) {
    problems.push(
      "totalClosed query also filters on amount_claimed_against_us — that reintroduces the " +
        "undercount bug (a closed matter with no claim amount would be excluded again)."
    );
  }
  return problems;
}

export function checkFrontend(text) {
  const problems = [];
  const cardMatch = text.match(/label="Closed matters \(count\)"[\s\S]{0,200}?\/>/);
  if (!cardMatch) {
    problems.push('could not find the "Closed matters (count)" Card element.');
    return problems;
  }
  if (/settlement_history[\s\S]*?closed_n/.test(cardMatch[0])) {
    problems.push(
      'the "Closed matters (count)" card still reads settlement_history.closed_n — that field is ' +
        "scoped to matters WITH a claim amount and undercounts real closed matters."
    );
  }
  if (!/total_closed_matters/.test(cardMatch[0])) {
    problems.push('the "Closed matters (count)" card does not read total_closed_matters.');
  }
  return problems;
}

function run() {
  const backendText = readFileSync(BACKEND, "utf8");
  const feText = readFileSync(FE, "utf8");
  const problems = [...checkBackend(backendText), ...checkFrontend(feText)];
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Legal Reports "Closed matters (count)" reads a true unscoped closed-status count, not the claim-amount-scoped settlement average denominator.`);
}

function selftest() {
  const backendReal = readFileSync(BACKEND, "utf8");
  const feReal = readFileSync(FE, "utf8");
  const failures = [];

  if (checkBackend(backendReal).length) failures.push("backend baseline (real fixed file) should pass");
  if (checkFrontend(feReal).length) failures.push("frontend baseline (real fixed file) should pass");

  // Offender 1: backend never adds total_closed_matters (original bug shape).
  const noTotalClosed = backendReal.replace(/\s*total_closed_matters: totalClosed\.rows\[0\]\?\.n \?\? 0,\n/, "\n");
  const p1 = checkBackend(noTotalClosed);
  if (!p1.some((m) => m.includes("does not return total_closed_matters"))) {
    failures.push(`offender-1 (backend missing total_closed_matters) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: FE reverts to reading settlement_history.closed_n (the original bug).
  const feOffender = feReal.replace(
    /value=\{countOrNull\(s\.total_closed_matters as number \| undefined\)\}/,
    'value={countOrNull((s.settlement_history as { closed_n?: number })?.closed_n)}'
  );
  const p2 = checkFrontend(feOffender);
  if (!p2.some((m) => m.includes("still reads settlement_history.closed_n"))) {
    failures.push(`offender-2 (FE reverted to closed_n) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 2/2 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
