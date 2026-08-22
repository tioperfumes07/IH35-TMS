#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.reference.us_states.list","catalog.reference.mexico_states.list"],"task":"LISTS-F5972-REFERENCE-STATES-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-reference-states-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  hub: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
  page: "apps/frontend/src/pages/lists/reference/StatesCatalogPage.tsx",
  api: "apps/frontend/src/api/catalogs.ts",
  backend: "apps/backend/src/catalogs/states.routes.ts",
};
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  for (const [country, label, route] of [["us", "US States", "/lists/reference/us-states"], ["mexico", "Mexico States", "/lists/reference/mexico-states"]]) {
    const id = `catalog.reference.${country}_states.list`;
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (JSON.stringify(leaf?.required) !== JSON.stringify(["connectivity"])) failures.push(`${id} must require only connectivity`);
    if (leaf?.route_hint !== route || leaf?.sub !== label) failures.push(`${id} route/label drifted`);
    if (!src.manifest.includes(`path="${route}"`)) failures.push(`${label} route missing`);
  }
  for (const token of ['name: "US States"', 'catalogKey: "us-states"', 'name: "Mexico States"', 'catalogKey: "mexico-states"'])
    if (!src.hub.includes(token)) failures.push(`Reference hub missing ${token}`);
  for (const token of ['listUsStates()', 'listMexicoStates()', 'catalogName: "reference.us_states"', 'catalogName: "reference.mexico_states"', "query.isError", "query.refetch()", "<CatalogTable"])
    if (!src.page.includes(token)) failures.push(`States page missing ${token}`);
  if (!/\breadOnly\s*(?:\r?\n|onEdit)/.test(src.page)) failures.push("States table must remain read-only");
  for (const [fn, endpoint] of [["listUsStates", "/api/v1/catalogs/us-states"], ["listMexicoStates", "/api/v1/catalogs/mexico-states"]])
    if (!new RegExp(`export function ${fn}\\(\\)[\\s\\S]{0,120}${endpoint.replaceAll("/", "\\/")}[\"\u0060]`).test(src.api)) failures.push(`${fn} canonical GET missing`);
  for (const [endpoint, table] of [["us-states", "catalogs.us_states"], ["mexico-states", "catalogs.mexico_states"]]) {
    if (!src.backend.includes(`app.get("/api/v1/catalogs/${endpoint}"`)) failures.push(`${endpoint} backend GET missing`);
    if (!src.backend.includes(`FROM ${table}\n`)) failures.push(`${table} canonical read missing`);
  }
  if (!src.backend.includes("requireAuth(req, reply)") || !src.backend.includes("WHERE is_active = true") || !src.backend.includes("ORDER BY name ASC")) failures.push("authenticated active ordered reference read missing");
  if (/app\.(post|patch|delete)\("\/api\/v1\/catalogs\/(us|mexico)-states/.test(src.backend)) failures.push("fixed geographic references must remain read-only");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"sub": "Mexico States"', '"sub": "US States"')],
    ["manifest", original.manifest.replace('path="/lists/reference/us-states"', 'path="/lists/reference/us-states-broken"')],
    ["hub", original.hub.replace('catalogKey: "mexico-states"', 'catalogKey: "mexico-states-broken"')],
    ["page", original.page.replace("listUsStates()", "Promise.resolve({ states: [] })")],
    ["page", original.page.replace("readOnly", "readOnly={false}")],
    ["api", original.api.replace('"/api/v1/catalogs/mexico-states"', '"/api/v1/catalogs/mexico-states-broken"')],
    ["backend", original.backend.replace("FROM catalogs.us_states", "FROM catalogs.us_states_broken")],
    ["backend", `${original.backend}\napp.post("/api/v1/catalogs/us-states", async () => ({}));`],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-reference-states-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-reference-states-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-reference-states-connectivity-exact PASS — authenticated canonical US/Mexico geographic reference lists are mounted, searchable, exact-owned, and intentionally read-only");
