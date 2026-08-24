#!/usr/bin/env node
/**
 * verify-docs-home-kpi-clicks.mjs
 *
 * Audit gap #13 — Docs Home KPI cards "Missing Required" / "Recent Uploads" must not be dead clicks.
 *
 * ROOT CAUSE (fixed): DocsHomePage wired Total Docs + Expiring 30 Days to local filter state, but left
 * Missing Required / Recent Uploads without onClick because GET /api/v1/docs had no matching filters.
 * Client-side filtering of one paginated page cannot match company-wide KPI counts — list query params
 * are required, and their SQL predicates must stay lockstep with /api/v1/docs/kpis COUNT FILTER clauses.
 *
 * This guard asserts:
 *   1. docs.routes.ts list schema accepts missing_required + recent_uploads
 *   2. List WHERE clauses match the KPI predicates (category/upload_completed; 7-day created_at)
 *   3. Frontend listDocsFoundation forwards both flags
 *   4. DocsHomePage KpiCards for Missing Required + Recent Uploads have onClick=
 *
 * DOCS-F-KPI-FILTER-RESET-STUCK (this pass) — a KPI click sets a SEPARATE `kpiFilter` state
 * (missing_required | recent_uploads), counted in the Filters panel's "N active" badge alongside
 * typeFilter/expiresBefore. The panel's own Reset button was wired only to `staged.reset` (the
 * useStagedListFilters draft for typeFilter/expiresBefore) — clicking Reset with a KPI filter active
 * produced zero network requests and left the "1 active filter" badge + the KPI description line
 * ("Missing required (no category or incomplete upload)" / "Recent uploads (last 7 days)") on screen
 * with no indication anything failed. The only working clear path was the unrelated "Total Docs" KPI
 * card (clearListFilters). Guard: the CollapsedListFilters onReset handler must also clear kpiFilter.
 *
 * Usage:
 *   node scripts/verify-docs-home-kpi-clicks.mjs
 *   node scripts/verify-docs-home-kpi-clicks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-home-kpi-clicks";

const ROUTES = "apps/backend/src/docs/docs.routes.ts";
const API = "apps/frontend/src/api/docs.ts";
const PAGE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * @param {{ routes: string, api: string, page: string }} args
 * @returns {string[]}
 */
