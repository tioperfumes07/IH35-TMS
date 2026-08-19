#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-complaint-linkage";
const files = {
  route: "apps/backend/src/routes/safety/complaints.ts",
  identityApi: "apps/frontend/src/api/identity.ts",
  safetyApi: "apps/frontend/src/api/safety.ts",
  page: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
  reverse: "apps/frontend/src/components/safety/ComplaintsReverseSection.tsx",
  customer: "apps/frontend/src/pages/CustomerDetail.tsx",
  user: "apps/frontend/src/pages/UserDetail.tsx",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/listAssignableUsers\(companyId\)/.test(s.page)) failures.push("employee picker must request the selected company");
  if (!/listAssignableUsers[\s\S]{0,180}\?operating_company_id=\$\{encodeURIComponent\(operatingCompanyId\)\}/.test(s.identityApi)) failures.push("assignable-user client must forward operating_company_id");
  for (const alias of ["complainant_driver_ok", "respondent_driver_ok", "customer_ok", "complainant_user_ok", "respondent_user_ok", "complaint_type_ok"]) {
    if (!s.route.includes(`AS ${alias}`)) failures.push(`writer must validate ${alias}`);
  }
  if (!/linked_entity_not_in_operating_company/.test(s.route)) failures.push("writer must reject invalid linked entities before insert");
  if (!/complainant_customer_id = \$\$\{values\.length\}/.test(s.route)) failures.push("customer reverse filter must run in SQL");
  if (!/complainant_user_id = \$\$\{values\.length\} OR c\.respondent_user_id = \$\$\{values\.length\}/.test(s.route)) failures.push("employee reverse filter must cover both roles in SQL");
  if (!/params\.customer_id\) qs\.set\("customer_id"/.test(s.safetyApi) || !/params\.user_id\) qs\.set\("user_id"/.test(s.safetyApi)) failures.push("client must forward customer and employee reverse filters");
  if (!/getComplaints\(operatingCompanyId, filter\)/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("reverse section must use exact server filters and expose errors");
  if (!/<EntityLinkOrTombstone[\s\S]{0,100}kind="complaint"[\s\S]{0,140}id=\{row\.id == null \? null : String\(row\.id\)\}[\s\S]{0,100}name=\{row\.summary\}[\s\S]{0,80}noun="Complaint"/.test(s.reverse)) failures.push("reverse section must drill valid complaint IDs and tombstone missing identities");
  if (!/<ComplaintsReverseSection[\s\S]{0,240}filter=\{\{ customer_id: id \}\}/.test(s.customer)) failures.push("customer profile must mount complaint reverse links");
  if (!/<ComplaintsReverseSection[\s\S]{0,240}filter=\{\{ user_id: userId \}\}/.test(s.user)) failures.push("user profile must mount complaint reverse links");
  if (!/case "complaint":[\s\S]{0,90}complaints\?complaint_id=/.test(s.entityLink)) failures.push("complaint drill must target canonical highlighted list");
  if (!/rowClassName=\{\(row\)[\s\S]{0,180}highlightedComplaintId/.test(s.page)) failures.push("canonical complaint list must highlight deep-linked row");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker scope", "page", /listAssignableUsers\(companyId\)/, "listAssignableUsers()"],
    ["identity query", "identityApi", /\?operating_company_id=\$\{encodeURIComponent\(operatingCompanyId\)\}/, "?company=${encodeURIComponent(operatingCompanyId)}"],
    ["driver writer", "route", /AS complainant_driver_ok/, "AS driver_ok"],
    ["customer writer", "route", /AS customer_ok/, "AS client_ok"],
    ["user writer", "route", /AS respondent_user_ok/, "AS employee_ok"],
    ["type writer", "route", /AS complaint_type_ok/, "AS type_ok"],
    ["rejection", "route", /linked_entity_not_in_operating_company/, "bad_link"],
    ["customer filter", "route", /c\.complainant_customer_id = \$\$\{values\.length\}/, "TRUE"],
    ["user filter", "route", /c\.complainant_user_id = \$\$\{values\.length\}/, "FALSE"],
    ["api customer", "safetyApi", /qs\.set\("customer_id", params\.customer_id\)/, 'qs.set("driver_id", params.customer_id)'],
    ["reverse read", "reverse", /getComplaints\(operatingCompanyId, filter\)/, "getComplaints(operatingCompanyId)"],
    ["reverse drill", "reverse", /noun="Complaint"/, 'noun="Record"'],
    ["customer mount", "customer", /ComplaintsReverseSection/g, "MissingComplaintSection"],
    ["user mount", "user", /ComplaintsReverseSection/g, "MissingComplaintSection"],
    ["drill", "entityLink", /case "complaint":/, 'case "complaint_missing":'],
    ["highlight", "page", /highlightedComplaintId/g, "missingComplaintId"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped or was inert`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} linkage mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — complaint picker→tenant-safe writer→customer/employee reverse mounts→canonical drill`);
