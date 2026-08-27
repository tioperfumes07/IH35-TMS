#!/usr/bin/env node
/**
 * MAINT-MONEY-F6797-WO-LINE-DELETE-DESTROYS-COST-HISTORY
 *
 * DELETE /api/v1/maintenance/work-orders/:id/line-items/:lid used to physically DELETE the row
 * before AP posting, with no void metadata to fall back to and no reader excluding a voided line
 * even if one existed. This guard locks the full fix:
 *   1. The route issues a company-scoped, active-row compare-and-set UPDATE (voided_at IS NULL),
 *      never a hard DELETE, against maintenance.work_order_lines.
 *   2. Every money-aggregating reader of that table excludes a voided line.
 */
import fs from "node:fs";

const ROUTE_REL = "apps/backend/src/maintenance/work-orders.routes.ts";
// `anchor` pins the search to the SPECIFIC statement this fix touched — several of these files
// reference "work_order_lines" more than once (INSERTs, EXISTS gates, etc. that were correctly
// left unchanged per the finding's own audit), so a bare first-occurrence search would land on
// the wrong one and either false-pass or false-fail.
const READERS = [
  { rel: "apps/backend/src/maintenance/wo-cost-validation.ts", label: "total_actual_cost / AP invoice-mismatch check", anchor: "SUM(total_cost::numeric)" },
  { rel: "apps/backend/src/accounting/maintenance-posting/poster.service.ts", label: "WO-close bill-line copy", anchor: "uuid::text AS wo_line_uuid" },
  { rel: "apps/backend/src/maintenance/two-section-service.ts", label: "bill/expense line copy", anchor: "total_cost AS amount" },
  { rel: "apps/backend/src/maint/wo-ap-posting.service.ts", label: "AP posting preview bill total", anchor: "total_cost::text AS amount" },
  { rel: "apps/backend/src/maintenance/severe-repair-estimate.service.ts", label: "$7,000 capitalize/expense threshold", anchor: "LEFT JOIN maintenance.work_order_lines wl" },
  { rel: "apps/backend/src/reports/maintenance-cost-per-unit.routes.ts", label: "cost-per-unit financial report", anchor: "line_totals AS" },
  { rel: "apps/backend/src/work-orders/work-orders.routes.ts", label: "printed WO PDF Cost Breakdown", anchor: "line_type, COALESCE(SUM" },
];

