#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx";
const LABEL = "verify-compliance-overview-error-honesty";

function failures(source) {
  const errors = [];
  for (const needle of [
    "const overviewQueriesFailed = summaryQ.isError || dashboardQ.isError || rulesQ.isError || logQ.isError",
    "{overviewQueriesFailed ? (",
    "{!overviewQueriesFailed ? (",
    "void summaryQ.refetch()",
    "void dashboardQ.refetch()",
    "void rulesQ.refetch()",
    "void logQ.refetch()",
  ]) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `const overviewQueriesFailed = summaryQ.isError || dashboardQ.isError || rulesQ.isError || logQ.isError;
    {overviewQueriesFailed ? (<ListErrorBanner onRetry={() => { void summaryQ.refetch(); void dashboardQ.refetch(); void rulesQ.refetch(); void logQ.refetch(); }} />) : null}
    {!overviewQueriesFailed ? (<SummaryCards />) : null}`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed`);
  const mutations = [
    "summaryQ.isError || ",
    "{overviewQueriesFailed ? (",
    "{!overviewQueriesFailed ? (",
    "void summaryQ.refetch()",
    "void dashboardQ.refetch()",
    "void rulesQ.refetch()",
    "void logQ.refetch()",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length} mutations caught)`);
} else {
  const errors = failures(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}
