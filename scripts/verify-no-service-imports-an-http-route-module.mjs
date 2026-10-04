#!/usr/bin/env node
/**
 * verify-no-service-imports-an-http-route-module — CC-2 2026-10-04.
 *
 * A service, cron, job, executor or poster must never import an HTTP route module. Measured on main 2026-10-04: 13
 * non-route modules did (bills.service, the void-cancel executor, the reefer-hours cron, the tire-tread worker, the program
 * tracker, three geofence / border / reconciler jobs, ...). Each import dragged the route's whole graph in with it — the
 * auth middleware and the Lucia session provider among it — so:
 *   - four maintenance / invoice test files could not even load ("No luciaPool export ... on the auth/db mock"), and the
 *     failures they were hiding sat unseen on main;
 *   - to avoid the import, four services re-typed the expense GL flag key and seventeen files re-typed the USMCA company id
 *     (a wrong digit in any copy silently scopes that path to no company).
 * The shared symbols now live in plain modules (tire-positions, build-identity, expense-gl-posting-flag, company-ids,
 * reefer-hours.service, work-order-financial-settle.service, expense-bank-match-sql); route files import them back.
 *
 * An HTTP route module is identified by what it DOES (registers endpoints: app.get / post / put / patch / delete / route),
 * not by its name:
 * outbox/handlers/operational-notice.routes.ts is a notice routing table with no fastify and is allowed.
 * Ceiling 0 — no baseline. Static, no database. Run: node scripts/verify-no-service-imports-an-http-route-module.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const LABEL = "verify-no-service-imports-an-http-route-module";

/** A module that REGISTERS HTTP endpoints (app.get / post / put / patch / delete / route), or a route-layer file by
 *  convention (*.routes.ts / route.ts) that imports fastify — some register through a factory (bulk / catalog routes).
 *  Taking a FastifyInstance alone (a cron initialiser, Sentry, a middleware) does not make a module a route module, and
 *  a *.routes.ts file with no fastify (a notice routing table) is not one either. */
export function isHttpRouteModule(src, file = "") {
  if (/\b(?:app|fastify|server|instance)\.(?:get|post|put|patch|delete|route)\s*[(<]/.test(src)) return true;
  return /(?:\.routes|\/routes?)\.ts$/.test(file) && /from\s+["']fastify(?:-plugin)?["']/.test(src);
}

/** The route layer itself may import route modules: route files and index.ts aggregators that register them. */
export function isRouteLayer(src, file) {
  return isHttpRouteModule(src, file) || /\/index\.ts$/.test(file);
}

/** Static, value (non-type) imports of relative modules. */
export function relativeValueImports(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*import\s+(?!type\b)([\s\S]*?)\s+from\s+["'](\.{1,2}\/[^"']+)["']/gm)) out.push(m[2]);
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "__tests__", "dist"].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** files: Map<absPath, source>. Returns ["importer -> target", ...] for every non-route module importing a route module. */
export function findViolations(files) {
  const bad = [];
  for (const [file, src] of files) {
    if (isRouteLayer(src, file)) continue; // the route layer may import route modules (it registers or re-exports them)
    for (const spec of relativeValueImports(src)) {
      const target = path.resolve(path.dirname(file), spec.replace(/\.js$/, ".ts"));
      const tsrc = files.get(target);
      if (tsrc !== undefined && isHttpRouteModule(tsrc, target)) bad.push(`${path.relative(ROOT, file)} -> ${path.relative(ROOT, target)}`);
    }
  }
  return bad.sort();
}

if (process.argv.includes("--selftest")) {
  const f = (o) => new Map(Object.entries(o).map(([k, v]) => [path.join(SRC, k), v]));
  const route = 'import type { FastifyInstance } from "fastify";\nexport const X = 1;\nexport async function register(app: FastifyInstance) { app.get("/x", async () => 1); }';
  const cases = [
    ["a service importing a route module is caught", findViolations(f({ "a/svc.ts": 'import { X } from "./r.routes.js";', "a/r.routes.ts": route })).length, 1],
    ["a type-only import is not a runtime dependency", findViolations(f({ "a/svc.ts": 'import type { X } from "./r.routes.js";', "a/r.routes.ts": route })).length, 0],
    ["a route module importing another route module is allowed", findViolations(f({ "a/b.routes.ts": route + '\nimport { X } from "./r.routes.js";', "a/r.routes.ts": route })).length, 0],
    ["a *.routes.ts file that registers nothing (a routing table) is not a route module", findViolations(f({ "a/h.ts": 'import { T } from "./n.routes.js";', "a/n.routes.ts": "export const T = {};" })).length, 0],
    ["taking a FastifyInstance without registering endpoints (a cron initialiser) is not a route module", findViolations(f({ "a/svc.ts": 'import { init } from "./c.cron.js";', "a/c.cron.ts": 'import type { FastifyInstance } from "fastify";\nexport function init(app: FastifyInstance) { app.log.info("x"); }' })).length, 0],
    ["a plain module import is fine", findViolations(f({ "a/svc.ts": 'import { X } from "./plain.js";', "a/plain.ts": "export const X = 1;" })).length, 0],
  ];
  let bad = 0;
  for (const [name, got, want] of cases) if (got !== want) { console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`); bad++; }
  if (bad) process.exit(1);
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(0);
}

const files = new Map(walk(SRC).map((p) => [p, fs.readFileSync(p, "utf8")]));
if (files.size < 500) { console.error(`${LABEL}: FAIL — scanned only ${files.size} files under apps/backend/src; scope is wrong, refusing to pass vacuously`); process.exit(1); }
const routeCount = [...files].filter(([p, src]) => isHttpRouteModule(src, p)).length;
const bad = findViolations(files);
if (bad.length) {
  console.error(`${LABEL}: FAIL — ${bad.length} non-route module(s) import an HTTP route module (ceiling 0):`);
  for (const b of bad) console.error(`  ✗ ${b}`);
  console.error("Fix: move the shared symbol into a plain module and import it from there; the route file imports it back.");
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${files.size} backend modules scanned, ${routeCount} HTTP route modules, 0 imported by a non-route module.`);
