#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-customer-lifecycle-selected-company-scope";
const backend = fs.readFileSync("apps/backend/src/mdata/customers.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/mdata.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/CustomerDetail.tsx", "utf8");

const patchStart = backend.indexOf('app.patch("/api/v1/mdata/customers/:id"');
const patchEnd = backend.indexOf('app.post("/api/v1/mdata/customers/:id/verify-fmcsa"', patchStart);
const patchHandler = patchStart >= 0 && patchEnd > patchStart ? backend.slice(patchStart, patchEnd) : "";
const deactivateStart = backend.indexOf('app.post<{ Params: { id: string }; Querystring: { operating_company_id: string } }>("/api/v1/mdata/customers/:id/deactivate"');
const deactivateHandler = deactivateStart >= 0 ? backend.slice(deactivateStart) : "";
const apiStart = api.indexOf("export function updateCustomer(");
const apiEnd = api.indexOf("export function getCustomerDetail", apiStart);
const apiHandler = apiStart >= 0 && apiEnd > apiStart ? api.slice(apiStart, apiEnd) : "";

const checks = [
  ["patch", patchHandler, "resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id)", 3],
  ["patch", patchHandler, "operating_company_id = $2::uuid LIMIT 1", 2],
  ["patch", patchHandler, "validateParentCustomer(authUser.uuid, patchScopedCompanyId"],
  ["patch", patchHandler, "assertUniqueCustomerFields(authUser.uuid, patchScopedCompanyId"],
  ["patch", patchHandler, 'if ("operating_company_id" in b)'],
  ["deactivate", deactivateHandler, "detailQuerySchema.safeParse(req.query ?? {})"],
  ["deactivate", deactivateHandler, "resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)"],
  ["deactivate", deactivateHandler, "operating_company_id = $2::uuid LIMIT 1"],
  ["deactivate", deactivateHandler, "operating_company_id = $3::uuid AND deactivated_at IS NULL"],
  ["api", apiHandler, "deactivateCustomer(id: string, operatingCompanyId: string)"],
  ["api", apiHandler, "deactivate?operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
  ["api", apiHandler, "reactivateCustomer(id: string, operatingCompanyId: string)"],
  ["api", apiHandler, "reactivate?operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
  ["page", page, "deactivateCustomer(id, selectedCompanyId ?? operatingCompanyId ?? \"\")"],
  ["page", page, "reactivateCustomer(id, selectedCompanyId ?? operatingCompanyId ?? \"\")"],
];

const occurrences = (source, token) => source.split(token).length - 1;
const audit = (candidate) => {
  const missing = checks
    .filter(([key, , token, minimum = 1]) => token !== 'if ("operating_company_id" in b)' && occurrences(candidate[key], token) < minimum)
    .map(([, , token]) => token);
  if (candidate.patch.includes('if ("operating_company_id" in b) add("operating_company_id"')) {
    missing.push("operating_company_id must remain scope-only");
  }
  return missing;
};
const good = { patch: patchHandler, deactivate: deactivateHandler, api: apiHandler, page };
const missing = audit(good);
if (missing.length) { console.error(`${LABEL} FAIL — ${missing.join(", ")}`); process.exit(1); }

if (process.argv.includes("--selftest")) {
  const positiveChecks = checks.filter(([, , token]) => token !== 'if ("operating_company_id" in b)');
  let caught = 0;
  for (const [key, , token] of positiveChecks) {
    const mutated = { ...good, [key]: good[key].split(token).join("REMOVED") };
    if (mutated[key] !== good[key] && audit(mutated).includes(token)) caught++;
  }
  const reassignment = { ...good, patch: `${good.patch}\nif ("operating_company_id" in b) add("operating_company_id", b.operating_company_id);` };
  if (audit(reassignment).includes("operating_company_id must remain scope-only")) caught++;
  const total = positiveChecks.length + 1;
  if (caught !== total) { console.error(`${LABEL} SELFTEST FAIL — ${caught}/${total}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${total} mutations rejected`);
}

console.log(`${LABEL} PASS — customer update/deactivate/reactivate use selected-company scope without tenant reassignment`);
