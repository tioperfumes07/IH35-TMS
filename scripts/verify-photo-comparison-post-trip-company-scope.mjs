#!/usr/bin/env node

import fs from "node:fs";

const files = {
  service: "apps/backend/src/safety/photo-comparison/session.service.ts",
  routes: "apps/backend/src/safety/photo-comparison/routes.ts",
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

const checks = [
  ["service accepts canonical company", "service", /submitPostTripPhotos\(\s*client: DbClient,\s*operatingCompanyId: string,/],
  ["mutation binds canonical company", "service", /WHERE uuid = \$1::uuid\s+AND operating_company_id = \$3::uuid/],
  ["mutation supplies company parameter", "service", /\[sessionUuid, evidenceUuids, operatingCompanyId\]/],
  ["mutation does not trust session GUC", "service", (text) => !/submitPostTripPhotos[\s\S]{0,1100}current_setting\('app\.operating_company_id'/.test(text)],
  ["route forwards validated body company", "routes", /submitPostTripPhotos\(\s*client,\s*body\.data\.operating_company_id,\s*params\.data\.session_uuid,\s*body\.data\.evidence_uuids/],
];

function failures(candidate) {
  return checks.flatMap(([label, key, test]) => {
    const text = candidate[key];
    const ok = test instanceof RegExp ? test.test(text) : test(text);
    return ok ? [] : [label];
  });
}

const problems = failures(sources);
if (problems.length) {
  console.error(`verify-photo-comparison-post-trip-company-scope FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      key: "service",
      from: "export async function submitPostTripPhotos(\n  client: DbClient,\n  operatingCompanyId: string,",
      to: "export async function submitPostTripPhotos(\n  client: DbClient,",
    },
    { key: "service", from: "AND operating_company_id = $3::uuid", to: "AND TRUE" },
    { key: "service", from: "[sessionUuid, evidenceUuids, operatingCompanyId]", to: "[sessionUuid, evidenceUuids]" },
    { key: "service", from: "AND operating_company_id = $3::uuid", to: "AND operating_company_id::text = current_setting('app.operating_company_id', true)" },
    { key: "routes", from: "        body.data.operating_company_id,", to: "" },
  ];
  for (const mutation of mutations) {
    const changed = sources[mutation.key].replace(mutation.from, mutation.to);
    if (changed === sources[mutation.key]) {
      console.error(`selftest setup failed: ${mutation.from}`);
      process.exit(1);
    }
    if (failures({ ...sources, [mutation.key]: changed }).length === 0) {
      console.error(`selftest mutation escaped: ${mutation.from}`);
      process.exit(1);
    }
  }
  console.log(`verify-photo-comparison-post-trip-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-photo-comparison-post-trip-company-scope PASS — post-trip mutation carries and binds the authenticated operating company");
