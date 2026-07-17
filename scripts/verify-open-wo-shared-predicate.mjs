#!/usr/bin/env node
/**
 * MAINT-2 guard — the open-work-order predicate must be SHARED between the KPI and the WO list, so the
 * KPI open-count and the table open-row count can't diverge (they did: the KPI had no exclusion, the list
 * used a display_id ILIKE 'DEMO-%' hack). Locks:
 *   (1) canonical-kpis.ts exports openWorkOrderPredicate(), and it = the open status set + voided_at IS NULL.
 *   (2) BOTH countOpenMaintenanceWorkOrders and countOpenWorkOrdersForUnit use openWorkOrderPredicate().
 *   (3) work-orders.routes.ts excludes voided WOs (w.voided_at IS NULL) and NO LONGER uses the
 *       display_id ILIKE 'DEMO-%'/'TEST-%' name-pattern hack (the void flag is the canonical exclusion).
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-open-wo-shared-predicate";
const KPI = "apps/backend/src/kpi/canonical-kpis.ts";
const LIST = "apps/backend/src/maintenance/work-orders.routes.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

export function assertGuard({ kpi, list }) {
  const errs = [];
  // strip comments so explanatory text (which may name the ILIKE hack or the void flag) is never matched.
  kpi = stripComments(kpi);
  list = stripComments(list);

  // (1) shared predicate exists and carries the void flag + open status set
  const m = /export function openWorkOrderPredicate[\s\S]{0,400}?return `([\s\S]*?)`;/.exec(kpi);
  if (!m) {
    errs.push(`${KPI}: missing exported openWorkOrderPredicate() helper`);
  } else {
    const body = m[1];
    if (!/voided_at IS NULL/.test(body)) errs.push(`${KPI}: openWorkOrderPredicate must exclude voided WOs (voided_at IS NULL)`);
    if (!/OPEN_MAINTENANCE_WO_STATUSES/.test(body)) errs.push(`${KPI}: openWorkOrderPredicate must use OPEN_MAINTENANCE_WO_STATUSES (the open status set)`);
  }

  // (2) both KPI counts use it
  for (const fn of ["countOpenMaintenanceWorkOrders", "countOpenWorkOrdersForUnit"]) {
    const body = extractFn(kpi, `export async function ${fn}`);
    if (!body) errs.push(`${KPI}: ${fn} not found`);
    else if (!/openWorkOrderPredicate\s*\(/.test(body)) errs.push(`${KPI}: ${fn} does not use the shared openWorkOrderPredicate()`);
  }

  // (3) list route uses the void flag via openWorkOrderPredicate or explicit w.voided_at IS NULL — not the ILIKE demo hack
  const listHandler = list.slice(list.indexOf('app.get("/api/v1/maintenance/work-orders"'));
  const usesSharedOpen =
    /openWorkOrderPredicate\s*\(\s*["']w["']\s*\)/.test(listHandler) || /\bw\.voided_at IS NULL/.test(listHandler);
  if (!usesSharedOpen) errs.push(`${LIST}: WO list does not exclude voided WOs — must use openWorkOrderPredicate("w") or w.voided_at IS NULL`);
  if (/ILIKE\s*'DEMO-%'|ILIKE\s*'TEST-%'/.test(list)) errs.push(`${LIST}: still uses the display_id ILIKE 'DEMO-%'/'TEST-%' name-pattern hack — replace with the canonical void flag`);

  return errs;
}

function extractFn(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const rest = src.slice(start + marker.length);
  const end = rest.indexOf("\nexport ");
  return src.slice(start, start + marker.length + (end >= 0 ? end : rest.length));
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function selftest() {
  const goodKpi =
    `export const OPEN_MAINTENANCE_WO_STATUSES = ["open","in_progress","waiting_parts"];\n` +
    `export function openWorkOrderPredicate(alias = "") { const a = alias?alias+".":""; return \`\${a}status IN (\${statusList(OPEN_MAINTENANCE_WO_STATUSES)}) AND \${a}voided_at IS NULL\`; }\n` +
    `export async function countOpenMaintenanceWorkOrders(c){ return c.query(\`... AND \${openWorkOrderPredicate()}\`); }\n` +
    `export async function countOpenWorkOrdersForUnit(c){ return c.query(\`... AND \${openWorkOrderPredicate()}\`); }\n` +
    `export function next(){}`;
  const goodList =
    `app.get("/api/v1/maintenance/work-orders", async () => { where.push(openWorkOrderPredicate("w")); });\n` +
    `where.push("w.voided_at IS NULL");`;
  const cases = [
    { n: "well-formed → 0", in: { kpi: goodKpi, list: goodList }, want: 0 },
    { n: "predicate missing void flag", in: { kpi: goodKpi.replace("voided_at IS NULL", "TRUE"), list: goodList }, min: 1 },
    { n: "a count fn not using shared", in: { kpi: goodKpi.replace("${openWorkOrderPredicate()}", "status IN ('open')"), list: goodList }, min: 1 },
    { n: "list keeps ILIKE hack", in: { kpi: goodKpi, list: goodList + `\nwhere.push("COALESCE(w.display_id,'') NOT ILIKE 'DEMO-%'");` }, min: 1 },
    { n: "list missing void flag", in: { kpi: goodKpi, list: `app.get("/api/v1/maintenance/work-orders", async () => { where.push("w.status = $2"); });` }, min: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const kpi = read(KPI), list = read(LIST);
if (kpi == null || list == null) { console.error(`[${LABEL}] FAILED — missing source file`); process.exit(1); }
const errs = assertGuard({ kpi, list });
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — KPI + WO list share openWorkOrderPredicate (open statuses + voided_at IS NULL); ILIKE demo hack removed.`);