export function run(root = process.cwd()) {
  const failures = [];

  let routeSrc;
  try {
    routeSrc = fs.readFileSync(`${root}/${ROUTE_REL}`, "utf8");
  } catch {
    return [`${ROUTE_REL}: missing`];
  }

  const routeIdx = routeSrc.indexOf('app.delete("/api/v1/maintenance/work-orders/:id/line-items/:lid"');
  if (routeIdx < 0) {
    failures.push("DELETE .../line-items/:lid route not found");
    return failures;
  }
  const nextRouteIdx = routeSrc.indexOf("\n  app.", routeIdx + 1);
  const handler = routeSrc.slice(routeIdx, nextRouteIdx > 0 ? nextRouteIdx : undefined);

  if (/\bDELETE FROM maintenance\.work_order_lines\b/.test(handler)) {
    failures.push("handler must not hard-DELETE maintenance.work_order_lines — this is the exact pre-fix defect");
  }
  if (!/UPDATE maintenance\.work_order_lines/.test(handler)) {
    failures.push("handler must UPDATE maintenance.work_order_lines (soft-delete), not remove the row");
  }
  if (!/SET\s+voided_at\s*=\s*now\(\)/.test(handler)) {
    failures.push("the UPDATE must set voided_at = now()");
  }
  if (!/AND li\.voided_at IS NULL/.test(handler)) {
    failures.push("the UPDATE's WHERE must require li.voided_at IS NULL (active-row compare-and-set — a line can only be voided once)");
  }

  // Every money-aggregating reader must exclude a voided line. Scoped to the text WINDOW around
  // each actual "work_order_lines" (or its "wl"/"li" alias-declaring) reference — a bare file-wide
  // regex would false-pass on an unrelated voided_at IS NULL filter on a DIFFERENT table elsewhere
  // in the same file (confirmed: poster.service.ts and wo-cost-validation.ts both have one for
  // parts_invoice_links / a different append-only table).
  for (const reader of READERS) {
    let src;
    try {
      src = fs.readFileSync(`${root}/${reader.rel}`, "utf8");
    } catch {
      failures.push(`${reader.rel}: missing`);
      continue;
    }
    const refIdx = src.indexOf(reader.anchor);
    if (refIdx < 0) {
      failures.push(`${reader.rel} (${reader.label}): anchor "${reader.anchor}" not found — marker changed`);
      continue;
    }
    // Window is bounded by the SQL template literal's own closing backtick — not a fixed char
    // count, which either misses a filter buried under a long explanatory comment or (worse)
    // false-passes on an unrelated voided_at IS NULL filter that happens to sit further down in
    // the SAME file (confirmed: poster.service.ts has one for a different query within 2000 chars
    // of this anchor). Bounding to the actual statement is the only precise scope.
    const closeIdx = src.indexOf("`", refIdx);
    const window = closeIdx > refIdx ? src.slice(refIdx, closeIdx) : src.slice(refIdx, refIdx + 2000);
    if (!/voided_at IS NULL/.test(window)) {
      failures.push(`${reader.rel} (${reader.label}) does not exclude a voided work_order_lines row`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-wo-line-void-");
  const dirs = {
    maintenance: `${tmp}/apps/backend/src/maintenance`,
    posting: `${tmp}/apps/backend/src/accounting/maintenance-posting`,
    maint: `${tmp}/apps/backend/src/maint`,
    reports: `${tmp}/apps/backend/src/reports`,
    workOrders: `${tmp}/apps/backend/src/work-orders`,
  };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

  const fixedRoute = `
  app.delete("/api/v1/maintenance/work-orders/:id/line-items/:lid", async (req, reply) => {
    const res = await client.query(
      \`UPDATE maintenance.work_order_lines li SET voided_at = now(), void_reason = $4, voided_by_user_id = $5::uuid
       FROM maintenance.work_orders w WHERE li.uuid = $1 AND li.work_order_uuid = w.id AND w.id = $2
       AND w.operating_company_id = $3::uuid AND li.voided_at IS NULL RETURNING li.uuid\`,
      []
    );
  });
  app.get("/api/v1/maintenance/work-orders", async (req, reply) => {});
`;
  // Each reader body embeds its OWN real anchor string (from READERS above) near the
  // voided_at IS NULL filter, matching how the guard actually searches the real files.
  const readerBody = (anchor) => `SELECT SUM(total_cost) FROM maintenance.work_order_lines WHERE ${anchor} = $1 AND voided_at IS NULL`;

  fs.writeFileSync(`${dirs.maintenance}/work-orders.routes.ts`, fixedRoute);
  fs.writeFileSync(`${dirs.maintenance}/wo-cost-validation.ts`, readerBody("SUM(total_cost::numeric)"));
  fs.writeFileSync(`${dirs.posting}/poster.service.ts`, readerBody("uuid::text AS wo_line_uuid"));
  fs.writeFileSync(`${dirs.maintenance}/two-section-service.ts`, readerBody("total_cost AS amount"));
  fs.writeFileSync(`${dirs.maint}/wo-ap-posting.service.ts`, readerBody("total_cost::text AS amount"));
  fs.writeFileSync(`${dirs.maintenance}/severe-repair-estimate.service.ts`, readerBody("LEFT JOIN maintenance.work_order_lines wl"));
  fs.writeFileSync(`${dirs.reports}/maintenance-cost-per-unit.routes.ts`, readerBody("line_totals AS"));
  fs.writeFileSync(`${dirs.workOrders}/work-orders.routes.ts`, readerBody("line_type, COALESCE(SUM"));

  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: exact pre-fix pattern — reintroduce the hard DELETE.
  const brokenRoute = fixedRoute.replace(
    /UPDATE maintenance\.work_order_lines li SET voided_at = now\(\), void_reason = \$4, voided_by_user_id = \$5::uuid\s*\n\s*FROM maintenance\.work_orders w WHERE li\.uuid = \$1 AND li\.work_order_uuid = w\.id AND w\.id = \$2\s*\n\s*AND w\.operating_company_id = \$3::uuid AND li\.voided_at IS NULL RETURNING li\.uuid/,
    "DELETE FROM maintenance.work_order_lines li USING maintenance.work_orders w WHERE li.uuid = $1 AND li.work_order_uuid = w.id AND w.id = $2 AND w.operating_company_id = $3::uuid RETURNING li.uuid"
  );
  fs.writeFileSync(`${dirs.maintenance}/work-orders.routes.ts`, brokenRoute);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: reintroduced hard DELETE went undetected");
  fs.writeFileSync(`${dirs.maintenance}/work-orders.routes.ts`, fixedRoute); // restore for next mutation

  // Mutation 2: one reader forgets the voided_at exclusion.
  fs.writeFileSync(`${dirs.maint}/wo-ap-posting.service.ts`, "SELECT SUM(total_cost) FROM maintenance.work_order_lines WHERE total_cost::text AS amount = $1");
  const f2 = run(tmp);
  if (f2.length === 0) throw new Error("FAIL to catch: a reader missing voided_at exclusion went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-wo-line-void-not-delete SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-wo-line-void-not-delete FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-wo-line-void-not-delete OK — WO line removal is void-not-delete; every money-aggregating reader excludes voided lines");
