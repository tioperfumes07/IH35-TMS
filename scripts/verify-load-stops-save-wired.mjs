#!/usr/bin/env node
/**
 * LV-STOPS-NOSAVE ratchet — Load detail Stops tab must:
 *  1) mount MultiStopEditor when canEdit
 *  2) Save stops → replaceLoadStopsDispatch (POST /api/v1/loads/:id/stops)
 *  3) round-trip postal_code
 *  4) list path filters soft_deleted_at (else soft-delete replace looks "unchanged")
 *  5) backend replace inserts postal_code + address fields
 *
 *  6) snapshot load/company/rows, suppress stale completion, and lock edits pending
 *
 * --selftest plants each lifecycle regression independently and expects FAIL.
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
  const replaceService = service.match(/export async function replaceLoadStopsRefined\([\s\S]*?(?=\nexport async function listAvailableDriversForDispatch)/)?.[0] ?? "";
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
    assertWired("MultiStopEditor", editor, /mut\.mutate\(\{ generation: actionGenerationRef\.current, loadId: submittedLoadId, companyId, body \}\)/);
    assertWired("MultiStopEditor", editor, /postal_code/);
    assertWired("MultiStopEditor", editor, /pushToast\([^)]*Could not save stops/);
    assertWired("MultiStopEditor", editor, /mutationFn: async \(input: SaveStopsInput\)[\s\S]*?replaceLoadStopsDispatch\(input\.loadId, input\.body\)/);
    assertWired("MultiStopEditor", editor, /onSuccess: async \(_result, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;/);
    assertWired("MultiStopEditor", editor, /onError: \(err, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;/);
    assertWired("MultiStopEditor", editor, /\["dispatch", "load-stops-refined", input\.loadId, input\.companyId\]/);
    assertWired("MultiStopEditor", editor, /\["loads", "detail", input\.loadId\]/);
    assertWired("MultiStopEditor", editor, /<fieldset[^>]*disabled=\{mut\.isPending\}[^>]*aria-busy=\{mut\.isPending\}/);
    assertWired("MultiStopEditor", editor, /useSortable\(\{ id: row\.key, disabled \}\)/);
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
    assertWired("refinements.service exact archive snapshot", replaceService, /const existingStops = await client\.query<\{ id: string \}>\([\s\S]*?FROM mdata\.load_stops[\s\S]*?FOR UPDATE/);
    assertWired("refinements.service archive identity", replaceService, /const archivedStops = await client\.query<\{ id: string \}>\(\s*`UPDATE mdata\.load_stops[\s\S]*?id = ANY\(\$2::uuid\[\]\)[\s\S]*?RETURNING id::text AS id`,\s*\[loadId, existingStopIds\]\s*\)/);
    assertWired("refinements.service archive completeness", replaceService, /archivedStopIds\.size !== existingStopIds\.length[\s\S]*?existingStopIds\.some\(\(id\) => !archivedStopIds\.has\(id\)\)[\s\S]*?E_LOAD_STOP_REPLACE_ARCHIVE_CONFLICT/);
    assertWired("refinements.service insert identity", replaceService, /const insertedStop = await client\.query<\{ id: string \}>\([\s\S]*?INSERT INTO mdata\.load_stops[\s\S]*?RETURNING id::text AS id[\s\S]*?if \(!insertedStop\.rows\[0\]\?\.id\)[\s\S]*?E_LOAD_STOP_REPLACE_INSERT_CONFLICT/);
    assertWired("refinements.service stop type", service, /code: "E_STOP_TYPE_INVALID"/);
    assertWired("refinements.routes", routes, /app\.post\(\s*["']\/api\/v1\/loads\/:loadId\/stops["']/);
    assertWired("refinements.routes", routes, /postal_code:/);
    assertWired("refinements.routes stop type enum", routes, /stop_type: z\.enum\(\["pickup", "delivery", "dropoff", "fuel", "rest", "border", "customs"\]\)/);
    assertWired("refinements.routes stop type error", routes, /E_STOP_TYPE_INVALID[\s\S]{0,240}reply\.code\(400\)/);
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
  const sources = readAll();
  const mutations = [
    ["submitted load snapshot", "replaceLoadStopsDispatch(input.loadId, input.body)", "replaceLoadStopsDispatch(loadId, input.body)"],
    ["stale completion guard", "input.generation !== actionGenerationRef.current", "false"],
    ["submitted company invalidation", '["dispatch", "load-stops-refined", input.loadId, input.companyId]', '["dispatch", "load-stops-refined", loadId, operatingCompanyId]'],
    ["pending editor lock", 'disabled={mut.isPending} aria-busy={mut.isPending}', 'aria-busy={mut.isPending}'],
    ["drag lock", "useSortable({ id: row.key, disabled })", "useSortable({ id: row.key })"],
  ];
  for (const [label, from, to] of mutations) {
    const editor = sources.editor.replace(from, to);
    if (editor === sources.editor) throw new Error(`selftest: could not plant ${label}`);
    const errors = checkSources({ ...sources, editor });
    if (errors.length === 0) {
      throw new Error(`selftest: planted ${label} did not FAIL the guard`);
    }
    console.log(`selftest PASS — planted ${label} fails:`, errors[0]);
  }
  const serviceMutation = sources.service.replace('code: "E_STOP_TYPE_INVALID"', 'code: "REMOVED"');
  if (serviceMutation === sources.service) throw new Error("selftest: could not plant stop-type service failure");
  if (checkSources({ ...sources, service: serviceMutation }).length === 0) {
    throw new Error("selftest: planted stop-type service failure did not FAIL the guard");
  }
  console.log("selftest PASS — planted stop-type service failure is rejected");

  const archiveIdentityMutation = sources.service.replace("        RETURNING id::text AS id`,\n        [loadId, existingStopIds]", "        `,\n        [loadId, existingStopIds]");
  if (archiveIdentityMutation === sources.service) throw new Error("selftest: could not plant archive identity failure");
  if (checkSources({ ...sources, service: archiveIdentityMutation }).length === 0) {
    throw new Error("selftest: planted archive identity failure did not FAIL the guard");
  }
  console.log("selftest PASS — planted archive identity failure is rejected");

  const archiveCompletenessMutation = sources.service.replace("archivedStopIds.size !== existingStopIds.length", "false");
  if (archiveCompletenessMutation === sources.service) throw new Error("selftest: could not plant archive completeness failure");
  if (checkSources({ ...sources, service: archiveCompletenessMutation }).length === 0) {
    throw new Error("selftest: planted archive completeness failure did not FAIL the guard");
  }
  console.log("selftest PASS — planted archive completeness failure is rejected");

  const insertIdentityMutation = sources.service.replace("if (!insertedStop.rows[0]?.id)", "if (false)");
  if (insertIdentityMutation === sources.service) throw new Error("selftest: could not plant insert identity failure");
  if (checkSources({ ...sources, service: insertIdentityMutation }).length === 0) {
    throw new Error("selftest: planted insert identity failure did not FAIL the guard");
  }
  console.log("selftest PASS — planted insert identity failure is rejected");

  const routesMutation = sources.routes.replace('stop_type: z.enum(["pickup", "delivery", "dropoff", "fuel", "rest", "border", "customs"])', 'stop_type: z.string()');
  if (routesMutation === sources.routes) throw new Error("selftest: could not plant stop-type route failure");
  if (checkSources({ ...sources, routes: routesMutation }).length === 0) {
    throw new Error("selftest: planted stop-type route failure did not FAIL the guard");
  }
  console.log("selftest PASS — planted stop-type route failure is rejected");
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
