#!/usr/bin/env node
/**
 * verify-severe-alerts-total-cost-unbounded.mjs (MAINT-MONEY-F6943)
 *
 * apps/backend/src/maintenance/dashboard.routes.ts's /severe-alerts endpoint caps its ALERT LIST at
 * LIMIT 50 (a correct, disclosed display cap -- total_count already exposes the real population
 * size). But apps/frontend/src/pages/maintenance/components/SevereAlertsBand.tsx computed its
 * dollar "Visible total" by summing only the 50 RETURNED rows -- once total_count exceeded 50, that
 * sum silently EXCLUDED real severe/waiting-parts cost exposure the truncation banner admitted
 * existed, presenting a partial page's total as if it were the whole picture.
 *
 * The fix adds a second, unbounded SUM(total_actual_cost) query on the backend (same WHERE
 * predicate as the list query, no LIMIT) and threads it through as total_estimated_cost_all, which
 * the frontend now shows as the true total whenever the list is truncated.
 *
 * This guard asserts, against the REAL files:
 *   1. dashboard.routes.ts's severe-alerts route has a SUM(w.total_actual_cost) query with NO LIMIT
 *      clause between its SELECT and its WHERE/JOIN, reusing the same filter predicate, and returns
 *      total_estimated_cost_all.
 *   2. SevereAlertsBand.tsx computes a `trueTotal` (or reads totalEstimatedCostAll) and renders it,
 *      not just the visible-rows sum, when the list is truncated.
 *
 * FAIL if either half regresses to a LIMIT-bounded total.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-severe-alerts-total-cost-unbounded";
const BACKEND_FILE = "apps/backend/src/maintenance/dashboard.routes.ts";
const FRONTEND_FILE = "apps/frontend/src/pages/maintenance/components/SevereAlertsBand.tsx";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `sources` to exercise this exact function against synthetic content;
 * omit it to check the real repo files.
 */
