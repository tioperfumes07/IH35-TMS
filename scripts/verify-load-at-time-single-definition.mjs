#!/usr/bin/env node
/**
 * Owner rule 2026-10-01 (NB load, SB return booked while NB still rolling): "which load was unit U on at T"
 * is defined ONCE, as loadAtTimeSql in maintenance/driver-attribution.ts. Engines call it; none re-derive it.
 * Fails if: the helper is missing / stops using the canonical dispatch clause, an engine that must call it
 * does not, or anything reads the non-existent l.delivered_at column.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "apps/backend/src");
const fails = [];
const helper = readFileSync(join(root, "maintenance/driver-attribution.ts"), "utf8");
if (!/export function loadAtTimeSql\(/.test(helper)) fails.push("loadAtTimeSql missing from driver-attribution.ts");
if (!/x\.event_kind = 'exited'/.test(helper)) fails.push("loadAtTimeSql must fall back to the delivery fence exit when TMS has no delivery stamp");
if (!/canonicalDispatchWorkStatusClause\("l"\)/.test(helper)) fails.push("loadAtTimeSql must use canonicalDispatchWorkStatusClause");
const callers = [
  "telematics/unit-stop-events.writer.ts",
  "integrations/samsara/geofences/state-machine/engine.ts",
  "integrations/samsara/border-crossings/detector.service.ts",
  "integrations/samsara/messaging/driver-prompts.service.ts",
  "safety/samsara-dvir-ingest.service.ts",
  "telematics/telematics-linkage.service.ts",
];
for (const f of callers) if (!readFileSync(join(root, f), "utf8").includes("loadAtTimeSql(")) fails.push(`${f} must call loadAtTimeSql`);
if (/TRANSITION_ACTIVE_LOAD_STATUSES/.test(readFileSync(join(root, callers[1]), "utf8"))) fails.push("state machine re-declares an on-road status list");
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []; });
for (const p of walk(root)) if (readFileSync(p, "utf8").split("\n").some((ln) => /\bl\.delivered_at\b/.test(ln) && !/^\s*(\/\/|\*|--)/.test(ln))) fails.push(`${p.slice(root.length + 1)} reads l.delivered_at (column does not exist)`);
if (fails.length) { console.error("verify-load-at-time-single-definition: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-load-at-time-single-definition: OK (${callers.length} callers)`);
