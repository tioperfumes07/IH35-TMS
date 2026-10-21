#!/usr/bin/env node
/**
 * verify-load-report-and-picker-scope — LEAD 443.206 D8 / D9 / D10 (CC-3, 2026-10-21; owner: "check all loadboards,
 * they are not in sync").
 *   RULE 1 (D9)  — GET /reports/loads shows real loads that happened: its WHERE carries LOADS_REPORT_SCOPE_SQL (no
 *                  draft, cancelled, voided status, voided_at, soft-deleted or sample row) and the response states the
 *                  scope (scope + scope_label). Before: only cancelled was excluded.
 *   RULE 2 (D8)  — the report date is the scheduled stop date the boards read (COALESCE(scheduled_arrival_at,
 *                  appointment_start_at), company business date); never created_at / updated_at; default date_field =
 *                  pickup. Before: default "created" (l.created_at) and created_at / updated_at fallbacks.
 *   RULE 3 (D10) — the cross-module load picker (EntityPicker kind "load": Settlement Creator lines, claims, expenses)
 *                  reads board_scope=picker = every real load that happened, dispatched / in transit included, never
 *                  draft / cancelled / voided / sample / deleted. Before: board_scope=history hid every rolling load.
 * LIVE (read-only, with DATABASE_URL, USMCA): the picker scope contains every dispatch-work load and no draft /
 *   cancelled / voided / sample row; the report scope returns no such row.
 * --selftest plants each regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-load-report-and-picker-scope";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const F = {
  service: "apps/backend/src/reports/loads-report.service.ts",
  routes: "apps/backend/src/reports/loads-report.routes.ts",
  pickerScope: "apps/backend/src/mdata/load-picker-scope.ts",
  loadsRoutes: "apps/backend/src/mdata/loads.routes.ts",
  registry: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const between = (s, a, b) => {
  const i = s.indexOf(a);
  if (i < 0) return "";
  const j = b ? s.indexOf(b, i + a.length) : -1;
  return s.slice(i, j < 0 ? undefined : j);
};

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const f = [];
  // RULE 1
  const scope = between(s.service, "export const LOADS_REPORT_SCOPE_SQL", "] as const;");
  for (const needle of ["l.soft_deleted_at IS NULL", "l.voided_at IS NULL", "l.is_sample_data IS NOT TRUE", "'draft'", "'cancelled'", "'voided'"])
    if (!scope.includes(needle)) f.push(`RULE 1 ${F.service}: LOADS_REPORT_SCOPE_SQL is missing ${needle}`);
  const getter = between(s.service, "export async function getLoadsReport(", "const res = await client.query(");
  if (!/\.\.\.LOADS_REPORT_SCOPE_SQL/.test(getter)) f.push(`RULE 1 ${F.service}: the report WHERE does not apply LOADS_REPORT_SCOPE_SQL`);
  if (/status IS DISTINCT FROM 'cancelled'/.test(getter)) f.push(`RULE 1 ${F.service}: the report is back to excluding only cancelled`);
  if (!/scope: LOADS_REPORT_SCOPE,/.test(s.service) || !/scope_label: LOADS_REPORT_SCOPE_LABEL,/.test(s.service))
    f.push(`RULE 1 ${F.service}: the response must state its scope (scope + scope_label)`);
  // RULE 2
  const dateFns = between(s.service, "export function scheduledStopDateSql(", "export async function getLoadsReport(");
  if (!/COALESCE\(ls\.scheduled_arrival_at, ls\.appointment_start_at\) AT TIME ZONE/.test(dateFns))
    f.push(`RULE 2 ${F.service}: the report date must be the scheduled stop date (COALESCE(scheduled_arrival_at, appointment_start_at)) as a company date`);
  if (/created_at|updated_at/.test(dateFns)) f.push(`RULE 2 ${F.service}: the report date reads created_at / updated_at`);
  const ctes = between(s.service, "WITH pickup AS (", "invoice_info AS (");
  if (/created_at|updated_at|actual_arrival_at|actual_departure_at/.test(ctes))
    f.push(`RULE 2 ${F.service}: the rows' pickup / delivery dates must be the same scheduled field the filter uses`);
  if (!/date_field: z\.enum\(\["created", "pickup", "delivery"\]\)\.default\("pickup"\)/.test(s.routes))
    f.push(`RULE 2 ${F.routes}: the default report date must be the scheduled pickup date`);
  // RULE 3
  const picker = between(s.pickerScope, "export function loadPickerScopeSql(", null);
  for (const needle of ["canonicalHappenedNotVoidedLoadClause(alias)", "status::text <> 'draft'", ".voided_at IS NULL", ".is_sample_data IS NOT TRUE", ".soft_deleted_at IS NULL"])
    if (!picker.includes(needle)) f.push(`RULE 3 ${F.pickerScope}: the picker scope is missing ${needle}`);
  if (!/board_scope: z\.enum\(\["live", "history", "picker"\]\)/.test(s.loadsRoutes) || !/board_scope === "picker"\) \{\s*filters\.push\(loadPickerScopeSql\("l"\)\)/.test(s.loadsRoutes))
    f.push(`RULE 3 ${F.loadsRoutes}: GET /mdata/loads must serve board_scope=picker through loadPickerScopeSql`);
  const loadPicker = between(s.registry, "  load: {", "  vendor: {");
  if (!/board_scope: "picker"/.test(loadPicker)) f.push(`RULE 3 ${F.registry}: the load picker must read board_scope "picker" (dispatched loads included)`);
  return f;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

async function main() {
if (process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const plants = [
    ["shipped tree passes", null],
    ["report excludes only cancelled", { service: base.service.replace("...LOADS_REPORT_SCOPE_SQL,", "`l.status IS DISTINCT FROM 'cancelled'`,") }],
    ["report scope drops sample", { service: base.service.replace("`l.is_sample_data IS NOT TRUE`,", "") }],
    ["report scope drops voided_at", { service: base.service.replace("`l.voided_at IS NULL`,", "") }],
    ["response without scope label", { service: base.service.replace("scope_label: LOADS_REPORT_SCOPE_LABEL,", "") }],
    ["report date falls back to created_at", { service: base.service.replace("ORDER BY ls.sequence_number ${order}", "ORDER BY ls.created_at ${order}") }],
    ["row pickup date back to actual", { service: base.service.replace("(COALESCE(ls.scheduled_arrival_at, ls.appointment_start_at) AT TIME ZONE '${COMPANY_TIME_ZONE}')::date AS pickup_date", "(COALESCE(ls.actual_arrival_at, ls.appointment_start_at))::date AS pickup_date") }],
    ["default date back to created", { routes: base.routes.replace('.default("pickup")', '.default("created")') }],
    ["picker scope allows sample", { pickerScope: base.pickerScope.replace("AND ${alias}.is_sample_data IS NOT TRUE", "") }],
    ["picker scope allows draft", { pickerScope: base.pickerScope.replace("AND ${alias}.status::text <> 'draft'", "") }],
    ["load picker back to history", { registry: base.registry.replace('board_scope: "picker"', 'board_scope: "history"') }],
    ["route stops serving picker", { loadsRoutes: base.loadsRoutes.replace('filters.push(loadPickerScopeSql("l"))', "filters.push('true')") }],
  ];
  let bad = 0;
  for (const [name, plant] of plants) {
    if (plant) {
      const k = Object.keys(plant)[0];
      if (plant[k] === base[k]) { console.log(`  ✗ ${name} (plant did not apply)`); bad++; continue; }
    }
    const ok = plant ? check(plant).length > 0 : check().length === 0;
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) bad++;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${plants.length}/${plants.length})`);
  process.exit(bad ? 1 : 0);
}

const fails = check();
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
const { register } = await import("tsx/esm/api");
register();
const { LOADS_REPORT_SCOPE_SQL } = await import("../apps/backend/src/reports/loads-report.service.ts");
const { loadPickerScopeSql } = await import("../apps/backend/src/mdata/load-picker-scope.ts");
const { canonicalDispatchWorkStatusClause } = await import("../apps/backend/src/dispatch/canonical-active-load-set.ts");
// LEAD 22:25Z #6 — fail closed without a live DB (verify-no-silent-db-skip): the live half is the proof, never skipped.
const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
const NONREAL = `(l.status::text IN ('draft','cancelled','voided') OR l.voided_at IS NOT NULL OR l.is_sample_data OR l.soft_deleted_at IS NOT NULL)`;
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = (await c.query(
    `SELECT
       (SELECT count(*)::int FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND ${LOADS_REPORT_SCOPE_SQL.join(" AND ")} AND ${NONREAL}) AS report_nonreal,
       (SELECT count(*)::int FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND ${loadPickerScopeSql("l")} AND ${NONREAL}) AS picker_nonreal,
       (SELECT count(*)::int FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL
           AND l.is_sample_data IS NOT TRUE AND ${canonicalDispatchWorkStatusClause("l")} AND NOT (${loadPickerScopeSql("l")})) AS live_missing_from_picker,
       (SELECT count(*)::int FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND ${loadPickerScopeSql("l")}) AS picker_total`,
    [USMCA])).rows[0];
  await c.query("ROLLBACK");
  const bad = [];
  if (r.report_nonreal) bad.push(`report scope returns ${r.report_nonreal} draft/cancelled/voided/sample row(s)`);
  if (r.picker_nonreal) bad.push(`picker scope returns ${r.picker_nonreal} draft/cancelled/voided/sample row(s)`);
  if (r.live_missing_from_picker) bad.push(`${r.live_missing_from_picker} live dispatch-work load(s) are not pickable`);
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — report non-real 0, picker non-real 0, live loads missing from picker 0 (picker ${r.picker_total} loads)`);
  process.exit(0);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  c.release();
  await pool.end().catch(() => {});
}
}
