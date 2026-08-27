#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — DriverDetail Add Qualification equipment type must use ReferenceSelect with
 * createKind=equipment_type (same-table write to catalogs.equipment_types + min 1 line item).
 * Cursor even claim: 1846.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-equipment-type-inline-create";

const DRIVER_DETAIL = "apps/frontend/src/pages/DriverDetail.tsx";
const EQUIPMENT_TYPES_PAGE = "apps/frontend/src/pages/EquipmentTypesPage.tsx";
const CATALOGS_API = "apps/frontend/src/api/catalogs.ts";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/equipment-types.routes.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const detail = readRel(root, DRIVER_DETAIL, overrides);
  const page = readRel(root, EQUIPMENT_TYPES_PAGE, overrides);
  const api = readRel(root, CATALOGS_API, overrides);
  const registry = readRel(root, REGISTRY, overrides);
  const routes = readRel(root, ROUTES, overrides);

  if (!detail) problems.push(`missing ${DRIVER_DETAIL}`);
  else {
    const code = detail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/createKind=["']equipment_type["']/.test(code)) {
      problems.push(`${DRIVER_DETAIL}: equipment type must use createKind=equipment_type`);
    }
    if (!/ReferenceSelect/.test(code)) {
      problems.push(`${DRIVER_DETAIL}: must import/use ReferenceSelect`);
    }
    if (/disabled=\{equipmentTypeOptions\.length === 0\}/.test(code)) {
      problems.push(`${DRIVER_DETAIL}: must not disable Create when equipment type catalog is empty`);
    }
    if (
      /Add Qualification[\s\S]{0,600}<Combobox[\s\S]{0,200}equipment_type_id/.test(code) ||
      /equipment type[\s\S]{0,280}<Combobox/.test(code)
    ) {
      problems.push(`${DRIVER_DETAIL}: equipment type must not use bare Combobox`);
    }
    if (!/equipment-types-for-driver-detail/.test(code)) {
      problems.push(`${DRIVER_DETAIL}: must invalidate equipment-types-for-driver-detail on inline create`);
    }
    if (!/const equipmentTypesQuery = useQuery\(\{[\s\S]{0,180}queryKey:\s*\["equipment-types-for-driver-detail",\s*companyId\]/.test(code)) {
      problems.push(`${DRIVER_DETAIL}: equipment type query cache must be company-keyed`);
    }
    if (!/listEquipmentTypes\(companyId,\s*false\)/.test(code) || !/enabled:\s*Boolean\(companyId\)/.test(code)) {
      problems.push(`${DRIVER_DETAIL}: equipment type read must send the selected company id`);
    }
  }

  if (!page) problems.push(`missing ${EQUIPMENT_TYPES_PAGE}`);
  else if (
    !/queryKey:\s*\["catalogs",\s*"equipment-types",\s*companyId,\s*includeInactive\]/.test(page) ||
    !/listEquipmentTypes\(companyId,\s*includeInactive\)/.test(page)
  ) {
    problems.push(`${EQUIPMENT_TYPES_PAGE}: catalog list/cache must be company-keyed`);
  }

  if (!api) problems.push(`missing ${CATALOGS_API}`);
  else {
    if (!/listEquipmentTypes\(operatingCompanyId:\s*string/.test(api)) {
      problems.push(`${CATALOGS_API}: listEquipmentTypes must require operatingCompanyId`);
    }
    if (!/new URLSearchParams\(\{ operating_company_id:\s*operatingCompanyId \}\)/.test(api)) {
      problems.push(`${CATALOGS_API}: equipment type lifecycle must send operating_company_id`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/equipment_type:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing equipment_type entry`);
    }
    if (!/writeTable:\s*"catalogs\.equipment_types"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.equipment_types`);
    }
    if (!/\/api\/v1\/catalogs\/equipment-types/.test(registry)) {
      problems.push(`${REGISTRY}: must POST /api/v1/catalogs/equipment-types`);
    }
    if (!/line_items:\s*\[/.test(registry)) {
      problems.push(`${REGISTRY}: create must POST line_items (min 1)`);
    }
    if (!/per_loaded_mile/.test(registry)) {
      problems.push(`${REGISTRY}: inline create must seed per_loaded_mile default line item`);
    }
    if (/createEquipmentType/.test(registry)) {
      problems.push(`${REGISTRY}: must not import createEquipmentType (selftest landmine)`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else {
    if (!/INSERT INTO catalogs\.equipment_types \(/.test(routes) || !/FROM catalogs\.equipment_types/.test(routes)) {
      problems.push(`${ROUTES}: must SELECT+INSERT catalogs.equipment_types (VERIFY-2 cl.5)`);
    }
    if (!/WHERE et\.operating_company_id = \$1[\s\S]{0,180}GROUP BY et\.id/.test(routes)) {
      problems.push(`${ROUTES}: list read must explicitly predicate equipment types by company`);
    }
    if (!/lit\.operating_company_id = \$1/.test(routes)) {
      problems.push(`${ROUTES}: list read must explicitly predicate line-item templates by company`);
    }
    if (!/WHERE et\.id = \$1\s+AND et\.operating_company_id = \$2/.test(routes)) {
      problems.push(`${ROUTES}: detail read must bind id and company`);
    }
    if ((routes.match(/WHERE id = \$\$\{idParameter\} AND operating_company_id = \$\$\{companyParameter\}/g) ?? []).length < 2) {
      problems.push(`${ROUTES}: update writes must bind id and company`);
    }
    if (!/WHERE id = \$1 AND operating_company_id = \$2 LIMIT 1/.test(routes)) {
      problems.push(`${ROUTES}: line-item parent lookup must bind id and company`);
    }
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL (baseline must be clean):`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const expectCaught = (name, rel, mutator, needle) => {
    const live = readRel(ROOT, rel);
    if (!live) {
      failures.push(`${name}: missing ${rel}`);
      return;
    }
    const mutated = mutator(live);
    if (mutated === live) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = collectProblems(ROOT, { [rel]: mutated });
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "driver-createKind-removed",
    DRIVER_DETAIL,
    (s) => s.replace(/createKind=["']equipment_type["']/, 'createKind="vendor"'),
    "createKind=equipment_type"
  );
  expectCaught(
    "driver-disabled-empty-catalog",
    DRIVER_DETAIL,
    (s) => s.replace(
      /<Button onClick=\{\(\) => setAddQualificationOpen\(true\)\}>/,
      '<Button onClick={() => setAddQualificationOpen(true)} disabled={equipmentTypeOptions.length === 0}>'
    ),
    "must not disable Create when equipment type catalog is empty"
  );
  expectCaught(
    "driver-company-cache-key-removed",
    DRIVER_DETAIL,
    (s) => s.replace(/queryKey: \["equipment-types-for-driver-detail", companyId\]/, 'queryKey: ["equipment-types-for-driver-detail"]'),
    "query cache must be company-keyed"
  );
  expectCaught(
    "catalog-page-company-read-removed",
    EQUIPMENT_TYPES_PAGE,
    (s) => s.replace("listEquipmentTypes(companyId, includeInactive)", "listEquipmentTypes(includeInactive)"),
    "catalog list/cache must be company-keyed"
  );
  expectCaught(
    "api-company-param-removed",
    CATALOGS_API,
    (s) => s.replace("listEquipmentTypes(operatingCompanyId: string", "listEquipmentTypes(includeInactive: boolean"),
    "must require operatingCompanyId"
  );
  expectCaught(
    "registry-line-items-removed",
    REGISTRY,
    (s) => s.replace(/line_items:\s*\[/, "line_items_removed: ["),
    "create must POST line_items"
  );
  expectCaught(
    "routes-insert-removed",
    ROUTES,
    (s) => s.replace(/INSERT INTO catalogs\.equipment_types \(operating_company_id/g, "INSERT INTO catalogs.equipment_types_retire (operating_company_id"),
    "SELECT+INSERT catalogs.equipment_types"
  );
  expectCaught(
    "routes-list-company-predicate-removed",
    ROUTES,
    (s) => s.replace("WHERE et.operating_company_id = $1", "WHERE true"),
    "list read must explicitly predicate equipment types by company"
  );
  expectCaught(
    "routes-child-company-predicate-removed",
    ROUTES,
    (s) => s.replace("AND lit.operating_company_id = $1", "AND true"),
    "line-item templates by company"
  );
  expectCaught(
    "routes-detail-company-predicate-removed",
    ROUTES,
    (s) => s.replace("AND et.operating_company_id = $2", "AND true"),
    "detail read must bind id and company"
  );
  expectCaught(
    "routes-parent-company-predicate-removed",
    ROUTES,
    (s) => s.replace("WHERE id = $1 AND operating_company_id = $2 LIMIT 1", "WHERE id = $1 LIMIT 1"),
    "line-item parent lookup must bind id and company"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 11 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — DriverDetail equipment type inline create`);
}
