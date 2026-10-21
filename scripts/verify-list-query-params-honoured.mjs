#!/usr/bin/env node
/**
 * verify-list-query-params-honoured — LEAD 443.219 G-STRICT + F-r1 (runtime audit 10-21,
 * ~/Downloads/10-21-2026-LEAD-AUDIT2-FRONTEND-BACKEND-RUNTIME.md). Static, no DB.
 *   RULE 1 — each named list route parses its query through strictListQuery (lib/strict-query.ts): an unknown param is a 400
 *            outside production, logged + stripped in production — never silently dropped.
 *   RULE 2 — the param the screen sends is READ by the handler (parsed but unused = the filter the screen shows does nothing).
 *   RULE 3 — the strict helper keeps both halves (strict() outside production; logged + stripped in production).
 *   RULE 4 — the backend registers the int8 parser before any pool (auth/db.ts → lib/pg-type-parsers.ts) and leaves numeric
 *            money alone: a bigint SUM / COUNT never string-concatenates.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ALLOW_OFFLINE_SKIP = "pure static source scan — never connects to a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => { try { return readFileSync(resolve(ROOT, rel), "utf8"); } catch { return ""; } };

export const ROUTES = [
  { file: "apps/backend/src/banking/drift-alerts.routes.ts", strict: "strictListQuerySchema", param: "resolved" },
  { file: "apps/backend/src/accounting/bills/recurring/routes.ts", strict: "strictListQuerySchema", param: "active_only" },
  { file: "apps/backend/src/accounting/expense-category-map/routes.ts", strict: "strictListQuerySchema", param: "include_inactive" },
  { file: "apps/backend/src/docs/files.routes.ts", strict: "strictListQuerySchema", param: "include_deleted" },
  { file: "apps/backend/src/lists/names-master.routes.ts", strict: "strictNamesSearchQuerySchema", param: "include_archived" },
  { file: "apps/backend/src/lists/names-master.routes.ts", strict: "strictNamesCountsQuerySchema", param: "include_archived" },
];
const HELPER = "apps/backend/src/lib/strict-query.ts";
const DB = "apps/backend/src/auth/db.ts";
const PARSERS = "apps/backend/src/lib/pg-type-parsers.ts";

export function check(src = {}) {
  const get = (rel) => (rel in src ? src[rel] : read(rel));
  const f = [];
  for (const r of ROUTES) {
    const s = get(r.file);
    const decl = new RegExp(`const ${r.strict} = strictListQuery\\(`);
    const use = new RegExp(`${r.strict}\\.safeParse\\(req\\.query`);
    if (!decl.test(s) || !use.test(s)) f.push(`RULE 1 ${r.file}: the list query is not parsed through strictListQuery (${r.strict}) — a dropped param would pass silently`);
    const body = s.replace(/^\s*\/\/.*$/gm, "");
    const reads = (body.match(new RegExp(`\\b${r.param}\\b`, "g")) ?? []).length;
    if (reads < 2) f.push(`RULE 2 ${r.file}: "${r.param}" is parsed but never read — the screen's filter does nothing`);
  }
  const h = get(HELPER);
  if (!/if \(env !== "production"\) return schema\.strict\(\);/.test(h) || !/strict_list_query_unknown_params/.test(h) || !/known\.has\(k\)/.test(h))
    f.push(`RULE 3 ${HELPER}: strictListQuery must 400 outside production and log + strip unknown params in production`);
  const db = get(DB), p = get(PARSERS);
  const reg = db.indexOf("registerPgTypeParsers();"), pool = db.indexOf("function buildPool(");
  if (reg < 0 || pool < 0 || reg > pool) f.push(`RULE 4 ${DB}: the int8 parser must be registered before any pool is built`);
  if (!/setTypeParser\(PG_INT8_OID, parseInt8/.test(p) || !/Number\.isSafeInteger\(n\) \? n : value/.test(p)) f.push(`RULE 4 ${PARSERS}: int8 must parse to a number when safe (exact string beyond)`);
  if (/setTypeParser\(\s*1700/.test(p)) f.push(`RULE 4 ${PARSERS}: numeric money must stay an exact string (no float parser)`);
  return f;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries([...new Set([...ROUTES.map((r) => r.file), HELPER, DB, PARSERS])].map((rel) => [rel, read(rel)]));
  if (check(base).length) { console.error("SELFTEST FAIL: baseline not clean", check(base)); process.exit(1); }
  const drift = ROUTES[0].file, docs = ROUTES[3].file;
  const plants = [
    ["drift alerts parses the bare schema", { [drift]: base[drift].replace("strictListQuerySchema.safeParse(req.query", "listQuerySchema.safeParse(req.query") }],
    ["docs list drops include_deleted", { [docs]: base[docs].replaceAll("query.include_deleted", "false") }],
    ["helper never strict", { [HELPER]: base[HELPER].replace('if (env !== "production") return schema.strict();', "") }],
    ["helper silently strips in production", { [HELPER]: base[HELPER].replace("strict_list_query_unknown_params", "x") }],
    ["parser not registered", { [DB]: base[DB].replace("registerPgTypeParsers();", "") }],
    ["int8 rounds unsafe values", { [PARSERS]: base[PARSERS].replace("Number.isSafeInteger(n) ? n : value", "n") }],
    ["numeric parsed to float", { [PARSERS]: base[PARSERS] + "\npg.types.setTypeParser(1700, parseFloat);\n" }],
  ];
  for (const [name, patch] of plants) {
    const k = Object.keys(patch)[0];
    if (patch[k] === base[k]) { console.error(`SELFTEST FAIL: plant "${name}" did not apply`); process.exit(1); }
    if (!check({ ...base, ...patch }).length) { console.error(`SELFTEST FAIL: plant "${name}" not caught`); process.exit(1); }
  }
  console.log(`verify-list-query-params-honoured --selftest PASS (${plants.length}/${plants.length} plants caught)`);
  process.exit(0);
}
if (isMain) {
  const f = check();
  if (f.length) { console.error(`verify-list-query-params-honoured: FAIL —\n  ${f.join("\n  ")}`); process.exit(1); }
  console.log(`verify-list-query-params-honoured: PASS — ${ROUTES.length} list reads strict + their params read; int8 parser registered, numeric money exact`);
}
