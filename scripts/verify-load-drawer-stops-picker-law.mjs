#!/usr/bin/env node
/**
 * Load drawer Stops picker_law — MultiStopEditor must expose ReferenceSelect
 * createKind="pickup_time_type" (inline + Add new) and persist pickup_time_type_id.
 *
 * FAIL: SelectCombobox-only Type + free-text address with no catalog picker (AUDIT 3010).
 * PASS: ReferenceSelect + createKind pickup_time_type + backend INSERT/SELECT column.
 *
 * Self-test: node scripts/verify-load-drawer-stops-picker-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-drawer-stops-picker-law";
const EDITOR = path.join(ROOT, "apps/frontend/src/pages/dispatch/MultiStopEditor.tsx");
const SERVICE = path.join(ROOT, "apps/backend/src/dispatch/dispatch-refinements.service.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/dispatch/dispatch-refinements.routes.ts");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const editor = fs.readFileSync(EDITOR, "utf8");
  assert(/ReferenceSelect/.test(editor), "MultiStopEditor must import/use ReferenceSelect");
  assert(/createKind=["']pickup_time_type["']/.test(editor), 'ReferenceSelect createKind="pickup_time_type" required');
  assert(/pickup_time_type_id/.test(editor), "FE must carry pickup_time_type_id on stop rows");
  assert(/pickupTimeTypesCatalogClient/.test(editor), "must load catalogs.pickup_time_types for options");

  const service = fs.readFileSync(SERVICE, "utf8");
  assert(/ls\.pickup_time_type_id/.test(service), "listLoadStopsRefined must SELECT pickup_time_type_id");
  assert(/pickup_time_type_id/.test(service) && /INSERT INTO mdata\.load_stops/.test(service), "replaceLoadStopsRefined must INSERT pickup_time_type_id");

  const routes = fs.readFileSync(ROUTES, "utf8");
  assert(/pickup_time_type_id:\s*z\.string\(\)\.uuid\(\)/.test(routes), "stops POST zod must accept pickup_time_type_id");
}

function selftest() {
  const original = fs.readFileSync(EDITOR, "utf8");
  const broken = original.replace(/createKind=["']pickup_time_type["']/, 'createKind="detention_reason"');
  fs.writeFileSync(EDITOR, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(EDITOR, original);
  }
  assert(failed, "--selftest expected FAIL when createKind is mutated away from pickup_time_type");
  check();
  console.log(`${LABEL}: OK — selftest PASS`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
