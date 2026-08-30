#!/usr/bin/env node

/**
 * @matrix-built safety:claims.cargo_claims:{connectivity,reverse_link}
 * SAF-F7530: Cargo Claim Intake must not translate failed relationship reads into
 * empty pickers, missing labels, or a blank detail panel.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const relative = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const original = fs.readFileSync(path.join(root, relative), "utf8");

const contracts = [
  ["suggestionQuery", "suggest-load-error", "automatic load suggestion"],
  ["customersQuery", "customers-error", "claimant picker"],
  ["reasonsQuery", "reasons-error", "claim-reason picker"],
  ["loadsQuery", "load-labels-error", "load names"],
  ["detailQuery", "detail-error", "selected cargo claim"],
];

function failures(source) {
  const found = [];
  for (const [query, testId, message] of contracts) {
    if (!source.includes(`${query}.isError ? (`)) found.push(`${query} failure is not rendered`);
    if (!source.includes(`\${pageTestId}-${testId}`)) found.push(`${query} failure has no stable test id`);
    if (!source.includes(`${query}.refetch()`)) found.push(`${query} failure has no exact Retry`);
    if (!source.includes(message)) found.push(`${query} failure copy lost its specific consumer context`);
  }
  return found;
}

const baseline = failures(original);
if (baseline.length) {
  console.error(`verify-safety-cargo-claim-read-errors: FAIL\n- ${baseline.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const survivors = [];
  for (const [query] of contracts) {
    const needle = `${query}.isError ? (`;
    const mutated = original.replace(needle, `${query}.isPending ? (`);
    if (mutated === original || failures(mutated).length === 0) survivors.push(query);
  }
  if (survivors.length) {
    console.error(`verify-safety-cargo-claim-read-errors: SELFTEST FAIL — surviving mutations: ${survivors.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-safety-cargo-claim-read-errors: SELFTEST PASS — ${contracts.length}/${contracts.length} read-error mutations rejected`);
  process.exit(0);
}

console.log("verify-safety-cargo-claim-read-errors: PASS — suggestion, picker, relationship-label, and detail reads fail visibly with exact Retry");
