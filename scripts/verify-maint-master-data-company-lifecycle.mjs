#!/usr/bin/env node
/**
 * @matrix-built {"modules":["maintenance","fleet","drivers","vendors"],"cols":["driver","unit","vendor","connectivity","reverse_link"],"leaves":["master.vehicles.create","master.vehicles.edit","master.vehicles.import","master.vehicles.void","master.drivers.create","master.drivers.edit","master.drivers.import","master.drivers.void","vendors.create","vendors.edit","vendors.import","vendors.archive"],"task":"MAINT-F6611-MASTER-DATA-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 */
import fs from "node:fs";

const surfaces = [
  {
    name: "vehicles",
    file: "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx",
    apiCalls: [
      "createMaintenanceVehicle(input.companyId, {",
      "updateMaintenanceVehicle(input.row.id, input.companyId, {",
      "importMaintenanceVehicles(input.companyId, input.file)",
      "voidMaintenanceVehicle(input.id, input.companyId, input.reason)",
    ],
    mutationNames: ["createMutation", "updateMutation", "importMutation", "voidMutation"],
    submitTokens: [
      "createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...draft } })",
      "updateMutation.mutate({ companyId, generation: actionGenerationRef.current, row: { ...editing } })",
      "importMutation.mutate({ companyId, generation: actionGenerationRef.current, file: csvFile })",
      "voidMutation.mutateAsync({ id: voiding.id, companyId, generation: actionGenerationRef.current, reason })",
    ],
  },
  {
    name: "drivers",
    file: "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx",
    apiCalls: [
      "createMaintenanceDriver(input.companyId, {",
      "updateMaintenanceDriver(input.row.id, input.companyId, {",
      "importMaintenanceDrivers(input.companyId, input.file)",
      "voidMaintenanceDriver(input.id, input.companyId, input.reason)",
    ],
    mutationNames: ["createMutation", "updateMutation", "importMutation", "voidMutation"],
    submitTokens: [
      "createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...draft } })",
      "updateMutation.mutate({ companyId, generation: actionGenerationRef.current, row: { ...editing } })",
      "importMutation.mutate({ companyId, generation: actionGenerationRef.current, file: csvFile })",
      "voidMutation.mutateAsync({ id: voiding.id, companyId, generation: actionGenerationRef.current, reason })",
    ],
  },
  {
    name: "vendors",
    file: "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx",
    apiCalls: [
      "createMaintenanceVendor({\n        operating_company_id: input.companyId,",
      "updateMaintenanceVendor(input.row.id, {",
      "importMaintenanceVendors(input.companyId, input.file)",
      "archiveMaintenanceVendor(input.id, input.companyId, input.reason)",
    ],
    mutationNames: ["createMutation", "updateMutation", "importMutation", "archiveMutation"],
    submitTokens: [
      "createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...draft } })",
      "updateMutation.mutate({ companyId, generation: actionGenerationRef.current, row: { ...editing } })",
      "importMutation.mutate({ companyId, generation: actionGenerationRef.current, file: csvFile })",
      "archiveMutation.mutateAsync({ id: archiveTarget.id, companyId, generation: actionGenerationRef.current, reason })",
    ],
  },
];

const sources = Object.fromEntries(surfaces.map((surface) => [surface.name, fs.readFileSync(surface.file, "utf8")]));

function inspect(values) {
  const failures = [];
  for (const surface of surfaces) {
    const source = values[surface.name];
    if (!source.includes("const actionGenerationRef = useRef(0)")) failures.push(`${surface.name}: missing action generation`);
    if (!source.includes("const refresh = async (submittedCompanyId: string)")) failures.push(`${surface.name}: refresh is not company-pinned`);
    if (!source.includes("actionGenerationRef.current += 1")) failures.push(`${surface.name}: company switch does not invalidate actions`);
    if ((source.match(/input\.generation !== actionGenerationRef\.current/g) ?? []).length < 4) failures.push(`${surface.name}: stale successes can mutate current UI`);
    if ((source.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length < 4) failures.push(`${surface.name}: stale errors can leak into current UI`);
    for (const token of surface.apiCalls) if (!source.includes(token)) failures.push(`${surface.name}: API write is not pinned (${token})`);
    for (const mutation of surface.mutationNames) if (!source.includes(`${mutation}.reset()`)) failures.push(`${surface.name}: ${mutation} survives company switch`);
    for (const token of surface.submitTokens) if (!source.includes(token)) failures.push(`${surface.name}: submit does not snapshot context (${token})`);
    if (!source.includes("await refresh(input.companyId)")) failures.push(`${surface.name}: success refresh is not pinned to submitted company`);
  }
  return failures;
}

const failures = inspect(sources);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = surfaces.flatMap((surface) =>
    surface.apiCalls.map((token) => ({ surface: surface.name, token })),
  );
  for (const mutation of mutations) {
    const source = sources[mutation.surface];
    if (!source.includes(mutation.token)) throw new Error(`selftest fixture missing: ${mutation.token}`);
    const planted = { ...sources, [mutation.surface]: source.replace(mutation.token, "PLANTED_UNSCOPED_WRITE") };
    if (inspect(planted).length === 0) throw new Error(`selftest missed: ${mutation.surface} ${mutation.token}`);
  }
  console.log(`verify-maint-master-data-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length} planted write-path defects red)`);
  process.exit(0);
}

console.log("verify-maint-master-data-company-lifecycle PASS — 12 vehicle/driver/vendor create, edit, import, and void/archive paths preserve submitted company context");
