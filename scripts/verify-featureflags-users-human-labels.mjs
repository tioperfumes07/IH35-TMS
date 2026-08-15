#!/usr/bin/env node
/** LINK-F5171 — feature override targets and Users probe jobs render human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  manager: "apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx",
  users: "apps/frontend/src/pages/Users.tsx",
  service: "apps/backend/src/lib/feature-flags/service.ts",
  client: "apps/frontend/src/lib/feature-flags-client.ts",
};
const LABEL = "verify-featureflags-users-human-labels";
const SELFTEST = process.argv.includes("--selftest");

const required = {
  service: [/AS user_label/, /AS company_label/, /LEFT JOIN identity\.users u ON u\.id = o\.user_uuid/, /LEFT JOIN org\.companies c ON c\.id = o\.operating_company_id/],
  client: [/user_label: string \| null/, /company_label: string \| null/],
  manager: [/entityLabel\(override\.user_label, override\.user_uuid, "User"\)/, /entityLabel\(override\.company_label, override\.operating_company_id, "Tenant"\)/],
  users: [/entityLabel\(null,\s*probeJobId,\s*"Job"\)/],
};

function assertAll(srcs) {
  const problems = [];
  for (const [key, patterns] of Object.entries(required)) {
    for (const pattern of patterns) if (!pattern.test(srcs[key])) problems.push(`${FILES[key]}: missing ${pattern}`);
  }
  for (const [key, src] of Object.entries(srcs)) {
    if (/user_uuid\.slice\(0,\s*8\)/.test(src) || /operating_company_id\?\.slice\(0,\s*8\)/.test(src) || /probeJobId\.slice\(0,\s*8\)/.test(src)) problems.push(`${FILES[key]}: still UUID-slices`);
  }
  return problems;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    ["service", "AS user_label", "AS missing_user_label"],
    ["service", "AS company_label", "AS missing_company_label"],
    ["service", "LEFT JOIN identity.users u ON u.id = o.user_uuid", "LEFT JOIN identity.users u ON FALSE"],
    ["service", "LEFT JOIN org.companies c ON c.id = o.operating_company_id", "LEFT JOIN org.companies c ON FALSE"],
    ["client", "user_label: string | null", "user_label?: string | null"],
    ["client", "company_label: string | null", "company_label?: string | null"],
    ["manager", 'entityLabel(override.user_label, override.user_uuid, "User")', 'entityLabel(null, override.user_uuid, "User")'],
    ["manager", 'entityLabel(override.company_label, override.operating_company_id, "Tenant")', 'entityLabel(null, override.operating_company_id, "Tenant")'],
    ["users", 'entityLabel(null, probeJobId, "Job")', "probeJobId.slice(0, 8)"],
  ];
  for (const [key, from, to] of mutations) {
    if (!srcs[key].includes(from)) { console.error(`${LABEL} SELFTEST FAILED: mutation anchor missing: ${key} ${from}`); process.exit(1); }
    const planted = { ...srcs, [key]: srcs[key].replace(from, to) };
    if (!assertAll(planted).length) { console.error(`${LABEL} SELFTEST FAILED: planted defect not caught: ${key} ${from}`); process.exit(1); }
  }
  const live = assertAll(srcs);
  if (live.length) { console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS (${mutations.length} mutations)`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
