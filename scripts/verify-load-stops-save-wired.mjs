#!/usr/bin/env node
/**
 * LV-STOPS-NOSAVE ratchet — Load detail Stops tab must:
 *  1) mount MultiStopEditor when canEdit
 *  2) Save stops → replaceLoadStopsDispatch (POST /api/v1/loads/:id/stops)
 *  3) round-trip postal_code
 *  4) list path filters soft_deleted_at (else soft-delete replace looks "unchanged")
 *  5) backend replace inserts postal_code + address fields
 *
 * --selftest mutates MultiStopEditor to drop the POST call and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR = path.join(ROOT, "apps/frontend/src/pages/dispatch/MultiStopEditor.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const API = path.join(ROOT, "apps/frontend/src/api/dispatch.ts");
const SERVICE = path.join(ROOT, "apps/backend/src/dispatch/dispatch-refinements.service.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/dispatch/dispatch-refinements.routes.ts");

function assertWired(label, src, re) {
  if (!re.test(src)) throw new Error(`${label}: missing ${re}`);
}

function checkSources({ editor, drawer, api, service, routes }) {
  const errors = [];
  try {
    assertWired("LoadDetailDrawer", drawer, /activeTab === ["']Stops["']/);
    assertWired("LoadDetailDrawer", drawer, /<MultiStopEditor\b/);
    assertWired("LoadDetailDrawer", drawer, /canEdit\s*\?\s*\(?\s*<MultiStopEditor/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  try {
    assertWired("MultiStopEditor", editor, /replaceLoadStopsDispatch\s*\(/);
    assertWired("MultiStopEditor", editor, /Save stops/);
    assertWired("MultiStopEditor", editor, /mutateAsync\s*\(/);
    assertWired("MultiStopEditor", editor, /postal_code/);
    assertWired("MultiStopEditor", editor, /pushToast\([^)]*Could not save stops/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  try {
    assertWired("api/dispatch", api, /\/api\/v1\/loads\/\$\{encodeURIComponent\(loadId\)\}\/stops/);
    assertWired("api/dispatch", api, /method:\s*["']POST["']/);
    assertWired("api/dispatch", api, /postal_code\?/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  try {
    assertWired("refinements.service list", service, /soft_deleted_at IS NULL/);
    assertWired("refinements.service list", service, /ls\.postal_code/);
    assertWired("refinements.service replace", service, /postal_code,/);
    assertWired("refinements.routes", routes, /app\.post\(\s*["']\/api\/v1\/loads\/:loadId\/stops["']/);
    assertWired("refinements.routes", routes, /postal_code:/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  return errors;
}

function readAll() {
  return {
    editor: fs.readFileSync(EDITOR, "utf8"),
    drawer: fs.readFileSync(DRAWER, "utf8"),
    api: fs.readFileSync(API, "utf8"),
    service: fs.readFileSync(SERVICE, "utf8"),
    routes: fs.readFileSync(ROUTES, "utf8"),
  };
}

function selftest() {
  const orig = fs.readFileSync(EDITOR, "utf8");
  const broken = orig.replace(/return replaceLoadStopsDispatch\(loadId, body\);/, "return { ok: true, load_id: loadId };");
  if (broken === orig) throw new Error("selftest: could not plant defect (replaceLoadStopsDispatch call missing)");
  fs.writeFileSync(EDITOR, broken);
  try {
    const errors = checkSources(readAll());
    if (errors.length === 0) {
      throw new Error("selftest: planted defect did not FAIL the guard");
    }
    console.log("selftest PASS — planted no-POST Save fails:", errors[0]);
  } finally {
    fs.writeFileSync(EDITOR, orig);
  }
}

const args = new Set(process.argv.slice(2));
if (args.has("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = checkSources(readAll());
if (errors.length) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: load stops Save→POST wired (postal_code + soft-delete list filter)");
process.exit(0);
