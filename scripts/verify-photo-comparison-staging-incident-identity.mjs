#!/usr/bin/env node

import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/safety/photo-comparison/session.service.ts", "utf8");
const block = source.match(/async function ensureStagingIncident[\s\S]*?export async function uploadTripPhotoEvidence/)?.[0] ?? "";
const checks = [
  ["company key", /operating_company_id = \$1::uuid/],
  ["load key", /load_id IS NOT DISTINCT FROM \$2::uuid/],
  ["driver key", /driver_id = \$3::uuid/],
  ["unit key", /unit_id = \$4::uuid/],
  ["all key values supplied", /\[input\.operatingCompanyId, input\.loadUuid, input\.driverUuid, input\.unitUuid\]/],
];

function failures(text) {
  return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]);
}
const problems = failures(block);
if (problems.length) {
  console.error(`verify-photo-comparison-staging-incident-identity FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id = $1::uuid", "TRUE"],
    ["load_id IS NOT DISTINCT FROM $2::uuid", "TRUE"],
    ["driver_id = $3::uuid", "TRUE"],
    ["unit_id = $4::uuid", "TRUE"],
    ["[input.operatingCompanyId, input.loadUuid, input.driverUuid, input.unitUuid]", "[input.operatingCompanyId, input.loadUuid]"],
  ];
  for (const [from, to] of mutations) {
    const changed = block.replace(from, to);
    if (changed === block || failures(changed).length === 0) {
      console.error(`selftest mutation escaped or missing: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-photo-comparison-staging-incident-identity --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}
console.log("verify-photo-comparison-staging-incident-identity PASS — staging reuse keys company+load+driver+unit");
