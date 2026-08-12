#!/usr/bin/env node
/**
 * MAINT-2 — Active/open WOs KPI count must match list + bucket endpoints via ONE shared predicate.
 * Locks:
 *   (1) canonical-kpis.ts exports openWorkOrderPredicate() = OPEN_MAINTENANCE_WO_STATUSES + voided_at IS NULL.
 *   (2) countOpenMaintenanceWorkOrders uses openWorkOrderPredicate().
 *   (3) listWorkOrdersByBucket (work-orders.service.ts) uses openWorkOrderPredicate("w") — not NOT IN complete/cancelled.
 *   (4) GET /maintenance/work-orders list route applies openWorkOrderPredicate("w") for the default Active-WOs scope.
 *   (5) dashboard-kpis.routes.ts open-WO subsidiary queries use openWorkOrderPredicate(), not ad-hoc status IN lists.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maint-open-wos-kpi-consistency";
const KPI = "apps/backend/src/kpi/canonical-kpis.ts";
const BUCKET = "apps/backend/src/maintenance/work-orders.service.ts";
const LIST = "apps/backend/src/maintenance/work-orders.routes.ts";
const DASH = "apps/backend/src/maintenance/dashboard-kpis.routes.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function extractFn(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const rest = src.slice(start + marker.length);
  const end = rest.indexOf("\nexport ");
  return src.slice(start, start + marker.length + (end >= 0 ? end : rest.length));
}

export function assertGuard({ kpi, bucket, list, dash }) {
  const errs = [];
  kpi = stripComments(kpi);
  bucket = stripComments(bucket);
  list = stripComments(list);
  dash = stripComments(dash);

  const pred = /export function openWorkOrderPredicate[\s\S]{0,400}?return `([\s\S]*?)`;/.exec(kpi);
  if (!pred) {
    errs.push(`${KPI}: missing exported openWorkOrderPredicate()`);
  } else {
    const body = pred[1];
    if (!/voided_at IS NULL/.test(body)) errs.push(`${KPI}: openWorkOrderPredicate must exclude voided WOs`);
    if (!/OPEN_MAINTENANCE_WO_STATUSES/.test(body)) errs.push(`${KPI}: openWorkOrderPredicate must use OPEN_MAINTENANCE_WO_STATUSES`);
  }

  const countOpen = extractFn(kpi, "export async function countOpenMaintenanceWorkOrders");
  if (!countOpen) errs.push(`${KPI}: countOpenMaintenanceWorkOrders not found`);
  else if (!/openWorkOrderPredicate\s*\(/.test(countOpen)) errs.push(`${KPI}: countOpenMaintenanceWorkOrders must use openWorkOrderPredicate()`);

  const bucketFn = extractFn(bucket, "export async function listWorkOrdersByBucket");
  if (!bucketFn) errs.push(`${BUCKET}: listWorkOrdersByBucket not found`);
  else {
    if (!/openWorkOrderPredicate\s*\(\s*["']w["']\s*\)/.test(bucketFn)) {
      errs.push(`${BUCKET}: listWorkOrdersByBucket must use openWorkOrderPredicate("w")`);
    }
    if (/status\s+NOT\s+IN\s*\(\s*['"]complete['"]/.test(bucketFn)) {
      errs.push(`${BUCKET}: listWorkOrdersByBucket still uses ad-hoc NOT IN (complete,cancelled) — use openWorkOrderPredicate`);
    }
  }

  const listHandler = list.slice(list.indexOf('app.get("/api/v1/maintenance/work-orders"'));
  if (!listHandler) errs.push(`${LIST}: GET /maintenance/work-orders handler not found`);
  else {
    if (!/openWorkOrderPredicate\s*\(\s*["']w["']\s*\)/.test(listHandler)) {
      errs.push(`${LIST}: WO list route must apply openWorkOrderPredicate("w") for Active-WOs default scope`);
    }
    if (/ILIKE\s*'DEMO-%'|ILIKE\s*'TEST-%'/.test(listHandler)) {
      errs.push(`${LIST}: still uses display_id ILIKE demo/test hack — use void flag via openWorkOrderPredicate`);
    }
  }

  if (!/countOpenMaintenanceWorkOrders/.test(dash)) {
    errs.push(`${DASH}: open_wos KPI must come from countOpenMaintenanceWorkOrders`);
  }
  const dashBody = stripComments(dash);
  const adHocOpen = dashBody.match(/status\s+IN\s*\(\s*['"]open['"]\s*,\s*['"]in_progress['"]\s*,\s*['"]waiting_parts['"]\s*\)/g);
  if (adHocOpen?.length) {
    errs.push(`${DASH}: ${adHocOpen.length} ad-hoc open-status IN list(s) — use openWorkOrderPredicate()`);
  }
  if (/openWorkOrderPredicate/.test(dashBody) === false && /open_cost|tire_alerts|road_service/.test(dashBody)) {
    errs.push(`${DASH}: open-WO subsidiary queries must import and use openWorkOrderPredicate()`);
  }
  const openDollarsQuery = /SELECT[\s\S]{0,500}?AS open_dollars/.exec(dashBody)?.[0] ?? "";
  if (!/COALESCE\s*\(\s*w\.total_actual_cost\s*,\s*COALESCE\s*\(\s*w\.estimated_cost_cents\s*,\s*0\s*\)::numeric\s*\/\s*100\.0\s*\)/.test(openDollarsQuery)) {
    errs.push(`${DASH}: open_dollars must use actual cost when present, otherwise estimated_cost_cents converted to dollars`);
  }

  return errs;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function selftest() {
  const goodKpi =
    `export const OPEN_MAINTENANCE_WO_STATUSES = ["open","in_progress","waiting_parts"];\n` +
    `export function openWorkOrderPredicate(alias = "") { const a = alias?alias+".":""; return \`\${a}status IN (\${statusList(OPEN_MAINTENANCE_WO_STATUSES)}) AND \${a}voided_at IS NULL\`; }\n` +
    `export async function countOpenMaintenanceWorkOrders(c){ return c.query(\`... AND \${openWorkOrderPredicate()}\`); }\n`;
  const goodBucket =
    `import { openWorkOrderPredicate } from "../kpi/canonical-kpis.js";\n` +
    `export async function listWorkOrdersByBucket(c,id){ return c.query(\`WHERE \${openWorkOrderPredicate("w")}\`); }\n`;
  const goodList =
    `app.get("/api/v1/maintenance/work-orders", async () => { where.push(openWorkOrderPredicate("w")); });\n`;
  const goodDash =
    `import { countOpenMaintenanceWorkOrders, openWorkOrderPredicate } from "../kpi/canonical-kpis.js";\n` +
    `const openWoCount = await countOpenMaintenanceWorkOrders(client, companyId);\n` +
    `SELECT SUM(COALESCE(w.total_actual_cost, COALESCE(w.estimated_cost_cents, 0)::numeric / 100.0)) AS open_dollars AND \${openWorkOrderPredicate()}\n`;
  const cases = [
    { n: "well-formed → 0", in: { kpi: goodKpi, bucket: goodBucket, list: goodList, dash: goodDash }, want: 0 },
    {
      n: "bucket NOT IN hack",
      in: { kpi: goodKpi, bucket: goodBucket.replace('openWorkOrderPredicate("w")', "w.status NOT IN ('complete', 'cancelled')"), list: goodList, dash: goodDash },
      min: 1,
    },
    {
      n: "list missing predicate",
      in: { kpi: goodKpi, bucket: goodBucket, list: 'app.get("/api/v1/maintenance/work-orders", async () => { where.push("w.voided_at IS NULL"); });', dash: goodDash },
      min: 1,
    },
    {
      n: "dash ad-hoc status IN",
      in: { kpi: goodKpi, bucket: goodBucket, list: goodList, dash: goodDash.replace("${openWorkOrderPredicate()}", "status IN ('open', 'in_progress', 'waiting_parts')") },
      min: 1,
    },
    {
      n: "open dollars ignores estimates",
      in: { kpi: goodKpi, bucket: goodBucket, list: goodList, dash: goodDash.replace("COALESCE(w.total_actual_cost, COALESCE(w.estimated_cost_cents, 0)::numeric / 100.0)", "COALESCE(w.total_actual_cost, 0)") },
      min: 1,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const kpi = read(KPI);
const bucket = read(BUCKET);
const list = read(LIST);
const dash = read(DASH);
if (kpi == null || bucket == null || list == null || dash == null) {
  console.error(`[${LABEL}] FAILED — missing source file`);
  process.exit(1);
}
const errs = assertGuard({ kpi, bucket, list, dash });
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — KPI + list + bucket share openWorkOrderPredicate; open_wos count matches Active WOs table.`);
