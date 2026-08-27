#!/usr/bin/env node
// @matrix-built {"modules":["safety","drivers","customers","users"],"cols":["driver","customer","connectivity","reverse_link","qbo_chrome"],"leaves":["complaints.list","profile.safety_reverse","md.customer_details","users.detail"],"task":"SAFETY-F6869-COMPLAINT-HISTORY-SILENT-500-CAP-ALL-REVERSE"}
import fs from "node:fs";

const files = {
  backend: "apps/backend/src/routes/safety/complaints.ts",
  api: "apps/frontend/src/api/safety.ts",
  apiV64: "apps/frontend/src/api/safetyV64.ts",
  tab: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
  legacy: "apps/frontend/src/pages/safety/ComplaintsPage.tsx",
  driver: "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  shared: "apps/frontend/src/components/safety/ComplaintsReverseSection.tsx",
  customer: "apps/frontend/src/pages/CustomerDetail.tsx",
  user: "apps/frontend/src/pages/UserDetail.tsx",
};
const live = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(source) {
  const failures = [];
  if (!/limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/.test(source.backend) || !/offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(source.backend)) failures.push("bounded backend range schema");
  if (!/SELECT COUNT\(\*\)::int AS total_count[\s\S]{0,180}WHERE c\.operating_company_id = \$1::uuid[\s\S]{0,100}\$\{reverseFilter\}/.test(source.backend)) failures.push("exact scoped count");
  if (!/LIMIT \$\$\{limitParam\} OFFSET \$\$\{offsetParam\}/.test(source.backend) || !/complaints: res\.rows, total_count: totalCount/.test(source.backend)) failures.push("ranged rows + exact total response");
  for (const key of ["api", "apiV64"]) {
    const functionName = key === "api" ? "getComplaints" : "listComplaints";
    const contract = new RegExp(`function ${functionName}\\([\\s\\S]{0,260}limit\\?: number; offset\\?: number[\\s\\S]{0,700}total_count: number`);
    if (!contract.test(source[key])) failures.push(`${key} range contract`);
  }
  if (!/offset: \(page - 1\) \* pageSize/.test(source.tab) || !/complaints-tab-server-pager/.test(source.tab) || !/hidePager/.test(source.tab)) failures.push("canonical complaints tab pager");
  if (!/setPage\(1\), \[companyId, effectiveDriverId\]/.test(source.tab) || !/complaintTotal[\s\S]{0,180}complaintPageCount/.test(source.tab)) failures.push("canonical tab reset + exact total");
  if (!/offset: \(page - 1\) \* pageSize/.test(source.legacy) || !/complaints-page-server-pager/.test(source.legacy)) failures.push("mounted legacy list pager");
  if (!/offset: \(complaintPage - 1\) \* complaintPageSize/.test(source.driver) || !/driver-safety-reverse-complaints-pager/.test(source.driver) || !/count=\{complaintTotal\}/.test(source.driver)) failures.push("driver reverse pager + exact total");
  if (!/offset: \(page - 1\) \* pageSize/.test(source.shared) || !/complaints-reverse-server-pager/.test(source.shared) || !/data\?\.total_count/.test(source.shared)) failures.push("customer/user reverse pager + exact total");
  if (!/<ComplaintsReverseSection[\s\S]{0,180}customer_id/.test(source.customer)) failures.push("customer reverse mount");
  if (!/<ComplaintsReverseSection[\s\S]{0,180}user_id/.test(source.user)) failures.push("user reverse mount");
  return failures;
}

const failures = audit(live);
if (failures.length) {
  console.error(`FAIL verify-safety-complaints-range-vertical: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["backend", "COUNT(*)::int AS total_count", "COUNT(*) AS hidden_total"],
    ["backend", "LIMIT $${limitParam} OFFSET $${offsetParam}", "LIMIT 500"],
    ["api", "params: { driver_id?: string; customer_id?: string; user_id?: string; limit?: number; offset?: number }", "params: { driver_id?: string; customer_id?: string; user_id?: string }"],
    ["apiV64", "params: { driver_id?: string; customer_id?: string; user_id?: string; limit?: number; offset?: number }", "params: { driver_id?: string; customer_id?: string; user_id?: string }"],
    ["tab", "offset: (page - 1) * pageSize", "offset: 0"],
    ["tab", "complaints-tab-server-pager", "complaints-tab-summary"],
    ["legacy", "complaints-page-server-pager", "complaints-page-summary"],
    ["driver", "count={complaintTotal}", "count={complaints.length}"],
    ["driver", "driver-safety-reverse-complaints-pager", "driver-safety-reverse-complaints-summary"],
    ["shared", "complaints-reverse-server-pager", "complaints-reverse-summary"],
    ["customer", "<ComplaintsReverseSection", "<MissingComplaintsReverseSection"],
    ["user", "<ComplaintsReverseSection", "<MissingComplaintsReverseSection"],
  ];
  for (const [key, needle, replacement] of mutations) {
    if (!live[key].includes(needle)) {
      console.error(`FAIL selftest: missing mutation anchor ${key}:${needle}`);
      process.exit(1);
    }
    const mutant = { ...live, [key]: live[key].replace(needle, replacement) };
    if (!audit(mutant).length) {
      console.error(`FAIL selftest: mutation survived ${key}:${needle}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-safety-complaints-range-vertical --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else {
  console.log("PASS verify-safety-complaints-range-vertical (12/12 checks)");
}
