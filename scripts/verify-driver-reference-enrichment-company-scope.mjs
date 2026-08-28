#!/usr/bin/env node
import fs from "node:fs";

const serviceFile = "apps/backend/src/mdata/driver-reference-fk.service.ts";
const aggregateFile = "apps/backend/src/mdata/driver-aggregate.service.ts";

function findings(read = (file) => fs.readFileSync(file, "utf8")) {
  const service = read(serviceFile);
  const aggregate = read(aggregateFile);
  const out = [];
  if (!service.includes("operatingCompanyId: string")) out.push("service must require selected company");
  if ((service.match(/d\.operating_company_id = \$2::uuid/g) ?? []).length !== 3) out.push("all three reads must scope canonical ownership");
  if ((service.match(/dca\.company_id = \$2::uuid/g) ?? []).length !== 3) out.push("all three reads must honor active company authorization");
  if ((service.match(/\[driverId, operatingCompanyId\]/g) ?? []).length !== 3) out.push("all three queries must bind company");
  if (!service.includes("JOIN mdata.drivers d ON d.id = de.driver_id")) out.push("endorsement read must join scoped driver");
  if (!service.includes("JOIN mdata.drivers d ON d.id = dr.driver_id")) out.push("restriction read must join scoped driver");
  if (!aggregate.includes("loadDriverReferenceFkEnrichment(client, driverId, operatingCompanyId)")) out.push("aggregate must forward selected company");
  return out;
}

if (process.argv.includes("--selftest")) {
  const files = [serviceFile, aggregateFile];
  const base = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const mutations = [
    (file, source) => file === serviceFile ? source.replace("operatingCompanyId: string", "") : source,
    (file, source) => file === serviceFile ? source.replace("d.operating_company_id = $2::uuid", "true") : source,
    (file, source) => file === serviceFile ? source.replace("dca.company_id = $2::uuid", "true") : source,
    (file, source) => file === serviceFile ? source.replace("JOIN mdata.drivers d ON d.id = de.driver_id", "") : source,
    (file, source) => file === serviceFile ? source.replace("JOIN mdata.drivers d ON d.id = dr.driver_id", "") : source,
    (file, source) => file === aggregateFile ? source.replace(", operatingCompanyId)", ")") : source,
  ];
  for (const mutate of mutations) if (findings((file) => mutate(file, base[file])).length === 0) throw new Error("planted driver scope regression escaped guard");
  console.log(`verify-driver-reference-enrichment-company-scope selftest: PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}
const got = findings();
if (got.length) { console.error(got.join("\n")); process.exit(1); }
console.log("verify-driver-reference-enrichment-company-scope: PASS (3/3 reads explicitly company scoped)");
