#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^teams\\.create$","task":"VERTICAL-DRIVER-ALL-MODULES-REMAINDER","vertical":"last-hotfile-slice"} */
/** @matrix-built {"modules":["maintenance"],"cols":["driver"],"leafRe":"^master\\.drivers\\.create$","task":"VERTICAL-DRIVER-ALL-MODULES-REMAINDER","vertical":"last-hotfile-slice"} */
/** @matrix-built {"modules":["drivers"],"cols":["driver"],"leafRe":"^team_splits$","task":"LINK-F5171-DRIVER-TEAM-SPLIT-HUMAN-LABELS","vertical":"column-depth"} */
import fs from "node:fs";

const FILES = {
  driversPage: "apps/frontend/src/pages/Drivers.tsx",
  mdataApi: "apps/frontend/src/api/mdata.ts",
  teamRoutes: "apps/backend/src/mdata/driver-team-split.routes.ts",
  teamService: "apps/backend/src/mdata/driver-team.service.ts",
  maintenancePage: "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx",
  maintenanceApi: "apps/frontend/src/api/maintenance.ts",
  maintenanceRoutes: "apps/backend/src/maintenance/drivers.routes.ts",
  driverAggregate: "apps/backend/src/mdata/driver-aggregate.service.ts",
  driverRoutes: "apps/backend/src/mdata/drivers.routes.ts",
  driverDetail: "apps/frontend/src/pages/DriverDetail.tsx",
  apiTypes: "apps/frontend/src/types/api.ts",
  driversMatrix: "docs/specs/scoreboard/modules/drivers.required.json",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };
  const matrixNeeds = (key, leafId) => {
    let matrix;
    try { matrix = JSON.parse(source[key]); }
    catch { failures.push(`${key} must remain valid JSON`); return; }
    if (!matrix.leaves?.find((leaf) => leaf.id === leafId)?.required?.includes("driver")) failures.push(`${leafId} must remain an exact driver Required leaf`);
  };

  matrixNeeds("driversMatrix", "teams.create");
  matrixNeeds("driversMatrix", "team_splits");
  matrixNeeds("maintenanceMatrix", "master.drivers.create");

  need("driversPage", "<DriverPickerWithCreate", "team creator must use the canonical driver picker");
  need("driversPage", "primary_driver_id: teamForm.primary_driver_id", "team creator must submit primary_driver_id");
  need("driversPage", "co_driver_id: teamForm.co_driver_id", "team creator must submit co_driver_id");
  need("mdataApi", 'apiRequest<{ data: DriverTeam }>("/api/v1/driver-teams", { method: "POST", body })', "team API must write the canonical team endpoint");
  need("teamRoutes", "const data = await createTeam(user.uuid, body.data)", "team route must call the canonical writer");
  need("teamService", "await assertDriverCompany(client, input.primary_driver_id, input.operating_company_id)", "primary driver must be company validated");
  need("teamService", "await assertDriverCompany(client, input.co_driver_id, input.operating_company_id)", "co-driver must be company validated");
  need("teamService", "operating_company_id, team_name, primary_driver_id, secondary_driver_id", "team writer must persist both canonical driver FKs");
  need("teamService", "load.operating_company_id = split.operating_company_id", "team split history load label join must remain company scoped");
  need("teamService", "driver.operating_company_id = split.operating_company_id", "team split history driver label join must remain company scoped");
  need("teamService", "AND split.operating_company_id = $2::uuid", "team split history read must bind the selected company");
  need("mdataApi", "settlement_history?: DriverTeamSettlementHistory[]", "team split history labels must remain typed");
  need("driversPage", 'entityLabel(row.load_number, row.load_id, "Load")', "team drawer must consume human load numbers");
  need("driversPage", 'entityLabel(row.driver_name, row.driver_id, "Driver")', "team drawer must consume human driver names");
  need("driverAggregate", "prior.operating_company_id = d.operating_company_id", "aggregate prior-driver label join must remain company scoped");
  need("driverAggregate", "AS prior_driver_name", "aggregate response must resolve the prior driver name");
  need("driverRoutes", "prior.operating_company_id = mdata.drivers.operating_company_id", "flat detail prior-driver label lookup must remain company scoped");
  need("driverRoutes", "AS prior_driver_name", "flat detail response must resolve the prior driver name");
  need("apiTypes", "prior_driver_name: string | null", "Driver contract must type the prior driver name");
  need("driverDetail", 'data-testid="driver-detail-prior-driver-link"', "rehire banner prior-driver drill must remain mounted");
  need("driverDetail", 'data-testid="driver-detail-prior-driver-field-link"', "rehire field prior-driver drill must remain mounted");
  if ((source.driverDetail.match(/<EntityLinkOrTombstone[\s\S]{0,180}kind="driver"[\s\S]{0,180}id=\{driver\.prior_driver_id\}[\s\S]{0,180}name=\{driver\.prior_driver_name\}[\s\S]{0,120}noun="Driver"/g) ?? []).length < 2) {
    failures.push("both mounted prior-driver consumers must bind the canonical nullable id+human label through EntityLinkOrTombstone");
  }

  need("maintenancePage", "createMaintenanceDriver(companyId, {", "maintenance creator must forward company scope to the canonical client");
  need("maintenancePage", 'queryKey: ["maintenance", "master-data", "drivers", companyId]', "maintenance creator must reload the same scoped driver roster");
  need("maintenancePage", 'kind="driver"', "reloaded maintenance rows must drill to the canonical driver");
  need("maintenanceApi", "/api/v1/maintenance/drivers?operating_company_id=${encodeURIComponent(operatingCompanyId)}", "maintenance client must send explicit company scope");
  need("maintenanceRoutes", "const result = await createDriverCanonical(", "maintenance route must reuse the canonical driver writer");
  need("maintenanceRoutes", "{ assignCompanyId: companyId, provisionSubAccounts: false }", "canonical driver writer must bind the selected company");
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error(`verify-driver-column-all-module-remainder FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["driversPage", "primary_driver_id: teamForm.primary_driver_id"],
    ["driversPage", "co_driver_id: teamForm.co_driver_id"],
    ["mdataApi", 'apiRequest<{ data: DriverTeam }>("/api/v1/driver-teams", { method: "POST", body })'],
    ["teamRoutes", "const data = await createTeam(user.uuid, body.data)"],
    ["teamService", "await assertDriverCompany(client, input.primary_driver_id, input.operating_company_id)"],
    ["teamService", "await assertDriverCompany(client, input.co_driver_id, input.operating_company_id)"],
    ["teamService", "operating_company_id, team_name, primary_driver_id, secondary_driver_id"],
    ["teamService", "load.operating_company_id = split.operating_company_id"],
    ["teamService", "driver.operating_company_id = split.operating_company_id"],
    ["teamService", "AND split.operating_company_id = $2::uuid"],
    ["mdataApi", "settlement_history?: DriverTeamSettlementHistory[]"],
    ["driversPage", 'entityLabel(row.load_number, row.load_id, "Load")'],
    ["driversPage", 'entityLabel(row.driver_name, row.driver_id, "Driver")'],
    ["driverAggregate", "prior.operating_company_id = d.operating_company_id"],
    ["driverAggregate", "AS prior_driver_name"],
    ["driverRoutes", "prior.operating_company_id = mdata.drivers.operating_company_id"],
    ["driverRoutes", "AS prior_driver_name"],
    ["apiTypes", "prior_driver_name: string | null"],
    ["driverDetail", 'data-testid="driver-detail-prior-driver-link"'],
    ["driverDetail", 'data-testid="driver-detail-prior-driver-field-link"'],
    ["driverDetail", "name={driver.prior_driver_name}"],
    ["maintenancePage", "createMaintenanceDriver(companyId, {"],
    ["maintenancePage", 'kind="driver"'],
    ["maintenanceApi", "/api/v1/maintenance/drivers?operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
    ["maintenanceRoutes", "const result = await createDriverCanonical("],
    ["maintenanceRoutes", "{ assignCompanyId: companyId, provisionSubAccounts: false }"],
    ["driversMatrix", '"id": "teams.create"'],
    ["driversMatrix", '"id": "team_splits"'],
    ["maintenanceMatrix", '"id": "master.drivers.create"'],
  ];
  mutations.forEach(([key, token], index) => {
    if (!source[key].includes(token)) throw new Error(`selftest fixture missing: ${key} ${token}`);
    const mutant = { ...source, [key]: source[key].replaceAll(token, `BROKEN_${index}`) };
    if (!verify(mutant).length) throw new Error(`selftest mutation ${index + 1} survived`);
  });
  console.log(`verify-driver-column-all-module-remainder SELFTEST PASS — ${mutations.length} planted defects rejected`);
}

console.log("verify-driver-column-all-module-remainder PASS — the final two driver Required leaves persist company-scoped canonical driver identities");
