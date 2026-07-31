#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — CreateWOSectionIdentification's roadside provider field was a free-text
 * UUID input for roadside_provider_vendor_id. Backend requires a real mdata.vendors id for
 * roadside WOs (work-orders.service.ts LEFT JOIN + E_ROADSIDE_PROVIDER_REQUIRED). Fix:
 * ReferenceSelect createKind="vendor" (same vendorOptions / listVendors already used for shop vendor).
 *
 * Cursor even claim: 1868.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-wo-roadside-vendor-inline-create";

const PAGE = "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx";
const BACKEND = "apps/backend/src/maintenance/work-orders.service.ts";

function readRel(root, rel, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, rel)) {
    return overrides[rel];
  }
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT, overrides = null) {
  const problems = [];
  const page = readRel(root, PAGE, overrides);
  const backend = readRel(root, BACKEND, overrides);

  if (!page) problems.push(`missing ${PAGE}`);
  else {
    const code = stripComments(page);
    if (!/createKind=["']vendor["']/.test(code)) {
      problems.push(`${PAGE}: must use createKind=vendor somewhere (shop + roadside)`);
    }
    if (!/data-testid=["']wo-roadside-provider-vendor-select["']/.test(page)) {
      problems.push(`${PAGE}: roadside provider must use ReferenceSelect (testid wo-roadside-provider-vendor-select)`);
    }
    if (!/roadside_provider_vendor_id[\s\S]{0,400}createKind=["']vendor["']/.test(page) &&
        !/createKind=["']vendor["'][\s\S]{0,400}roadside_provider_vendor_id/.test(page)) {
      // Ensure the roadside block specifically wires createKind=vendor near the field
      const roadsideBlock = page.split("Roadside Provider")[1]?.slice(0, 1200) ?? "";
      if (!/createKind=["']vendor["']/.test(roadsideBlock)) {
        problems.push(`${PAGE}: roadside provider picker must use createKind=vendor`);
      }
    }
    // Bare free-text register-only control as the primary roadside vendor UI
    if (/Field label="Roadside Provider Vendor ID \*"[\s\S]{0,200}<input \{\.\.\.register\("roadside_provider_vendor_id"\)\}/.test(page)) {
      problems.push(`${PAGE}: must not keep free-text roadside_provider_vendor_id as the primary control`);
    }
  }

  if (!backend) problems.push(`missing ${BACKEND}`);
  else {
    if (!/E_ROADSIDE_PROVIDER_REQUIRED/.test(backend)) {
      problems.push(`${BACKEND}: must keep E_ROADSIDE_PROVIDER_REQUIRED gate`);
    }
    if (!/LEFT JOIN mdata\.vendors v ON v\.id = w\.roadside_provider_vendor_id/.test(backend)) {
      problems.push(`${BACKEND}: roadside_provider_vendor_id must join mdata.vendors`);
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
    "testid-removed",
    PAGE,
    (s) => s.replace(/data-testid=["']wo-roadside-provider-vendor-select["']/, 'data-testid="gone"'),
    "wo-roadside-provider-vendor-select"
  );
  expectCaught(
    "roadside-createKind-removed",
    PAGE,
    (s) => {
      // Only strip createKind inside the roadside block
      const parts = s.split("Roadside Provider");
      if (parts.length < 2) return s;
      parts[1] = parts[1].replace(/createKind=["']vendor["']/, 'createKind="customer"');
      return parts.join("Roadside Provider");
    },
    "createKind=vendor"
  );
  expectCaught(
    "freetext-reintroduced",
    PAGE,
    (s) =>
      s.replace(
        /Field label="Roadside Provider Vendor \*"[\s\S]*?<\/Field>/,
        `Field label="Roadside Provider Vendor ID *">
            <input {...register("roadside_provider_vendor_id")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </Field>`
      ),
    "free-text"
  );
  expectCaught(
    "backend-gate-removed",
    BACKEND,
    (s) => s.replace(/E_ROADSIDE_PROVIDER_REQUIRED/g, "E_GONE"),
    "E_ROADSIDE_PROVIDER_REQUIRED"
  );
  expectCaught(
    "backend-join-changed",
    BACKEND,
    (s) => s.replace(/LEFT JOIN mdata\.vendors v ON v\.id = w\.roadside_provider_vendor_id/, "LEFT JOIN mdata.qbo_vendors v ON v.id = w.roadside_provider_vendor_id"),
    "mdata.vendors"
  );

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 5 planted defects caught, live sources clean`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — CreateWO roadside provider uses ReferenceSelect createKind=vendor (mdata.vendors)`
  );
}
