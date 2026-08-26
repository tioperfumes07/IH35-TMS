#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";
const source = fs.readFileSync(target, "utf8");

function failures(candidate) {
  const errors = [];
  if (!/const activeCompanies = useMemo\(\s*\(\) => \(companiesQuery\.data \?\? \[\]\)\.filter\(\(company\) => company\.is_active\)/.test(candidate)) {
    errors.push("active company catalog must be derived from listMyCompanies");
  }
  if (!candidate.includes("activeCompanies.find((company) => company.is_default) ?? activeCompanies[0]")) {
    errors.push("default seed must come from active companies only");
  }
  if (!candidate.includes("options={activeCompanies.map((company) => ({")) {
    errors.push("Operating Company Combobox must expose active companies only");
  }
  if (!candidate.includes("const hasCompanies = activeCompanies.length > 0;")) {
    errors.push("baseline readiness must use the active catalog");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(".filter((company) => company.is_active)", ""),
    source.replace("activeCompanies.find((company) => company.is_default)", "(companiesQuery.data ?? []).find((company) => company.is_default)"),
    source.replace("options={activeCompanies.map((company) => ({", "options={(companiesQuery.data ?? []).map((company) => ({"),
  ];
  const caught = mutations.filter((candidate) => failures(candidate).length).length;
  if (caught !== mutations.length) {
    console.error(`FAIL: caught ${caught}/${mutations.length} planted inactive-company creator defects`);
    process.exit(1);
  }
  console.log(`PASS: ${caught}/${mutations.length} planted inactive-company creator defects caught`);
}

const errors = failures(source);
if (errors.length) {
  console.error(errors.map((error) => `FAIL: ${error}`).join("\n"));
  process.exit(1);
}
console.log("PASS: canonical CreateDriver options, seed, and baseline use active companies only");
