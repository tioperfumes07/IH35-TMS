#!/usr/bin/env node
/**
 * LV-SYSTEM-AUDIT-LOAD-LINK-DEAD-END — GET /dispatch/loads/:id must LEFT JOIN customers
 * (and flag colors), not INNER JOIN.
 *
 * Live defect (2026-08-17): L-20260816-0168 customer CC2-BOOKLOAD-INLINE-TEST had
 * deactivated_at set. customers_select RLS hides deactivated rows, so INNER JOIN customers
 * returned 0 rows → dispatch_load_not_found while GET /mdata/loads/:id still 200'd. Audit trail
 * → /dispatch/loads/:id opened a drawer with "Couldn't load this load's overview."
 *
 *   node scripts/verify-dispatch-load-detail-deactivated-customer-left-join.mjs [--selftest]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-dispatch-load-detail-deactivated-customer-left-join";
const TARGET = "apps/backend/src/dispatch/loads.routes.ts";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

/** Slice the GET /api/v1/dispatch/loads/:id handler body (through the first null-detail return). */
function detailGetSlice(src) {
  const start = src.indexOf('app.get("/api/v1/dispatch/loads/:id"');
  if (start < 0) return "";
  const endMarker = "if (!detail) return reply.code(404).send({ error: \"dispatch_load_not_found\" });";
  const end = src.indexOf(endMarker, start);
  if (end < 0) return src.slice(start, start + 12000);
  return src.slice(start, end);
}

function check(src, drawerSrc) {
  const problems = [];
  const detail = detailGetSlice(src);
  if (!detail) {
    problems.push(`${TARGET}: missing GET /api/v1/dispatch/loads/:id handler`);
    return problems;
  }

  // Detail GET must LEFT JOIN customers (INNER JOIN is the planted defect).
  if (!/LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(detail)) {
    problems.push(
      `${TARGET}: GET /dispatch/loads/:id must LEFT JOIN mdata.customers — INNER JOIN 404s when the customer is deactivated (RLS)`,
    );
  }
  if (/\n\s*JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(detail)) {
    problems.push(
      `${TARGET}: GET /dispatch/loads/:id still has INNER JOIN mdata.customers — deactivated customers become dispatch_load_not_found`,
    );
  }

  // Flag colors: same class — missing/invisible flag must not drop the load.
  if (!/LEFT JOIN catalogs\.dispatch_flag_colors df ON df\.id = ml\.dispatch_flag_color_id/.test(detail)) {
    problems.push(
      `${TARGET}: GET /dispatch/loads/:id must LEFT JOIN catalogs.dispatch_flag_colors (INNER JOIN drops the load)`,
    );
  }
  if (/\n\s*JOIN catalogs\.dispatch_flag_colors df ON df\.id = ml\.dispatch_flag_color_id/.test(detail)) {
    problems.push(`${TARGET}: GET /dispatch/loads/:id still INNER JOINs dispatch_flag_colors`);
  }

  // Drawer: when dispatch fails, fall back to mdata so the path-param drawer still shows the load.
  if (!/dispatchFailed/.test(drawerSrc) || !/useLoad\(operatingCompanyId \? \(dispatchFailed \? loadId : null\) : loadId\)/.test(drawerSrc)) {
    problems.push(
      `${DRAWER}: must fall back to useLoad/mdata when dispatch GET errors (dispatchFailed gate)`,
    );
  }

  return problems;
}

function main() {
  const src = readFileSync(path.join(ROOT, TARGET), "utf8");
  const drawerSrc = readFileSync(path.join(ROOT, DRAWER), "utf8");

  if (SELFTEST) {
    const dir = mkdtempSync(path.join(tmpdir(), "load-detail-lj-"));
    try {
      const planted = src
        .replace(
          /LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/g,
          "JOIN mdata.customers c ON c.id = l.customer_id",
        )
        .replace(
          /LEFT JOIN catalogs\.dispatch_flag_colors df ON df\.id = ml\.dispatch_flag_color_id/g,
          "JOIN catalogs.dispatch_flag_colors df ON df.id = ml.dispatch_flag_color_id",
        );
      const plantedPath = path.join(dir, "loads.routes.ts");
      writeFileSync(plantedPath, planted);
      const plantedProblems = check(planted, drawerSrc);
      if (plantedProblems.length === 0) {
        console.error(`${LABEL} --selftest FAIL: planted INNER JOIN customers did not trip the guard`);
        process.exit(1);
      }
      const good = check(src, drawerSrc);
      if (good.length) {
        console.error(`${LABEL} --selftest FAIL: real source already red:\n${good.join("\n")}`);
        process.exit(1);
      }
      console.log(`${LABEL} --selftest OK — planted INNER JOIN fails; fixed source passes`);
      return;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const problems = check(src, drawerSrc);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — GET /dispatch/loads/:id LEFT JOINs customers + flag colors; drawer falls back to mdata on dispatch error`,
  );
}

main();
