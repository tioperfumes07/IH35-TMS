#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/compliance/FilingsComplianceDueSection.tsx";
const LABEL = "verify-compliance-filings-error-honesty";

function failures(source) {
  const errors = [];
  for (const needle of [
    "dashboardQ.isError ? (",
    'title="Couldn\'t load filings and compliance due"',
    "onRetry={() => void dashboardQ.refetch()}",
    "<ParityTable<FilingItem>",
  ]) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  const errorIndex = source.indexOf("dashboardQ.isError ? (");
  const tableIndex = source.indexOf("<ParityTable<FilingItem>");
  if (errorIndex < 0 || tableIndex < errorIndex) errors.push("table must render inside the successful query branch");
  // BANK-F91341 leftover refuse — FilingsComplianceDueSection page-scoped text token ratchet
  if (source.includes("text-[11px]")) errors.push("FilingsComplianceDueSection.tsx: leftover text-[11px]");
  if (source.includes("#8A92AB")) errors.push("FilingsComplianceDueSection.tsx: leftover off-scale muted #8A92AB");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `{dashboardQ.isError ? (<ListErrorState title="Couldn't load filings and compliance due" onRetry={() => void dashboardQ.refetch()} />) : (<ParityTable<FilingItem> />)}`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed`);
  const mutations = [
    "dashboardQ.isError ? (",
    'title="Couldn\'t load filings and compliance due"',
    "onRetry={() => void dashboardQ.refetch()}",
    "<ParityTable<FilingItem>",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  // BANK-F91341 leftover plant
  const leftoverPlant = good + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  if (!failures(leftoverPlant).some((e) => e.includes("leftover text-[11px]"))) {
    throw new Error(`${LABEL}: leftover plant escaped`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length} mutations caught)`);
} else {
  const errors = failures(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}
