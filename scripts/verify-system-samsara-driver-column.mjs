#!/usr/bin/env node
/** @matrix-built {"modules":["system"],"cols":["driver"],"leafRe":"^system\\.samsara_hos_driver_map$","task":"WAVE-A-DRIVER-SAMSARA-REMAINDER","vertical":"last-hotfile-slice"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  page: "apps/frontend/src/pages/samsara-vendor-mapping/HosDriverMapPreviewPage.tsx",
  api: "apps/frontend/src/api/telematics.ts",
  route: "apps/backend/src/integrations/samsara/hos-driver-map-preview.routes.ts",
  service: "apps/backend/src/integrations/samsara/hos-driver-map-preview.service.ts",
  routeTest: "apps/backend/src/integrations/samsara/hos-driver-map-preview.routes.test.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
  matrix: "docs/specs/scoreboard/modules/system.required.json",
};

function read() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key]?.includes(token)) failures.push(`${FILES[key]}: ${message}`); };
  need("page", "selectedCompanyId", "read must originate from selected company context");
  need("page", "fetchHosDriverMapPreview(companyId)", "selected company must reach the API request");
  need("page", "<ParityTable", "driver mapping rows must use the governed list primitive");
  need("page", 'kind="driver"', "local driver identity must use canonical EntityLink");
  need("page", "id={row.local_driver_id}", "canonical local_driver_id must drive the link");
  need("page", 'storageKey="system:samsara-hos-driver-map"', "table preferences must be surface-stable");
  if (source.page.includes("<table")) failures.push(`${FILES.page}: raw table bypasses shared search/range/gear chrome`);
  if (/Jorge[- ](?:approval|approved|gated)/i.test(source.page + source.route + source.service)) failures.push("Samsara preview must not carry a superseded owner-approval hold");

  need("api", "new URLSearchParams({ operating_company_id: operatingCompanyId })", "API read must bind operating_company_id");
  need("api", "/api/v1/telematics/hos-driver-map/preview?", "API must call the canonical preview route");
  need("manifest", 'path="/samsara/hos-driver-map"', "canonical page route must remain mounted");
  need("resolver", 'case "driver"', "driver EntityLink resolver must retain driver routing");
  need("resolver", "/drivers/", "driver EntityLink resolver must target mounted profiles");

  need("route", 'app.get("/api/v1/telematics/hos-driver-map/preview"', "backend must mount a GET preview");
  need("route", "querySchema.safeParse", "company query must be schema validated");
  need("route", "withCurrentUser(user.uuid", "read must run in caller context");
  need("route", "set_config('app.operating_company_id', $1::text, true)", "caller context must bind company GUC");
  need("route", "[oc]", "company GUC must use a bound value");
  if (/app\.(?:post|put|patch|delete)\("\/api\/v1\/telematics\/hos-driver-map/i.test(withoutComments(source.route))) failures.push(`${FILES.route}: preview namespace must remain read-only`);

  need("service", "FROM mdata.drivers", "preview must read canonical driver records");
  need("service", "WHERE operating_company_id = $1::uuid", "driver read must be explicitly company scoped");
  need("service", "a.operating_company_id = $1::uuid", "assignment join must carry its own company predicate");
  need("service", "local_driver_id: r.id as string", "canonical driver FK must survive projection");
  need("service", "current_samsara_driver_id", "stored mapping must be projected for reconciliation");
  need("service", "proposed_samsara_driver_id", "proposed mapping must be projected for reconciliation");
  need("service", "ambiguous", "ambiguous matches must remain explicit");
  if (/\b(?:INSERT\s+INTO|UPDATE\s+mdata\.drivers|DELETE\s+FROM)\b/i.test(withoutComments(source.service))) failures.push(`${FILES.service}: preview service must not mutate driver records`);

  need("routeTest", "scopes the company (parameterized set_config)", "route test must prove bound company scope");
  need("routeTest", "expect(scopeCall?.values).toEqual([OCI])", "route test must assert the exact bound company");
  let matrix;
  try { matrix = JSON.parse(source.matrix); }
  catch (error) { failures.push(`${FILES.matrix}: must parse (${error.message})`); return failures; }
  const leaf = matrix.leaves?.find((candidate) => candidate.id === "system.samsara_hos_driver_map");
  if (!leaf?.required?.includes("driver")) failures.push(`${FILES.matrix}: exact leaf must require driver`);
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error(`system Samsara driver-column guard failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [];
  for (const [key, token] of [
    ["page", "selectedCompanyId"], ["page", "<ParityTable"], ["page", 'kind="driver"'], ["page", "id={row.local_driver_id}"],
    ["api", "new URLSearchParams({ operating_company_id: operatingCompanyId })"], ["manifest", 'path="/samsara/hos-driver-map"'],
    ["route", 'app.get("/api/v1/telematics/hos-driver-map/preview"'], ["route", "querySchema.safeParse"], ["route", "withCurrentUser(user.uuid"],
    ["route", "set_config('app.operating_company_id', $1::text, true)"], ["service", "FROM mdata.drivers"],
    ["service", "WHERE operating_company_id = $1::uuid"], ["service", "local_driver_id: r.id as string"],
    ["service", "a.operating_company_id = $1::uuid"],
    ["service", "current_samsara_driver_id"], ["service", "proposed_samsara_driver_id"], ["service", "ambiguous"],
    ["routeTest", "expect(scopeCall?.values).toEqual([OCI])"], ["resolver", 'case "driver"'],
  ]) mutations.push(() => ({ ...source, [key]: source[key].replaceAll(token, "BROKEN_DRIVER_CONTRACT") }));
  mutations.push(() => ({ ...source, page: source.page.replace("<ParityTable", "<table><ParityTable") }));
  mutations.push(() => ({ ...source, service: `${source.service}\nawait client.query(\"UPDATE mdata.drivers SET samsara_driver_id = NULL\")` }));
  mutations.push(() => ({ ...source, route: `${source.route}\napp.patch(\"/api/v1/telematics/hos-driver-map/preview\", handler)` }));
  mutations.push(() => ({ ...source, matrix: source.matrix.replace('"id": "system.samsara_hos_driver_map"', '"id": "broken.samsara_hos_driver_map"') }));
  mutations.forEach((mutate, index) => {
    if (!verify(mutate()).length) throw new Error(`self-test mutation ${index + 1} survived`);
  });
  console.log(`PASS: ${mutations.length} planted Samsara driver-column defects were rejected`);
}

console.log("PASS: System Samsara map is company-scoped, read-only, canonical driver-linked, and governed by shared list chrome");
