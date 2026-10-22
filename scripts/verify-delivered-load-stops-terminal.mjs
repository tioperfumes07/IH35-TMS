#!/usr/bin/env node
/**
 * verify-delivered-load-stops-terminal — Lead 443.51 #3 (owner: "Were all the documents created correctly?"), CC-2.
 *
 * A load at delivered or later has been driven: none of its live stops may still read 'pending'. The live engine writes the
 * stop status with its stamp (dispatch/stop-stamp.service.ts: arrival -> 'arrived', departure -> 'departed'); the Settlement
 * Creator stamped its historical stops (settlement-creator-deliver.ts stampStopsFromTracking) but never moved their status —
 * 309 of 309 Creator stops read 'pending' on invoiced loads (prod 2026-10-11).
 *
 * STATIC:
 *   RULE 1 — stampStopsFromTracking ends by calling settleStampedStopStatuses, and that function moves a stop with a departure
 *            stamp to 'departed' (and never one without a stamp).
 * LIVE (read-only, USMCA):
 *   RULE 2 — 0 non-cancelled, non-deleted stops with status 'pending' on a USMCA load whose status is delivered or later.
 * --selftest exercises both rules.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRES_LIVE_DB = "a pending stop on a delivered load is a row — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-delivered-load-stops-terminal";
const DELIVER = "apps/backend/src/driver-finance/settlement-creator-deliver.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
/** dispatch's delivered-and-later load statuses (settlement-creator-deliver.ts ALREADY_DELIVERED). */
export const DELIVERED_OR_LATER = ["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid", "closed"];

const OFFICE = "apps/backend/src/dispatch/stamp-final-delivery-departure.ts";
/** LEAD 443.230 (CC-3) — RULE 3: office delivery (transition / bulk / mdata PATCH share this stamp) also stamps the earlier
 *  stops from tracking; RULE 1b: the evidence engine never re-stamps a stop that already carries an (attested) departure. */
export function officeFailures(officeSrc, src) {
  const out = [];
  const fn = officeSrc.slice(officeSrc.indexOf("export async function stampFinalActiveDeliveryDeparture("));
  if (!/await stampStopsFromTracking\(client as never, loadId, operatingCompanyId, \{\}\);/.test(fn))
    out.push(`RULE 3 ${OFFICE}: office delivery no longer stamps the earlier stops from tracking (they stay 'pending')`);
  if (!/\(actual_arrival_at IS NOT NULL OR actual_departure_at IS NOT NULL\) AS stamped/.test(src) ||
      (src.match(/WHERE id = \$1::uuid AND actual_arrival_at IS NULL AND actual_departure_at IS NULL`/g) ?? []).length < 2)
    out.push(`RULE 1b ${DELIVER}: stampStopsFromTracking must leave a stop that already has a departure stamp untouched`);
  return out;
}

export function staticFailures(src) {
  const out = [];
  const stamp = src.slice(src.indexOf("export async function stampStopsFromTracking("));
  const end = stamp.indexOf("\n}\n");
  const body = end > 0 ? stamp.slice(0, end) : stamp;
  if (!/await settleStampedStopStatuses\(client, loadId\);\s*return out;/.test(body))
    out.push(`RULE 1 ${DELIVER}: stampStopsFromTracking no longer settles the stops it stamped (status stays 'pending')`);
  const settleAll = src.slice(src.indexOf("export async function settleStampedStopStatuses("));
  const settle = settleAll.slice(0, settleAll.indexOf("\n}\n") > 0 ? settleAll.indexOf("\n}\n") : undefined);
  if (!/status = 'departed'::mdata\.stop_status_enum/.test(settle) || !/actual_departure_at IS NOT NULL/.test(settle))
    out.push(`RULE 1 ${DELIVER}: settleStampedStopStatuses must move ONLY stops with a departure stamp to 'departed'`);
  return out;
}

export function liveFailures(rows) {
  return rows.map((r) => `RULE 2 load ${r.load_number} (${r.load_status}) stop ${r.sequence_number} ${r.stop_type} is still 'pending'`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(resolve(ROOT, DELIVER), "utf8");
  const officeSrc = readFileSync(resolve(ROOT, OFFICE), "utf8");
  if (process.argv.includes("--selftest")) {
    const cases = [
      ["the shipped engine passes", staticFailures(src).length === 0],
      ["dropping the settle call fails", staticFailures(src.replace("await settleStampedStopStatuses(client, loadId);", "")).some((x) => x.startsWith("RULE 1"))],
      ["settling without the stamp condition fails", staticFailures(src.replace("AND actual_departure_at IS NOT NULL", "")).some((x) => x.startsWith("RULE 1"))],
      ["office delivery passes", officeFailures(officeSrc, src).length === 0],
      ["office delivery without the tracking stamp fails", officeFailures(officeSrc.replace("await stampStopsFromTracking(client as never, loadId, operatingCompanyId, {});", ""), src).some((x) => x.startsWith("RULE 3"))],
      ["re-stamping an attested departure fails", officeFailures(officeSrc, src.replace("(actual_arrival_at IS NOT NULL OR actual_departure_at IS NOT NULL) AS stamped", "(actual_arrival_at IS NOT NULL) AS stamped")).some((x) => x.startsWith("RULE 1b"))],
      ["no pending stop passes", liveFailures([]).length === 0],
      ["a pending stop on an invoiced load fails", liveFailures([{ load_number: "1", load_status: "invoiced", sequence_number: 2, stop_type: "delivery" }]).some((x) => x.startsWith("RULE 2"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failures = [...staticFailures(src), ...officeFailures(officeSrc, src)];
  if (failures.length && !process.env.DATABASE_URL) {
    console.error(`${LABEL}: FAIL (static) —\n` + failures.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set (${REQUIRES_LIVE_DB})`);
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const rows = (await c.query(
      `SELECT l.load_number, l.status::text AS load_status, s.sequence_number, s.stop_type::text AS stop_type
         FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND s.soft_deleted_at IS NULL
          AND l.status::text = ANY($2::text[]) AND s.status::text = 'pending'
        ORDER BY l.load_number, s.sequence_number`, [USMCA, DELIVERED_OR_LATER])).rows;
    await c.query("ROLLBACK");
    failures.push(...liveFailures(rows));
  } catch (e) {
    console.error(`${LABEL}: FAIL — live check could not run: ${e.message}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.length} problem(s)\n` + failures.slice(0, 40).map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — no pending stop on a USMCA load at delivered or later; the Creator settles the stops it stamps`);
  process.exit(0);
}