export function assertGuard({ routes, api, page }) {
  const errors = [];
  const r = stripComments(routes);
  const a = stripComments(api);
  const p = stripComments(page);

  if (!/missing_required:\s*z\.enum\(\[\s*"true"\s*,\s*"false"\s*\]\)/.test(r)) {
    errors.push(`${ROUTES}: listQuerySchema missing missing_required enum(["true","false"])`);
  }
  if (!/recent_uploads:\s*z\.enum\(\[\s*"true"\s*,\s*"false"\s*\]\)/.test(r)) {
    errors.push(`${ROUTES}: listQuerySchema missing recent_uploads enum(["true","false"])`);
  }

  // List predicates must stay lockstep with KPI COUNT FILTER clauses in the same file.
  if (!/\(f\.category_id IS NULL OR f\.upload_completed_at IS NULL\)/.test(r)) {
    errors.push(`${ROUTES}: list WHERE missing lockstep predicate (category_id IS NULL OR upload_completed_at IS NULL)`);
  }
  if (!/f\.created_at >= \(NOW\(\) - INTERVAL '7 days'\)/.test(r)) {
    errors.push(`${ROUTES}: list WHERE missing lockstep recent_uploads predicate (created_at >= NOW() - 7 days)`);
  }
  if (!/category_id IS NULL OR upload_completed_at IS NULL/.test(r)) {
    errors.push(`${ROUTES}: KPI missing_required COUNT FILTER predicate drifted`);
  }
  if (!/created_at >= \(NOW\(\) - INTERVAL '7 days'\)/.test(r)) {
    errors.push(`${ROUTES}: KPI recent_uploads COUNT FILTER predicate drifted`);
  }

  if (!/missing_required:\s*boolean/.test(a)) {
    errors.push(`${API}: listDocsFoundation filters type missing missing_required: boolean`);
  }
  if (!/recent_uploads:\s*boolean/.test(a)) {
    errors.push(`${API}: listDocsFoundation filters type missing recent_uploads: boolean`);
  }
  if (!/query\.set\(\s*"missing_required"\s*,\s*"true"\s*\)/.test(a)) {
    errors.push(`${API}: listDocsFoundation must set missing_required=true query param`);
  }
  if (!/query\.set\(\s*"recent_uploads"\s*,\s*"true"\s*\)/.test(a)) {
    errors.push(`${API}: listDocsFoundation must set recent_uploads=true query param`);
  }

  // Brace-aware extract of <KpiCard ...> opening tags (local DocsHomePage KpiCard).
  const tags = [];
  const re = /<KpiCard\b/g;
  let m;
  while ((m = re.exec(p))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let inString = null;
    for (; i < p.length; i += 1) {
      const ch = p[i];
      if (inString) {
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        continue;
      }
      if (ch === ">" && depth === 0) {
        i += 1;
        break;
      }
    }
    tags.push(p.slice(m.index, i));
  }

  const byLabel = (label) => tags.find((t) => t.includes(`label="${label}"`) || t.includes(`label={'${label}'}`));
  for (const label of ["Missing Required", "Recent Uploads"]) {
    const tag = byLabel(label);
    if (!tag) {
      errors.push(`${PAGE}: <KpiCard label="${label}"> not found (never delete KPI cards)`);
      continue;
    }
    if (!/\bonClick=/.test(tag)) {
      errors.push(`${PAGE}: <KpiCard label="${label}"> is a dead click (missing onClick=)`);
    }
  }

  // DOCS-F-KPI-FILTER-RESET-STUCK: the Filters panel's Reset button (onReset=) must clear kpiFilter,
  // not just the staged typeFilter/expiresBefore draft — otherwise it's counted in "N active filters"
  // but Reset silently leaves it applied.
  const onResetMatch = /onReset=\{([\s\S]*?)\}\s*\n?\s*onCancel=/.exec(p);
  if (!onResetMatch) {
    errors.push(`${PAGE}: CollapsedListFilters onReset= prop not found`);
  } else if (!/setKpiFilter\(\s*"none"\s*\)/.test(onResetMatch[1])) {
    errors.push(
      `${PAGE}: onReset must also call setKpiFilter("none") — a KPI-driven filter (missing_required/recent_uploads) counts toward "N active filters" but Reset does not clear it`,
    );
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const goodRoutes = `
    missing_required: z.enum(["true", "false"]).optional(),
    recent_uploads: z.enum(["true", "false"]).optional(),
    COUNT(*) FILTER (WHERE category_id IS NULL OR upload_completed_at IS NULL)::int AS missing_required,
    COUNT(*) FILTER (WHERE created_at >= (NOW() - INTERVAL '7 days'))::int AS recent_uploads
    whereClauses.push(\`(f.category_id IS NULL OR f.upload_completed_at IS NULL)\`);
    whereClauses.push(\`f.created_at >= (NOW() - INTERVAL '7 days')\`);
  `;
  const goodApi = `
    missing_required: boolean;
    recent_uploads: boolean;
    if (filters.missing_required === true) query.set("missing_required", "true");
    if (filters.recent_uploads === true) query.set("recent_uploads", "true");
  `;
  const goodPage = `
    <KpiCard label="Missing Required" value="1" onClick={() => setKpiFilter("missing_required")} />
    <KpiCard label="Recent Uploads" value="2" onClick={() => setKpiFilter("recent_uploads")} />
    <CollapsedListFilters
      onApply={staged.apply}
      onReset={() => { staged.reset(); setKpiFilter("none"); }}
      onCancel={staged.cancel}
    >
  `;
  const deadPage = `
    <KpiCard label="Missing Required" value="1" />
    <KpiCard label="Recent Uploads" value="2" />
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
  `;

  const pass = assertGuard({ routes: goodRoutes, api: goodApi, page: goodPage });
  if (pass.length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture produced errors:`, pass);
    process.exit(1);
  }
  const fail = assertGuard({ routes: goodRoutes, api: goodApi, page: deadPage });
  if (!fail.some((e) => e.includes("dead click"))) {
    console.error(`[${LABEL}] --selftest FAIL: dead-click fixture did not fail`, fail);
    process.exit(1);
  }
  if (!fail.some((e) => e.includes("setKpiFilter"))) {
    console.error(`[${LABEL}] --selftest FAIL: stuck-reset fixture did not fail`, fail);
    process.exit(1);
  }
  const stuckResetOnly = `
    <KpiCard label="Missing Required" value="1" onClick={() => setKpiFilter("missing_required")} />
    <KpiCard label="Recent Uploads" value="2" onClick={() => setKpiFilter("recent_uploads")} />
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
  `;
  const stuckReset = assertGuard({ routes: goodRoutes, api: goodApi, page: stuckResetOnly });
  if (!stuckReset.some((e) => e.includes("setKpiFilter"))) {
    console.error(`[${LABEL}] --selftest FAIL: stuck-reset-only fixture did not isolate the reset defect`, stuckReset);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = assertGuard({
    routes: read(ROUTES),
    api: read(API),
    page: read(PAGE),
  });
  if (errors.length) {
    console.error(`[${LABEL}] FAILED:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Docs Home Missing Required / Recent Uploads KPIs are clickable; list filters lockstep with KPI SQL`);
}

main();
