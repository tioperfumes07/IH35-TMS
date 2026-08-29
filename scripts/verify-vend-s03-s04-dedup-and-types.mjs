#!/usr/bin/env node
/**
 * VEND-S03 — vendor create dedup is entity-scoped (operating_company_id + live rows only).
 * VEND-S04 — create/edit vendor type uses createKind=vendor_type → catalogs.vendor_types.
 * VEND-F-PATCH-NAME-CONFLICT (GO-0019) — PATCH G6-2 scopes to the vendor row's operating_company_id.
 * VEND-F-DEACTIVATE-REACTIVATE-PATCH-GRANTLESS-404 (GO-0022) — deactivate/reactivate/PATCH SELECTs
 *   must use org.user_accessible_company_ids() not direct org.user_company_access (Owner with 0 uca).
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

  // VEND-F-DEACTIVATE-REACTIVATE-PATCH-GRANTLESS-404 (GO-0022) — the three vendor write SELECTs
  // (PATCH, deactivate, reactivate) must scope membership via org.user_accessible_company_ids(),
  // not a direct org.user_company_access probe. Owner role with 0 uca rows must still find their
  // vendors — user_accessible_company_ids() returns ALL active companies for Owner.
  const deactivateSlice = routes.slice(routes.indexOf('app.post("/api/v1/mdata/vendors/:id/deactivate"'));
  const reactivateSlice = routes.slice(routes.indexOf('app.post("/api/v1/mdata/vendors/:id/reactivate"'));
  const slices = [
    { name: "PATCH", text: patch },
    { name: "deactivate", text: deactivateSlice },
    { name: "reactivate", text: reactivateSlice },
  ];
  for (const { name, text } of slices) {
    if (!text) continue;
    if (/FROM org\.user_company_access/.test(text)) {
      problems.push(`${ROUTES}: ${name} SELECT must use org.user_accessible_company_ids() not direct org.user_company_access (Owner with 0 uca gets 404)`);
    }
  }

  // LST-F9101 — vendor deactivate endpoint must have rateLimit config (CodeQL js/missing-rate-limiting).
  // The reactivate sibling already had it; deactivate was the only vendor write endpoint missing it.
  const deactivateHead = routes.match(/app\.post\("\/api\/v1\/mdata\/vendors\/:id\/deactivate"[^)]*\)/)?.[0] ?? "";
  if (deactivateHead && !/rateLimit/.test(deactivateHead)) {
    problems.push(`${ROUTES}: deactivate endpoint must have config.rateLimit (CodeQL js/missing-rate-limiting — LST-F9101)`);
  }
  // LST-F9102 — vendor LIST endpoint must have rateLimit config. The detail and classifications
  // GETs already had it; the list GET was the only vendor read endpoint missing it.
  const listHead = routes.match(/app\.get\("\/api\/v1\/mdata\/vendors"[^)]*\)/)?.[0] ?? "";
  if (listHead && !/rateLimit/.test(listHead)) {
    problems.push(`${ROUTES}: vendor list endpoint must have config.rateLimit (CodeQL js/missing-rate-limiting — LST-F9102)`);
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
  // fall through to grantless-404 selftest
}

// VEND-F-DEACTIVATE-REACTIVATE-PATCH-GRANTLESS-404 selftest: plant a direct uca query in deactivate
if (SELFTEST) {
  const plantedUca = {
    ...files,
    [ROUTES]: files[ROUTES].replace(
      /SELECT id, operating_company_id, deactivated_at\s+FROM mdata\.vendors\s+WHERE id = \$1\s+AND operating_company_id IN \(\s+SELECT org\.user_accessible_company_ids\(\)\s+\)/,
      `SELECT id, operating_company_id, deactivated_at
               FROM mdata.vendors
              WHERE id = $1
                AND operating_company_id IN (
                  SELECT uca.company_id
                    FROM org.user_company_access uca
                    JOIN org.companies oc ON oc.id = uca.company_id AND oc.deactivated_at IS NULL
                   WHERE uca.user_id = $2::uuid
                     AND uca.deactivated_at IS NULL
                )`
    ),
  };
  const ucaCaught = assert(plantedUca);
  if (!ucaCaught.some((p) => /deactivate.*user_accessible_company_ids/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — direct uca in deactivate not caught`, ucaCaught);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS (grantless-404 plant)`);
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
