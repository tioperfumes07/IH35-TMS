#!/usr/bin/env node

import fs from "node:fs";

const file = "apps/backend/src/safety/photo-comparison/session.service.ts";
const source = fs.readFileSync(file, "utf8");
const block = source.match(/export async function submitPostTripPhotos[\s\S]*?export async function getSession/)?.[0] ?? "";

const checks = [
  ["session company predicate", /WHERE uuid = \$1::uuid\s+AND operating_company_id = \$3::uuid/],
  ["all submitted evidence enumerated", /FROM unnest\(\$2::uuid\[\]\) evidence_id/],
  ["missing evidence rejects update", /AND NOT EXISTS \(\s*SELECT 1\s*FROM unnest\(\$2::uuid\[\]\) evidence_id/],
  ["evidence table ownership check", /FROM documents\.damage_photo_evidence evidence[\s\S]{0,150}evidence\.id = evidence_id[\s\S]{0,100}evidence\.operating_company_id = \$3::uuid/],
  ["ownership check is atomic with update", /UPDATE safety\.photo_comparison_sessions[\s\S]{0,700}NOT EXISTS[\s\S]{0,500}post_trip_evidence_uuids IS NULL/],
];

function failures(text) {
  return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]);
}

const problems = failures(block);
if (problems.length) {
  console.error(`verify-photo-comparison-post-trip-evidence-company-scope FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["AND operating_company_id = $3::uuid", "AND TRUE"],
    ["FROM unnest($2::uuid[]) evidence_id", "FROM unnest(ARRAY[]::uuid[]) evidence_id"],
    ["evidence.id = evidence_id", "TRUE"],
    ["evidence.operating_company_id = $3::uuid", "TRUE"],
    ["AND NOT EXISTS (", "AND EXISTS ("],
  ];
  for (const [from, to] of mutations) {
    const changed = block.replace(from, to);
    if (changed === block) {
      console.error(`selftest setup failed: ${from}`);
      process.exit(1);
    }
    if (failures(changed).length === 0) {
      console.error(`selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-photo-comparison-post-trip-evidence-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-photo-comparison-post-trip-evidence-company-scope PASS — post-trip session and every submitted photo share one operating company atomically");