export function check(sources) {
  const failures = [];

  const backendSrc = sources ? sources.backend : (() => { try { return readReal(BACKEND_FILE); } catch { return null; } })();
  const frontendSrc = sources ? sources.frontend : (() => { try { return readReal(FRONTEND_FILE); } catch { return null; } })();
  if (backendSrc == null) return [`${BACKEND_FILE} not found`];
  if (frontendSrc == null) return [`${FRONTEND_FILE} not found`];

  // (1) Find the severe-alerts route handler, then the SUM query inside it.
  const routeStart = backendSrc.indexOf("/api/v1/maintenance/dashboard/severe-alerts");
  if (routeStart < 0) {
    failures.push(`${BACKEND_FILE}: severe-alerts route not found -- extractor may be stale`);
  } else {
    const routeBody = backendSrc.slice(routeStart, routeStart + 4000);
    const sumIdx = routeBody.indexOf("SUM(w.total_actual_cost)");
    if (sumIdx < 0) {
      failures.push(
        `${BACKEND_FILE}: severe-alerts route no longer computes SUM(w.total_actual_cost) -- ` +
          `total_estimated_cost_all would be missing or reintroduce a LIMIT-bounded total`
      );
    } else {
      // The SUM query's own text -- from its OWN opening backtick to its OWN closing backtick, not
      // a fixed character window (which can reach backward into the earlier LIMIT-50 list query and
      // false-positive on a query that never regressed) -- must not contain a LIMIT clause.
      const queryStart = routeBody.lastIndexOf("`", sumIdx);
      const queryEnd = routeBody.indexOf("`", sumIdx);
      const sumQueryText = routeBody.slice(queryStart >= 0 ? queryStart : Math.max(0, sumIdx - 200), queryEnd);
      if (/\bLIMIT\s+\d+/i.test(sumQueryText)) {
        failures.push(
          `${BACKEND_FILE}: the SUM(w.total_actual_cost) query carries a LIMIT clause -- the whole ` +
            `point of this query is to be unbounded by the list's own LIMIT 50`
        );
      }
    }
    if (!/total_estimated_cost_all/.test(routeBody)) {
      failures.push(`${BACKEND_FILE}: severe-alerts route does not return total_estimated_cost_all`);
    }
  }

  // (2) SevereAlertsBand.tsx must read totalEstimatedCostAll and use it (not just the visible sum)
  // for the rendered total when the list is truncated.
  if (!/totalEstimatedCostAll/.test(frontendSrc)) {
    failures.push(`${FRONTEND_FILE}: no longer accepts/reads totalEstimatedCostAll`);
  }
  const totalRenderIdx = frontendSrc.indexOf("severe-alerts-total-all");
  if (totalRenderIdx < 0) {
    failures.push(`${FRONTEND_FILE}: no longer renders a distinct "total exposure" element for the truncated case -- may have regressed to showing only the visible-rows sum`);
  } else {
    const around = frontendSrc.slice(Math.max(0, totalRenderIdx - 100), totalRenderIdx + 200);
    if (!/trueTotal/.test(around) && !/totalEstimatedCostAll/.test(around)) {
      failures.push(`${FRONTEND_FILE}: the truncated-case total element does not reference the full-population total`);
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodBackend = `
    app.get("/api/v1/maintenance/dashboard/severe-alerts", async (req, reply) => {
      const res = await client.query(\`SELECT w.id FROM maintenance.work_orders w WHERE w.operating_company_id = $1 LIMIT 50\`);
      const costRes = await client.query(\`
        SELECT COALESCE(SUM(w.total_actual_cost), 0)::numeric AS total_estimated_cost_all
        FROM maintenance.work_orders w
        WHERE w.operating_company_id = $1
      \`);
      return { alerts: res.rows, total_count: 1, total_estimated_cost_all: Number(costRes.rows[0].total_estimated_cost_all) };
    });
  `;
  const regressedBackendLimited = `
    app.get("/api/v1/maintenance/dashboard/severe-alerts", async (req, reply) => {
      const res = await client.query(\`SELECT w.id FROM maintenance.work_orders w WHERE w.operating_company_id = $1 LIMIT 50\`);
      const costRes = await client.query(\`
        SELECT COALESCE(SUM(w.total_actual_cost), 0)::numeric AS total_estimated_cost_all
        FROM maintenance.work_orders w
        WHERE w.operating_company_id = $1
        LIMIT 50
      \`);
      return { alerts: res.rows, total_count: 1, total_estimated_cost_all: Number(costRes.rows[0].total_estimated_cost_all) };
    });
  `;
  const regressedBackendMissingSum = `
    app.get("/api/v1/maintenance/dashboard/severe-alerts", async (req, reply) => {
      const res = await client.query(\`SELECT w.id FROM maintenance.work_orders w WHERE w.operating_company_id = $1 LIMIT 50\`);
      return { alerts: res.rows, total_count: 1 };
    });
  `;
  const goodFrontend = `
    export function SevereAlertsBand({ alerts, totalCount, totalEstimatedCostAll }) {
      const trueTotal = totalEstimatedCostAll ?? visibleTotal;
      return isTruncated ? (
        <div data-testid="severe-alerts-total-all">Total exposure: {trueTotal}</div>
      ) : null;
    }
  `;
  const regressedFrontendNoProp = `
    export function SevereAlertsBand({ alerts, totalCount }) {
      const total = alerts.reduce((sum, row) => sum + Number(row.total_estimated_cost ?? 0), 0);
      return <div>Visible total: {total}</div>;
    }
  `;

  const checks = [
    ["fully-fixed shape produces zero failures", check({ backend: goodBackend, frontend: goodFrontend }).length === 0],
    [
      "backend SUM query regressing to LIMIT-bounded is caught",
      check({ backend: regressedBackendLimited, frontend: goodFrontend }).some((f) => f.includes("carries a LIMIT clause")),
    ],
    [
      "backend dropping the SUM query entirely is caught",
      check({ backend: regressedBackendMissingSum, frontend: goodFrontend }).some((f) => f.includes("no longer computes SUM")),
    ],
    [
      "frontend regressing to visible-only total is caught",
      check({ backend: goodBackend, frontend: regressedFrontendNoProp }).some((f) => f.includes("no longer accepts/reads totalEstimatedCostAll")),
    ],
    ["real repo files currently satisfy this guard (no args = real files)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — severe-alerts total cost is computed unbounded by the list's own LIMIT 50, and the frontend renders it when truncated`);
}
