#!/usr/bin/env node
/**
 * 0441-mod13-inventory-part-to-unit-none
 *
 * Asserts unit parts-history reverse drill is wired:
 * - GET /api/v1/maintenance/units/:unitId/parts-history registered (join via wo.unit_id)
 * - VehicleProfilePage references parts-history / UnitPartsHistorySection
 *
 * Self-test: node scripts/verify-unit-parts-history-reverse-drill.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-parts-history-reverse-drill";

const ROUTES = path.join(ROOT, "apps/backend/src/maintenance/parts-invoice-links.routes.ts");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx");
const SECTION = path.join(ROOT, "apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx");
const API = path.join(ROOT, "apps/frontend/src/api/maintenance.ts");

/**
 * @param {{ routes: string, page: string, section: string, api: string }} files
 * @returns {string[]}
 */
export function computeFailures(files) {
  const errors = [];
  const routes = files.routes ?? "";
  const page = files.page ?? "";
  const section = files.section ?? "";
  const api = files.api ?? "";

  if (!/\/api\/v1\/maintenance\/units\/:unitId\/parts-history/.test(routes)) {
    errors.push("parts-invoice-links.routes.ts must register GET /api/v1/maintenance/units/:unitId/parts-history");
  }
  if (!/FROM maintenance\.parts_invoice_links/.test(routes)) {
    errors.push("parts-history route must query maintenance.parts_invoice_links");
  }
  if (!/INNER JOIN maintenance\.work_orders/.test(routes)) {
    errors.push("parts-history route must join maintenance.work_orders");
  }
  if (!/wo\.unit_id\s*=\s*\$2/.test(routes)) {
    errors.push("parts-history route must filter wo.unit_id = :unitId");
  }
  if (!/owner_company_id\s*=\s*\$2 OR currently_leased_to_company_id\s*=\s*\$2/.test(routes)) {
    errors.push("parts-history must scope units via owner_company_id / currently_leased_to_company_id (no phantom units.operating_company_id)");
  }

  if (!/UnitPartsHistorySection/.test(page)) {
    errors.push("VehicleProfilePage.tsx must render UnitPartsHistorySection");
  }
  if (!/parts-history|UnitPartsHistorySection|vp-section-parts-used/.test(page)) {
    errors.push("VehicleProfilePage.tsx must reference parts-history reverse drill");
  }

  if (!/parts-history/.test(section)) {
    errors.push("UnitPartsHistorySection.tsx must call the parts-history API");
  }
  if (!/Parts Used/.test(section)) {
    errors.push("UnitPartsHistorySection.tsx must render Parts Used heading");
  }
  if (!/getUnitPartsHistoryPage/.test(section)) {
    errors.push("UnitPartsHistorySection.tsx must use getUnitPartsHistoryPage");
  }

  if (!/\/api\/v1\/maintenance\/units\/\$\{encodeURIComponent\(unitId\)\}\/parts-history/.test(api) &&
      !/\/api\/v1\/maintenance\/units\/.*parts-history/.test(api)) {
    errors.push("maintenance.ts API client must expose parts-history path");
  }
  if (!/listUnitPartsHistory/.test(api)) {
    errors.push("maintenance.ts must export listUnitPartsHistory");
  }

  return errors;
}

function selftest() {
  const good = {
    routes: `
      app.get("/api/v1/maintenance/units/:unitId/parts-history", async () => {});
      FROM maintenance.parts_invoice_links pil
      INNER JOIN maintenance.work_orders wo
      AND wo.unit_id = $2
      WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2)
    `,
    page: `import { UnitPartsHistorySection } from "..."; <UnitPartsHistorySection /> /* parts-history */`,
    section: `Parts Used\ngetUnitPartsHistoryPage\n/api/v1/maintenance/units/\${id}/parts-history`,
    api: `export function getUnitPartsHistoryPage(unitId, oc) { return apiRequest(\`/api/v1/maintenance/units/\${encodeURIComponent(unitId)}/parts-history?...\`); } export function listUnitPartsHistory() {}`,
  };
  const bad = {
    routes: `app.get("/api/v1/maintenance/parts-invoice-links"`,
    page: `ServiceTimeline only`,
    section: `empty`,
    api: `listPartsAssignments only`,
  };

  const goodFails = computeFailures(good);
  if (goodFails.length > 0) {
    console.error(`${LABEL} --selftest FAIL: good corpus rejected: ${goodFails.join("; ")}`);
    process.exit(1);
  }
  const badFails = computeFailures(bad);
  if (badFails.length === 0) {
    console.error(`${LABEL} --selftest FAIL: bad corpus unexpectedly passed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const files = {
    routes: fs.existsSync(ROUTES) ? fs.readFileSync(ROUTES, "utf8") : "",
    page: fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8") : "",
    section: fs.existsSync(SECTION) ? fs.readFileSync(SECTION, "utf8") : "",
    api: fs.existsSync(API) ? fs.readFileSync(API, "utf8") : "",
  };

  const failures = computeFailures(files);
  if (failures.length > 0) {
    for (const msg of failures) {
      console.error(`${LABEL} FAIL: ${msg}`);
    }
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
