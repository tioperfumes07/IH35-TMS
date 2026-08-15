#!/usr/bin/env node
/**
 * HOME-2 guard — the "In-flight loads running late" metric must be canonical, not phantom-column-driven.
 *
 * The old /api/v1/reports/home-attention-list probed delivery-deadline columns (delivery_due_at/eta_at/…)
 * that DON'T exist on mdata.loads, so its late filter never applied and it counted every open load
 * (incl. soft-deleted + is_sample_data demo loads) as "late". Locks on library.routes.ts:
 *   (1) NO phantom late columns: none of delivery_due_at/delivery_deadline_at/scheduled_delivery_at/
 *       eta_at/delivery_at appear (the real deadline source is mdata.load_stops).
 *   (2) EXCLUDES sample + soft-deleted: references is_sample_data and soft_deleted_at in the late block.
 *   (3) IN-FLIGHT status set only: dispatched/at_pickup/in_transit/at_delivery (not booked/planned/assigned).
 *   (4) REAL late source: reads mdata.load_stops (scheduled_arrival_at / actual_arrival_at).
 *   (5) DEEP ROUTE: the attention action opens the canonical late-arrivals queue, not generic Dispatch.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-home-attention-late-canonical";
const FILE = "apps/backend/src/reports/library.routes.ts";
const PHANTOM = ["delivery_due_at", "delivery_deadline_at", "scheduled_delivery_at", "eta_at", "delivery_at"];

/** Slice the home-attention-list late block (route decl → the maintenance metric that follows), with
 *  comments stripped so explanatory text (which may name the phantom columns) is never matched. */
function lateBlock(src) {
  const start = src.indexOf("home-attention-list");
  if (start < 0) return "";
  const rest = src.slice(start);
  const end = rest.indexOf("maintenanceCriticalOrOverdue");
  const slice = end >= 0 ? rest.slice(0, end) : rest.slice(0, 4000);
  return slice.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

export function assertGuard({ source }) {
  const errors = [];
  const block = lateBlock(source);
  if (!block) { errors.push(`${FILE}: home-attention-list route not found`); return errors; }

  for (const col of PHANTOM) {
    if (new RegExp(`["'\`]?${col}["'\`]?`).test(block)) {
      errors.push(`${FILE}: still references phantom late column '${col}' (real source is mdata.load_stops)`);
    }
  }
  if (!/is_sample_data/.test(block)) errors.push(`${FILE}: late metric does not exclude is_sample_data (demo loads counted)`);
  if (!/soft_deleted_at/.test(block)) errors.push(`${FILE}: late metric does not exclude soft_deleted_at`);
  if (!/'dispatched'[\s\S]{0,80}?'at_pickup'[\s\S]{0,80}?'in_transit'[\s\S]{0,80}?'at_delivery'/.test(block)) {
    errors.push(`${FILE}: late metric does not use the in-flight status set (dispatched/at_pickup/in_transit/at_delivery)`);
  }
  if (/'booked'|'planned'|'assigned_not_dispatched'/.test(block)) {
    errors.push(`${FILE}: late metric still includes non-in-flight statuses (booked/planned/assigned)`);
  }
  if (!/mdata\.load_stops/.test(block) || !/scheduled_arrival_at/.test(block)) {
    errors.push(`${FILE}: late metric does not source the deadline from mdata.load_stops.scheduled_arrival_at`);
  }
  if (!/action_url:\s*["']\/dispatch\/alerts\/late-arrivals["']/.test(block)) {
    errors.push(`${FILE}: late attention action must deep-link to /dispatch/alerts/late-arrivals`);
  }
  if (!/action_label:\s*["']Open late arrivals["']/.test(block)) {
    errors.push(`${FILE}: late attention action label must name the late-arrivals destination`);
  }
  return errors;
}

function selftest() {
  const good = `app.get("/api/v1/reports/home-attention-list", async () => {
    if (hasSoftDelete) whereParts.push('l.soft_deleted_at IS NULL');
    if (hasSample) whereParts.push('l.is_sample_data IS NOT TRUE');
    whereParts.push("COALESCE(l.status::text,'') IN ('dispatched','at_pickup','in_transit','at_delivery')");
    whereParts.push("EXISTS (SELECT 1 FROM mdata.load_stops s WHERE s.load_id=l.id AND s.scheduled_arrival_at < now() AND s.actual_arrival_at IS NULL)");
    action_url: "/dispatch/alerts/late-arrivals",
    action_label: "Open late arrivals",
  });
  let maintenanceCriticalOrOverdue = 0;`;
  const cases = [
    { n: "canonical → 0", src: good, want: 0 },
    { n: "phantom column present", src: good.replace("EXISTS (SELECT 1 FROM mdata.load_stops", "l.delivery_due_at < now() AND EXISTS (SELECT 1 FROM mdata.load_stops"), min: 1 },
    { n: "no sample exclusion", src: good.replace("if (hasSample) whereParts.push('l.is_sample_data IS NOT TRUE');", ""), min: 1 },
    { n: "broad status set", src: good.replace("'dispatched','at_pickup','in_transit','at_delivery'", "'booked','planned','assigned_not_dispatched','dispatched','at_pickup','in_transit','at_delivery'"), min: 1 },
    { n: "no load_stops source", src: good.replace(/mdata\.load_stops[\s\S]*?actual_arrival_at IS NULL\)"\);/, ""), min: 1 },
    { n: "generic dispatch route", src: good.replace("/dispatch/alerts/late-arrivals", "/dispatch"), min: 1 },
    { n: "generic dispatch label", src: good.replace("Open late arrivals", "Open dispatch"), min: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard({ source: c.src }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const p = path.join(ROOT, FILE);
if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${FILE}`); process.exit(1); }
const errors = assertGuard({ source: fs.readFileSync(p, "utf8") });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — in-flight-late metric is canonical (mdata.loads + load_stops, excludes sample/soft-deleted, in-flight statuses, no phantom columns).`);
