#!/usr/bin/env node
// ROUND 155.20 JOB 2 / 157-A item 2 (owner P0, 2026-09-28): "NO STOP HAS EVER BEEN STAMPED. That
// is why status never advances." Diagnosed live, with evidence, not assumed:
//
//   ROOT CAUSE: integrations.samsara_config.is_enabled for USMCA (5c854333-6ea5-4faa-af31-
//   67cb272fef80) was FALSE for the entire period these loads have been dispatched (created_at
//   2026-08-21, disabled ever since) and only flipped to TRUE at 2026-09-28T10:00:08.34981Z —
//   confirmed by audit.audit_events: repeated "cron_skipped_samsara_disabled" rows (source
//   DS-REMEDIATE-6 / BLOCK-F-REEFER-POLL) timestamped the SAME SECOND as that flip, the last pair
//   at exactly 10:00:08. The geofence/Samsara arrival chain
//   (telematics/geofence-detector.service.ts, wired via
//   integrations/samsara/samsara-positions.service.ts, invoked every 5 minutes from
//   cron/samsara-positions-cron.ts, itself registered at backend startup in index.ts) is correctly
//   WIRED and correctly RUNNING — it was simply never turned on for this entity, so it never had a
//   chance to fire for any of these loads' stops. integrations.samsara_vehicles: 48 of 48 vehicles
//   already carry a local_unit_id mapping (not a mapping gap either), but 0 have been "seen" in
//   the last day — the very first sync cycle since enabling has not yet completed.
//   SEPARATELY, the dispatcher-facing manual stamp route (dispatch/truck-line/stop-stamp.routes.ts
//   -> stampStopArrival) has fired exactly ONCE, ever, system-wide
//   (audit.audit_events event_class='dispatch.truck_line.stop_arrival', count=1) — it is wired and
//   working, just essentially unused. mdata.load_stops DOES carry 239 real, non-null
//   actual_arrival_at rows for USMCA (July 3 - Sept 24), proving the write path itself functions;
//   they simply never landed on these specific loads because the entity-level Samsara toggle was
//   off the whole time.
//
// THE PERMANENT FIX is this guard, not a backfill: a load frozen at 'dispatched' (or any other
// board-active status) whose last scheduled stop is more than 24h past with zero
// actual_arrival_at can no longer go unnoticed. SHRINK-ONLY RATCHET against
// scripts/verify-dispatched-load-has-stop-stamps.baseline.json — today's real, already-diagnosed
// backlog (created the same day Samsara was finally enabled, so it cannot retroactively stamp
// them) is tolerated up to the baseline ceiling; any NEW load ageing past 24h with zero stamps
// fails outright.
//
// DISPATCH-STAMPS (owner, 2026-09-30): "FIX THE GUARD TOO: it must assert only on stops whose
// event must already have occurred, never on a delivery scheduled in the future. As written it
// turns every newly dispatched load into a red for every seat." The "overdue" EXISTS clause now
// only matches stop_type='pickup' — pickup is the one event a load in any board-active status
// must already have completed; a delivery leg is legitimately still in the future for a load
// genuinely in transit, and must never itself be grounds to flag red. (The anti-join still
// requires ZERO actual_arrival_at anywhere on the load, so a load whose pickup IS stamped never
// fires here regardless of how the delivery leg's own schedule looks.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-dispatched-load-has-stop-stamps";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-dispatched-load-has-stop-stamps.baseline.json");
export const REQUIRES_LIVE_DB =
  "live-ops ratchet: dispatched loads past 24h with zero stop stamps; fails closed via requireLiveDbOrExit";

const ACTIVE_STATUSES = [
  "booked", "planned", "assigned", "unassigned", "assigned_not_dispatched", "dispatched",
  "at_pickup", "in_transit", "at_delivery",
];

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

export function evaluate(liveLoadNumbers, baseline) {
  const liveSet = new Set(liveLoadNumbers);
  if (!baseline) {
    return liveSet.size === 0
      ? { ok: true, message: "clean, no baseline needed" }
      : { ok: false, message: `${liveSet.size} unstamped stale load(s), no baseline on file: ${[...liveSet].join(", ")}` };
  }
  const baselineSet = new Set(baseline.load_numbers ?? []);
  const newRot = [...liveSet].filter((ln) => !baselineSet.has(ln));
  if (newRot.length > 0) {
    return { ok: false, message: `new rot, not in baseline: ${newRot.join(", ")}` };
  }
  const stillOpen = [...liveSet];
  const nowClean = [...baselineSet].filter((ln) => !liveSet.has(ln));
  return {
    ok: true,
    message:
      `${stillOpen.length} known stale unstamped load(s) (baseline ${baselineSet.size}, established ${baseline.established})` +
      (nowClean.length ? `; ${nowClean.length} baselined load(s) now clean — shrink the ratchet when convenient: ${nowClean.join(", ")}` : ""),
  };
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  t("no baseline, 0 live -> ok", evaluate([], null).ok === true);
  t("no baseline, some live -> fail", evaluate(["13624"], null).ok === false);
  t("baseline has it, live matches -> ok", evaluate(["13624"], { load_numbers: ["13624"], established: "x" }).ok === true);
  t("baseline has it, live has a NEW one too -> FAIL (new rot)", evaluate(["13624", "13699"], { load_numbers: ["13624"], established: "x" }).ok === false);
  t("baseline has it, live is now clean -> ok (reports shrinkable)", evaluate([], { load_numbers: ["13624"], established: "x" }).ok === true);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 5 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(`
      SELECT l.load_number
        FROM mdata.loads l
       WHERE l.soft_deleted_at IS NULL
         AND l.status::text = ANY($1::text[])
         AND EXISTS (
               SELECT 1 FROM mdata.load_stops ls
                WHERE ls.load_id = l.id AND ls.soft_deleted_at IS NULL
                  AND ls.stop_type = 'pickup'
                  AND COALESCE(ls.scheduled_arrival_at, ls.appointment_start_at) < now() - interval '24 hours'
             )
         AND NOT EXISTS (
               SELECT 1 FROM mdata.load_stops ls2
                WHERE ls2.load_id = l.id AND ls2.soft_deleted_at IS NULL AND ls2.actual_arrival_at IS NOT NULL
             )
       ORDER BY l.load_number::int
    `, [ACTIVE_STATUSES]);
    await client.query("ROLLBACK");

    const liveLoadNumbers = res.rows.map((r) => r.load_number);
    const baseline = loadBaseline();
    const verdict = evaluate(liveLoadNumbers, baseline);
    console.log(`${LABEL}: ${verdict.message}`);
    if (!verdict.ok) process.exit(1);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
