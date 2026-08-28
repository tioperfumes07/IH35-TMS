#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["lists.modal.safety_generic_catalog","catalog.safety.internal_fine_reasons.list","catalog.safety.internal_fine_reasons.create","catalog.safety.civil_fine_types.list","catalog.safety.civil_fine_types.create","catalog.safety.company_violation_types.list","catalog.safety.company_violation_types.create","catalog.safety.complaint_types.list","catalog.safety.complaint_types.create","catalog.safety.dot_violation_types.list","catalog.safety.dot_violation_types.create","catalog.safety.cargo_claim_reasons.list","catalog.safety.cargo_claim_reasons.create"],"task":"LST-F7065-SAFETY-GENERIC-MODAL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const GUARD = "scripts/verify-lists-safety-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(GUARD, "utf8").split("\n")[1];
const MATRIX = "docs/specs/scoreboard/modules/lists.required.json";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const API = "apps/frontend/src/api/catalogs-safety.ts";
const SHARED_MODAL = "apps/frontend/src/pages/lists/safety/SafetyGenericCatalogModal.tsx";

const CATALOGS = [
  ["internal_fine_reasons", "internal-fine-reasons", "InternalFineReasons", "InternalFineReason"],
  ["civil_fine_types", "civil-fine-types", "CivilFineTypes", "CivilFineType"],
  ["company_violation_types", "company-violation-types", "CompanyViolationTypes", "CompanyViolationType"],
  ["complaint_types", "complaint-types", "ComplaintTypes", "ComplaintType"],
  ["dot_violation_types", "dot-violation-types", "DotViolationTypes", "DotViolationType"],
  ["cargo_claim_reasons", "cargo-claim-reasons", "CargoClaimReasons", "CargoClaimReason"],
];

function read(file) { return fs.readFileSync(file, "utf8"); }

