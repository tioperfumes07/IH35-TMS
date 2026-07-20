#!/usr/bin/env node
/**
 * GUARD — 0243-d1-3 / NewVendorDrawerForm must not silently drop captured
 * QBO-parity fields that the backend already accepts after migration 202607110230.
 *
 * Required createVendor() payload keys (backend-backed):
 *   city, state, website, print_on_check_name, postal_code
 *
 * Explicit non-requirement: `mobile` — mdata.vendors has no mobile column;
 * phantom writes are forbidden. Form may keep UI but must not send mobile.
 *
 * Rule 17: verify-steps only — no package.json / locked-guards / ci.yml edits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const DRAWER = "apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx";
const BACKEND = "apps/backend/src/mdata/vendors.routes.ts";

const REQUIRED_PAYLOAD_KEYS = [
  "city",
  "state",
  "website",
  "print_on_check_name",
  "postal_code",
];

function read(rel) {
  const abs = path.resolve(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function extractCreateVendorCall(src) {
  const start = src.indexOf("createVendor(");
  if (start < 0) return null;
  let i = start + "createVendor(".length;
  let depth = 1;
  let inStr = null;
  let escaped = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === "\\") {
        escaped = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function run() {
  const failures = [];
  const drawer = read(DRAWER);
  const backend = read(BACKEND);

  if (!drawer) failures.push(`missing:${DRAWER}`);
  if (!backend) failures.push(`missing:${BACKEND}`);

  if (drawer) {
    if (!drawer.includes("createVendor(")) {
      failures.push("drawer_missing_createVendor_call");
    } else {
      const call = extractCreateVendorCall(drawer);
      if (!call) {
        failures.push("drawer_createVendor_call_unparseable");
      } else {
        for (const key of REQUIRED_PAYLOAD_KEYS) {
          // Match object key form: city:  or "city":
          const re = new RegExp(`(?:^|[\\s,{])${key}\\s*:`);
          if (!re.test(call)) {
            failures.push(`drawer_drops_${key}`);
          }
        }
        // Honesty: never phantom-write mobile
        if (/\bmobile\s*:/.test(call)) {
          failures.push("drawer_phantom_writes_mobile_no_backend_column");
        }
      }
    }

    // UI must still capture the backend-backed fields (inputs exist).
    for (const label of ["Website", "Name to print on checks", "City", "State"]) {
      // City/State are placeholders; Website / print-on-check are labels.
      const present =
        drawer.includes(`placeholder="${label}"`) ||
        drawer.includes(`>${label}<`) ||
        drawer.includes(`>${label} *<`) ||
        drawer.includes(label);
      if (!present) failures.push(`drawer_ui_missing_${label.replace(/\s+/g, "_").toLowerCase()}`);
    }

    // Stale "held back until migration 202607110230" comment must not return.
    if (/held back until migration\s+202607110230/i.test(drawer)) {
      failures.push("drawer_stale_held_back_migration_comment");
    }
  }

  if (backend) {
    for (const key of REQUIRED_PAYLOAD_KEYS) {
      if (!backend.includes(`${key}:`)) {
        failures.push(`backend_schema_missing_${key}`);
      }
    }
    // Document the intentional mobile gap so a future column can reopen the wire-up.
    if (/\bmobile\b/.test(backend) && /createVendorBodySchema[\s\S]*mobile/.test(backend)) {
      // If backend later adds mobile to create schema, guard still passes; no fail.
    }
  }

  return { ok: failures.length === 0, failures };
}

function selftest() {
  const good = `
    const res = await createVendor({
      name: displayName,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      postal_code: form.zip.trim() || undefined,
      website: form.website.trim() || undefined,
      print_on_check_name: form.printOnChecks.trim() || undefined,
      operating_company_id: operatingCompanyId,
    });
  `;
  const bad = `
    const res = await createVendor({
      name: displayName,
      phone: form.phone.trim() || undefined,
      operating_company_id: operatingCompanyId,
    });
  `;
  const phantomMobile = `
    const res = await createVendor({
      name: displayName,
      city: form.city,
      state: form.state,
      postal_code: form.zip,
      website: form.website,
      print_on_check_name: form.printOnChecks,
      mobile: form.mobile,
    });
  `;

  function keysPresent(src) {
    const call = extractCreateVendorCall(src);
    if (!call) return false;
    return REQUIRED_PAYLOAD_KEYS.every((k) => new RegExp(`(?:^|[\\s,{])${k}\\s*:`).test(call));
  }
  function writesMobile(src) {
    const call = extractCreateVendorCall(src);
    return call ? /\bmobile\s*:/.test(call) : false;
  }

  if (!keysPresent(good)) throw new Error("selftest: good fixture should pass key check");
  if (keysPresent(bad)) throw new Error("selftest: bad fixture should fail key check");
  if (!writesMobile(phantomMobile)) throw new Error("selftest: phantom mobile should be detected");
  if (writesMobile(good)) throw new Error("selftest: good fixture must not write mobile");
  console.log("verify-vendor-drawer-fields-not-dropped selftest OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const { ok, failures } = run();
  if (!ok) {
    console.error("verify-vendor-drawer-fields-not-dropped FAILED");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log("verify-vendor-drawer-fields-not-dropped OK");
}

export { run, REQUIRED_PAYLOAD_KEYS };
