#!/usr/bin/env node
/**
 * verify-rm-bucket-work-orders-unit-driver-join.mjs (RM-BUCKET-UNIT-DRIVER-NOT-VISIBLE)
 *
 * Root cause: `apps/backend/src/maintenance/work-orders.service.ts`'s `listWorkOrdersByBucket()`
 * — feeding `GET /api/v1/maintenance/dashboard/rm-status` and
 * `GET /api/v1/maintenance/work-orders/by-bucket`, consumed by `RMBucketsGrid.tsx` (the R&M Status
 * Board's primary Kanban view) — selected `w.*` from `maintenance.work_orders` with only a LEFT
 * JOIN to `mdata.vendors` (for the roadside provider name). `maintenance.work_orders` itself has
 * no `unit_number`/`driver_name` columns, only `unit_id`/`driver_id` FKs, so the frontend's
 * `entityLabel(row.unit_number, row.unit_id, "Unit")` / `entityLabel(row.driver_name,
 * row.driver_id, "Driver")` calls ALWAYS fell to the "not visible" tombstone — live-reproduced on
 * every one of 8 real USMCA work orders, even though the same unit/driver resolve correctly
 * elsewhere (WorkOrderDetailPage's own query, the severe-alerts dashboard query which already
 * joins `mdata.units` correctly).
 *
 * Fix: add entity-scoped LEFT JOINs to `mdata.units` and `mdata.drivers`, selecting
 * `u.unit_number` and `TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name` — same join
 * predicate shape already used by the sibling severe-alerts query
 * (`apps/backend/src/maintenance/dashboard.routes.ts`).
 *
 * Usage:
 *   node scripts/verify-rm-bucket-work-orders-unit-driver-join.mjs            # scan
 *   node scripts/verify-rm-bucket-work-orders-unit-driver-join.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/backend/src/maintenance/work-orders.service.ts";

const UNIT_JOIN_RE =
  /LEFT JOIN mdata\.units u ON u\.id = w\.unit_id\s*\n\s*AND COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = w\.operating_company_id/;
const DRIVER_JOIN_RE = /LEFT JOIN mdata\.drivers d ON d\.id = w\.driver_id AND d\.operating_company_id = w\.operating_company_id/;
const UNIT_NUMBER_SELECT_RE = /u\.unit_number/;
const DRIVER_NAME_SELECT_RE = /TRIM\(CONCAT\(d\.first_name, ' ', d\.last_name\)\) AS driver_name/;

export function checkRmBucketJoin(src) {
  const offenders = [];
  if (!/function listWorkOrdersByBucket/.test(src)) {
    offenders.push(`${FILE}: listWorkOrdersByBucket() not found — regression file rewritten unexpectedly.`);
    return offenders;
  }
  if (!UNIT_NUMBER_SELECT_RE.test(src)) {
    offenders.push(`${FILE}: listWorkOrdersByBucket() query no longer selects u.unit_number — every R&M Status Board card will show "Unit — not visible" again.`);
  }
  if (!DRIVER_NAME_SELECT_RE.test(src)) {
    offenders.push(`${FILE}: listWorkOrdersByBucket() query no longer selects a real driver_name — every R&M Status Board card with a driver will show "Driver — not visible" again.`);
  }
  if (!UNIT_JOIN_RE.test(src)) {
    offenders.push(`${FILE}: listWorkOrdersByBucket() no longer joins mdata.units with the entity-scoped predicate — cross-entity leak risk or missing unit_number again.`);
  }
  if (!DRIVER_JOIN_RE.test(src)) {
    offenders.push(`${FILE}: listWorkOrdersByBucket() no longer joins mdata.drivers with the entity-scoped predicate — cross-entity leak risk or missing driver_name again.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkRmBucketJoin(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    export async function listWorkOrdersByBucket(client, operatingCompanyId) {
      const result = await client.query(
        \`
          SELECT
            w.*,
            v.vendor_name AS roadside_provider_name
          FROM maintenance.work_orders w
          LEFT JOIN mdata.vendors v ON v.id = w.roadside_provider_vendor_id AND v.operating_company_id = w.operating_company_id
          WHERE w.operating_company_id = $1::uuid
          ORDER BY w.opened_at DESC NULLS LAST, w.created_at DESC
          LIMIT 80
        \`,
        [operatingCompanyId]
      );
    }
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkRmBucketJoin(buggy);
  const fixedOffenders = checkRmBucketJoin(fixed);

  if (buggyOffenders.length >= 4 && fixedOffenders.length === 0) {
    console.log("verify-rm-bucket-work-orders-unit-driver-join selftest OK");
    process.exit(0);
  }
  console.error("verify-rm-bucket-work-orders-unit-driver-join selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-rm-bucket-work-orders-unit-driver-join FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-rm-bucket-work-orders-unit-driver-join OK — listWorkOrdersByBucket() joins mdata.units/mdata.drivers so R&M Status Board cards never show a false not-visible tombstone",
  );
}