export function audit(sources = {}) {
  const failures = [];
  const matrixText = sources.matrix ?? read(MATRIX);
  const manifest = sources.manifest ?? read(MANIFEST);
  const api = sources.api ?? read(API);
  const sharedModal = sources.sharedModal ?? read(SHARED_MODAL);
  const self = sources.self ?? read(GUARD);
  let matrix;
  try { matrix = JSON.parse(matrixText); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!self.split("\n").includes(HEADER)) failures.push("exact Built header missing");

  const modalLeaf = matrix.leaves?.find((candidate) => candidate.id === "lists.modal.safety_generic_catalog");
  if (!modalLeaf?.required?.includes("connectivity")) failures.push("shared Safety catalog modal must require connectivity");
  if (modalLeaf?.surface_path !== "pages/lists/safety/SafetyGenericCatalogModal.tsx") failures.push("shared Safety catalog modal must retain its canonical surface");
  for (const contract of [
    "client.create(operatingCompanyId, body)",
    "client.update(row.id, operatingCompanyId, body",
    "client.deactivate(row.id, operatingCompanyId)",
  ]) {
    if (!sharedModal.includes(contract)) failures.push(`shared Safety catalog modal missing ${contract}`);
  }
  if (sharedModal.split("onSaved();").length - 1 !== 2) failures.push("shared Safety catalog modal must reload after both save and deactivate");
  if (sharedModal.split('setSubmitError(userFacingApiError(error, "Save failed"))').length - 1 !== 2) failures.push("shared Safety catalog modal must expose API errors from both mutation paths");
  if (!sharedModal.includes("onClose();") || !sharedModal.includes("finally") || !sharedModal.includes("setIsSaving(false)")) {
    failures.push("shared Safety catalog modal must close only after canonical success and always release saving state");
  }

  for (const [leafKey, slug, plural, singular] of CATALOGS) {
    const route = `/lists/safety/${slug}`;
    const pageFile = `apps/frontend/src/pages/lists/safety/${plural}ListPage.tsx`;
    const modalFile = `apps/frontend/src/pages/lists/safety/${singular}Modal.tsx`;
    const backendFile = `apps/backend/src/catalogs/safety/${slug}.routes.ts`;
    const page = sources[pageFile] ?? read(pageFile);
    const modal = sources[modalFile] ?? read(modalFile);
    const backend = sources[backendFile] ?? read(backendFile);
    for (const suffix of ["list", "create"]) {
      const id = `catalog.safety.${leafKey}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!manifest.includes(`path="${route}"`) || !manifest.includes(`<${plural}ListPage />`)) failures.push(`${route} must mount ${plural}ListPage`);
    if (!page.includes(`list${plural}(companyId`) || !page.includes("selectedCompanyId") || !page.includes("+ Create")) failures.push(`${plural} page must read the scoped catalog and open create`);
    if (!page.includes(`<${singular}Modal`) || !page.includes("companyId={companyId}")) failures.push(`${plural} page must pass company scope to ${singular}Modal`);
    if (!modal.includes(`create${singular}(companyId, payload)`) || !modal.includes("onSaved();") || !page.includes("void query.refetch();")) failures.push(`${singular}Modal must write canonically then reload`);
    const apiBase = `/api/v1/catalogs/safety/${slug}`;
    if (!api.includes(`buildListPath("${apiBase}", companyId`) || !api.includes(`withCompany("${apiBase}", companyId)`)) failures.push(`${slug} API must scope list and create`);
    if (!backend.includes(`app.get("${apiBase}"`) || !backend.includes(`app.post("${apiBase}"`)) failures.push(`${slug} backend must mount GET and POST`);
    if (!backend.includes("withCompanyScope(") || !backend.includes("operating_company_id") || !backend.includes("INSERT INTO catalogs.")) failures.push(`${slug} backend must tenant-validate and persist canonical FK scope`);
    if (!backend.includes("appendCrudAudit(")) failures.push(`${slug} create must append audit`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = {
    matrix: read(MATRIX), manifest: read(MANIFEST), api: read(API), sharedModal: read(SHARED_MODAL), self: read(GUARD),
  };
  let caught = 0;
  for (const [leafKey, slug, plural, singular] of CATALOGS) {
    const pageFile = `apps/frontend/src/pages/lists/safety/${plural}ListPage.tsx`;
    const modalFile = `apps/frontend/src/pages/lists/safety/${singular}Modal.tsx`;
    const backendFile = `apps/backend/src/catalogs/safety/${slug}.routes.ts`;
    const mutations = [
      ["matrix", original.matrix.replace(`"id": "catalog.safety.${leafKey}.list"`, `"id": "catalog.safety.${leafKey}.list.broken"`)],
      ["manifest", original.manifest.replace(`path="/lists/safety/${slug}"`, `path="/lists/safety/${slug}-broken"`)],
      [pageFile, read(pageFile).replace(`list${plural}(companyId`, `list${plural}(""`)],
      [modalFile, read(modalFile).replace(`create${singular}(companyId, payload)`, `create${singular}("", payload)`)],
      [backendFile, read(backendFile).replace(`app.post("/api/v1/catalogs/safety/${slug}"`, `app.post("/api/v1/catalogs/safety/${slug}-broken"`)],
    ];
    for (const [key, mutant] of mutations) {
      if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${leafKey}:${key}`);
      caught++;
    }
  }
  for (const mutant of [
    original.sharedModal.replace("client.create(operatingCompanyId, body)", "client.create(\"\", body)"),
    original.sharedModal.replace("client.update(row.id, operatingCompanyId, body", "client.update(row.id, \"\", body"),
    original.sharedModal.replace("client.deactivate(row.id, operatingCompanyId)", "client.deactivate(row.id, \"\")"),
    original.sharedModal.replace("onSaved();", "void 0;"),
    original.sharedModal.replace("setSubmitError(userFacingApiError(error, \"Save failed\"))", "setSubmitError(\"hidden\")"),
  ]) {
    if (!audit({ ...original, sharedModal: mutant }).length) throw new Error("mutation survived: shared-modal connectivity");
    caught++;
  }
  const modalMatrixMutant = original.matrix.replace('"id": "lists.modal.safety_generic_catalog"', '"id": "lists.modal.safety_generic_catalog.broken"');
  if (!audit({ ...original, matrix: modalMatrixMutant }).length) throw new Error("mutation survived: shared-modal matrix leaf");
  caught++;
  if (!audit({ ...original, self: original.self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-safety-catalog-connectivity-exact SELFTEST PASS — ${caught + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`verify-lists-safety-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-lists-safety-catalog-connectivity-exact PASS — shared modal + 6 scoped Safety catalogs retain route→read→create/update/deactivate→reload→audit connectivity");
