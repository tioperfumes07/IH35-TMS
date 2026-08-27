#!/usr/bin/env node

import fs from "node:fs";

const file = "apps/backend/src/safety/photo-comparison/session.service.ts";
const source = fs.readFileSync(file, "utf8");

const checks = [
  ["shared validator", /async function assertTripPhotoLinksCompany\(/],
  ["driver company or authorization", /d\.operating_company_id = \$1::uuid[\s\S]{0,300}dca\.company_id = \$1::uuid[\s\S]{0,120}dca\.is_authorized = true/],
  ["unit owner or lease", /u\.owner_company_id = \$1::uuid OR u\.currently_leased_to_company_id = \$1::uuid/],
  ["load company and active", /l\.operating_company_id = \$1::uuid\s+AND l\.soft_deleted_at IS NULL/],
  ["every evidence company-bound", /FROM unnest\(COALESCE\(\$5::uuid\[\],[\s\S]{0,260}evidence\.operating_company_id = \$1::uuid/],
  ["failure is explicit", /throw new Error\("photo_link_not_found_for_company"\)/],
  ["upload validates links", /uploadTripPhotoEvidence\([\s\S]{0,420}await assertTripPhotoLinksCompany\(client, input\);/],
  ["session create validates links", /startPreTripSession\([\s\S]{0,420}await assertTripPhotoLinksCompany\(client, input\);/],
];

function failures(text) {
  return checks.flatMap(([label, pattern]) => pattern.test(text) ? [] : [label]);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-photo-comparison-create-link-company-scope FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["d.operating_company_id = $1::uuid", "TRUE"],
    ["dca.company_id = $1::uuid", "TRUE"],
    ["u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid", "TRUE"],
    ["l.operating_company_id = $1::uuid", "TRUE"],
    ["AND l.soft_deleted_at IS NULL", ""],
    ["evidence.operating_company_id = $1::uuid", "TRUE"],
    ["throw new Error(\"photo_link_not_found_for_company\")", "return"],
    ["  await assertTripPhotoLinksCompany(client, input);", ""],
    ["  await assertTripPhotoLinksCompany(client, input);", ""],
  ];
  let candidate = source;
  for (let index = 0; index < mutations.length; index += 1) {
    const [from, to] = mutations[index];
    const changed = index === mutations.length - 1
      ? candidate.replace(from, to)
      : source.replace(from, to);
    if (changed === (index === mutations.length - 1 ? candidate : source)) {
      console.error(`selftest setup failed: ${from}`);
      process.exit(1);
    }
    if (failures(changed).length === 0) {
      console.error(`selftest mutation escaped: ${from}`);
      process.exit(1);
    }
    if (index === mutations.length - 2) candidate = changed;
  }
  console.log(`verify-photo-comparison-create-link-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-photo-comparison-create-link-company-scope PASS — photo upload and session creation reject cross-company driver/unit/load/evidence links");
