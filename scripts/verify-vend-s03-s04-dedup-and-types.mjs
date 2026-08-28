#!/usr/bin/env node
/**
 * VEND-S03 — vendor create dedup is entity-scoped (operating_company_id + live rows only).
 * VEND-S04 — create/edit vendor type uses createKind=vendor_type → catalogs.vendor_types.
 * VEND-F-PATCH-NAME-CONFLICT (GO-0019) — PATCH G6-2 scopes to the vendor row's operating_company_id.
 *
 *   node scripts/verify-vend-s03-s04-dedup-and-types.mjs
 *   node scripts/verify-vend-s03-s04-dedup-and-types.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-vend-s03-s04-dedup-and-types";
const ROUTES = "apps/backend/src/mdata/vendors.routes.ts";
const CREATE = "apps/frontend/src/components/vendors/VendorCreateModal.tsx";
const DRAWER = "apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";

function patchNameConflictSlice(routes) {
  const start = routes.indexOf('app.patch("/api/v1/mdata/vendors/:id"');
  if (start < 0) return "";
  const end = routes.indexOf('app.post("/api/v1/mdata/vendors/:id/deactivate"', start);
  return end > start ? routes.slice(start, end) : routes.slice(start);
}

function assert(files) {
  const problems = [];
  const routes = files[ROUTES] ?? "";
  const create = files[CREATE] ?? "";
  const drawer = files[DRAWER] ?? "";
  const registry = files[REGISTRY] ?? "";
  const patch = patchNameConflictSlice(routes);

  if (!/operating_company_id = \$2/.test(routes) || !/vendor_name/.test(routes)) {
    problems.push(`${ROUTES}: dedup must match vendor_name + operating_company_id`);
  }
  if (!/deactivated_at IS NULL/.test(routes)) {
    problems.push(`${ROUTES}: dedup must ignore deactivated vendors`);
  }
  // Resolve opco BEFORE dedup (G6-2)
  if (!/Resolve the operating company BEFORE the dedup|BEFORE the dedup check/.test(routes)) {
    problems.push(`${ROUTES}: must resolve operating company before dedup (entity-scoped)`);
  }
  if (!/createKind="vendor_type"/.test(create)) {
    problems.push(`${CREATE}: must use ReferenceSelect createKind=vendor_type`);
  }
  // LST-F3364 — drawer may embed VendorCreateModal; then createKind lives on the modal.
  const drawerEmbedsCreate =
    /<VendorCreateModal[\s>]/.test(drawer) && /\bembedded\b/.test(drawer);
  if (!drawerEmbedsCreate && !/createKind="vendor_type"/.test(drawer)) {
    problems.push(`${DRAWER}: must use ReferenceSelect createKind=vendor_type`);
  }
  if (drawerEmbedsCreate && !/createKind="vendor_type"/.test(create)) {
    problems.push(`${CREATE}: embedded NewVendorDrawerForm path missing createKind=vendor_type`);
  }
  if (!/vendor_type:\s*\{|key:\s*"vendor_type"/.test(registry) && !/vendor_type: catalogEntry/.test(registry)) {
    // check either style
    if (!/vendor_type/.test(registry) || !/catalogs\.vendor_types/.test(registry)) {
      problems.push(`${REGISTRY}: vendor_type must map to catalogs.vendor_types`);
    }
  }

  if (!patch) {
    problems.push(`${ROUTES}: PATCH /api/v1/mdata/vendors/:id handler missing`);
  } else {
    if (!/resolveVendorRowOperatingCompanyId/.test(patch)) {
      problems.push(`${ROUTES}: PATCH name-conflict must call resolveVendorRowOperatingCompanyId (vendor row entity)`);
    }
    if (/resolveOperatingCompanyId\(\s*client,\s*authUser\.uuid\s*\)/.test(patch)) {
      problems.push(`${ROUTES}: PATCH name-conflict must not use 2-arg resolveOperatingCompanyId (user default company)`);
    }
    if (/resolveOperatingCompanyId\(\s*client,\s*authUser\.uuid\s*,\s*b\.operating_company_id/.test(patch)) {
      problems.push(`${ROUTES}: PATCH name-conflict must not take entity from request body b.operating_company_id`);
    }
    if (/mdata_vendor_not_found/.test(patch) === false && !/404/.test(patch)) {
      problems.push(`${ROUTES}: invisible vendor on PATCH rename must 404, not fall back to default company`);
    }
  }
  const helper = routes.match(/async function resolveVendorRowOperatingCompanyId[\s\S]*?\n\}/)?.[0] ?? "";
  if (!/SELECT[\s\S]*operating_company_id[\s\S]*FROM mdata\.vendors/.test(helper)) {
    problems.push(`${ROUTES}: resolveVendorRowOperatingCompanyId must SELECT operating_company_id FROM mdata.vendors`);
  }
  return problems;
}

const files = Object.fromEntries(
  [ROUTES, CREATE, DRAWER, REGISTRY].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]),
);

if (SELFTEST) {
  const planted = {
    ...files,
    [CREATE]: files[CREATE].replace(/createKind="vendor_type"/g, 'createKind="gone"'),
  };
  const caught = assert(planted);
  if (!caught.some((p) => /vendor_type/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL`, caught);
    process.exit(1);
  }

  const rowCall = `const patchScopedCompanyId = await resolveVendorRowOperatingCompanyId(
        authUser.uuid,
        parsedParams.data.id
      );`;
  const twoArg = {
    ...files,
    [ROUTES]: files[ROUTES].replace(
      rowCall,
      `const patchScopedCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
        resolveOperatingCompanyId(client, authUser.uuid));`
    ),
  };
  const twoArgCaught = assert(twoArg);
  if (!twoArgCaught.some((p) => /2-arg resolveOperatingCompanyId/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — 2-arg PATCH resolve not caught`, twoArgCaught);
    process.exit(1);
  }

  const bodyArg = {
    ...files,
    [ROUTES]: files[ROUTES].replace(
      rowCall,
      `const patchScopedCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
        resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id));`
    ),
  };
  const bodyCaught = assert(bodyArg);
  if (!bodyCaught.some((p) => /request body/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — body-sourced PATCH resolve not caught`, bodyCaught);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — entity-scoped dedup + vendor_type → catalogs.vendor_types`);
process.exit(0);
