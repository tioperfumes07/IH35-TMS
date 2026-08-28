#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/insurance/ClaimCreateModal.tsx";
const source = fs.readFileSync(file, "utf8");

function findings(text) {
  const out = [];
  if (!/accidentsQuery\.isError\s*\?\s*\[\]\s*:\s*\(accidentsQuery\.data\s*\?\?\s*\[\]\)/.test(text)) {
    out.push("cached accident rows remain available after failed refetch");
  }
  if (!/disabled=\{accidentsQuery\.isError\}/.test(text)) out.push("accident picker is active while read is failed");
  if (!/Retry accident reports[\s\S]*?accidentsQuery\.refetch|accidentsQuery\.refetch[\s\S]*?Retry accident reports/.test(text)) {
    out.push("accident read failure has no exact Retry path");
  }
  return out;
}

const clean = findings(source);
if (clean.length) {
  console.error(clean.join("\n"));
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const planted = source.replace("accidentsQuery.isError ? []", "false ? []");
  if (!findings(planted).some((line) => line.includes("cached accident rows"))) {
    console.error("selftest failed: stale-row mutation escaped");
    process.exit(1);
  }
}
console.log(`verify-insurance-claim-accident-read-recovery: PASS${process.argv.includes("--selftest") ? " (mutation caught)" : ""}`);
