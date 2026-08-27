#!/usr/bin/env node

import fs from "node:fs";

const sources = {
  service: fs.readFileSync("apps/backend/src/safety/photo-comparison/session.service.ts", "utf8"),
  engine: fs.readFileSync("apps/backend/src/safety/photo-comparison/diff-engine.service.ts", "utf8"),
};

const checks = [
  ["result contract carries company", "service", /updateSessionDiffResult\([\s\S]{0,180}sessionUuid: string;\s*operatingCompanyId: string;/],
  ["result update binds company", "service", /UPDATE safety\.photo_comparison_sessions[\s\S]{0,420}WHERE uuid = \$1::uuid\s+AND operating_company_id = \$6::uuid/],
  ["result query supplies company", "service", /input\.autoDamageReportUuid \?\? null,\s*input\.operatingCompanyId,/],
  ["diff engine forwards company", "engine", /updateSessionDiffResult\(client, \{\s*sessionUuid,\s*operatingCompanyId,\s*diffStatus,/],
];

function failures(candidate) {
  return checks.flatMap(([label, key, pattern]) => pattern.test(candidate[key]) ? [] : [label]);
}

const problems = failures(sources);
if (problems.length) {
  console.error(`verify-photo-comparison-diff-result-company-scope FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { key: "service", from: "    operatingCompanyId: string;\n    diffStatus:", to: "    diffStatus:" },
    { key: "service", from: "        AND operating_company_id = $6::uuid", to: "        AND TRUE" },
    {
      key: "service",
      from: "      input.autoDamageReportUuid ?? null,\n      input.operatingCompanyId,",
      to: "      input.autoDamageReportUuid ?? null,",
    },
    { key: "engine", from: "    operatingCompanyId,\n    diffStatus,", to: "    diffStatus," },
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
  console.log(`verify-photo-comparison-diff-result-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-photo-comparison-diff-result-company-scope PASS — analyzed diff results bind their authenticated operating company");
