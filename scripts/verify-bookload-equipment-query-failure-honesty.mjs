#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity","qbo_chrome"],"leaves":["dispatch.parity.book_load_equipment_section"],"task":"DSP-F7087-BOOKLOAD-EQUIPMENT-QUERY-FAILURE-HONESTY","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx";
const LABEL = "verify-bookload-equipment-query-failure-honesty";

export function collectProblems(src) {
  const problems = [];
  if (!/trailerEquipmentQuery\.isError[\s\S]{0,220}<ListErrorState[\s\S]{0,180}Trailer requirements unavailable\.[\s\S]{0,180}trailerEquipmentQuery\.refetch\(\)/.test(src)) {
    problems.push("trailer-equipment catalog failure must be visible and retryable");
  }
  if (!/disabled=\{teamsQuery\.isLoading \|\| teamsQuery\.isError\}/.test(src)) {
    problems.push("team preset must be disabled while its canonical roster is unknown");
  }
  if (!/teamsQuery\.isError \? "Teams unavailable"/.test(src)) {
    problems.push("team preset must not call a failed roster optional/empty");
  }
  if (!/teamsQuery\.isError[\s\S]{0,180}<ListErrorState[\s\S]{0,180}Driver teams unavailable\.[\s\S]{0,180}teamsQuery\.refetch\(\)/.test(src)) {
    problems.push("driver-team roster failure must be visible and retryable");
  }
  return problems;
}

const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("trailerEquipmentQuery.isError ? (", "false ? ("),
    source.replace("teamsQuery.isLoading || teamsQuery.isError", "teamsQuery.isLoading"),
    source.replace('teamsQuery.isError ? "Teams unavailable"', 'false ? "Teams unavailable"'),
    source.replace("teamsQuery.isError ? (", "false ? ("),
  ];
  for (const [index, mutated] of mutations.entries()) {
    if (mutated === source || collectProblems(mutated).length === 0) {
      throw new Error(`planted equipment-query mutation ${index + 1} escaped`);
    }
  }
  if (collectProblems(source).length) throw new Error("clean equipment section rejected");
  console.log(`${LABEL} SELFTEST OK — 4/4 failure-honesty mutations rejected`);
  process.exit(0);
}

const problems = collectProblems(source);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Book Load equipment catalogs fail visibly, retry exactly, and never masquerade as empty`);
