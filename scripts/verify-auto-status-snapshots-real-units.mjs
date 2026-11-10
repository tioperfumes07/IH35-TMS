#!/usr/bin/env node
// ACCT-F11121 — the auto-status engine snapshots only units that exist, and only for USMCA.
//
// Measured on prod 2026-11-09 (_system.background_jobs): integrations.auto_status_switch_worker last succeeded
// 2026-11-03 16:05:02Z and failed every 5 minutes after with auto_status_position_snapshots_unit_uuid_fkey. Cause: the
// 2026-11-03 phantom-unit purge left 10 rows in integrations.samsara_vehicle_positions (no FK to mdata.units); the
// snapshot copy referenced deleted units and the whole tick rolled back — no load was checked for status drift for 6 days.
// Reproduced on a Neon fork of br-fancy-credit-akjnd07a: the old reader fails with the same 23503; the joined reader
// writes 40 USMCA snapshots; the new FK refuses a position for a missing unit.
//
// RULE 1 — recordPositionSnapshotsForCompany reads samsara_vehicle_positions JOINed to mdata.units.
// RULE 2 — the worker runs only for USMCA (isUsmcaOperatingCompany) — frozen entities are never written.
// RULE 3 — migration 202616440100 gives samsara_vehicle_positions.unit_uuid a FK to mdata.units ON DELETE CASCADE.
import fs from "node:fs";

const DETECTOR = "apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts";
const WORKER = "apps/backend/src/jobs/auto-status-switch-worker.ts";
const MIGRATION = "db/migrations/202616440100_acct_f11121_samsara_positions_follow_their_unit.sql";

function fnBody(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) return "";
  const end = src.indexOf("\n}", i);
  return src.slice(i, end < 0 ? src.length : end + 2);
}

export function audit(files) {
  const out = [];
  const det = files[DETECTOR];
  if (det == null) return [`RULE 1: ${DETECTOR} is missing`];
  const body = fnBody(det, "export async function recordPositionSnapshotsForCompany");
  if (!body) out.push("RULE 1: recordPositionSnapshotsForCompany not found");
  else {
    const read = body.slice(0, body.indexOf("INSERT INTO"));
    if (!/FROM integrations\.samsara_vehicle_positions p\s+JOIN mdata\.units u ON u\.id = p\.unit_uuid/.test(read)) {
      out.push("RULE 1: the snapshot reader does not JOIN mdata.units — a cached position of a deleted unit fails the tick (23503)");
    }
  }
  const w = files[WORKER];
  if (w == null) out.push(`RULE 2: ${WORKER} is missing`);
  else {
    const tick = fnBody(w, "export async function runAutoStatusSwitchTick");
    if (!/companies\.rows\.filter\(\(c\) => isUsmcaOperatingCompany\(c\.id\)\)/.test(tick)) {
      out.push("RULE 2: runAutoStatusSwitchTick iterates companies without the USMCA filter — frozen entities would be written");
    }
  }
  const m = files[MIGRATION];
  if (m == null) out.push(`RULE 3: ${MIGRATION} is missing`);
  else if (!/ADD CONSTRAINT samsara_vehicle_positions_unit_uuid_fkey\s+FOREIGN KEY \(unit_uuid\) REFERENCES mdata\.units\(id\) ON DELETE CASCADE/.test(m)) {
    out.push("RULE 3: the migration no longer ties samsara_vehicle_positions.unit_uuid to mdata.units ON DELETE CASCADE");
  } else if (/\bDELETE\s+FROM\b|\bUPDATE\s+integrations\./i.test(m)) {
    out.push("RULE 3: the migration writes rows — it must only add the constraint");
  }
  return out;
}

function load(root) {
  const files = {};
  for (const r of [DETECTOR, WORKER, MIGRATION]) {
    try {
      files[r] = fs.readFileSync(`${root}/${r}`, "utf8");
    } catch {
      files[r] = null;
    }
  }
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const cases = [
    ["reader drops the unit join", plant(DETECTOR, "      JOIN mdata.units u ON u.id = p.unit_uuid\n", "")],
    ["worker runs every company", plant(WORKER, "companies.rows.filter((c) => isUsmcaOperatingCompany(c.id))", "companies.rows")],
    ["migration loses the cascade", plant(MIGRATION, "REFERENCES mdata.units(id) ON DELETE CASCADE NOT VALID;", "REFERENCES mdata.units(id) NOT VALID;")],
    ["migration deletes orphans", plant(MIGRATION, "COMMIT;", "DELETE FROM integrations.samsara_vehicle_positions WHERE true;\nCOMMIT;")],
    ["migration missing", { ...good, [MIGRATION]: null }],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-auto-status-snapshots-real-units: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-auto-status-snapshots-real-units FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-auto-status-snapshots-real-units: PASS — snapshot reader joins mdata.units, worker USMCA-only, positions cascade with their unit");
