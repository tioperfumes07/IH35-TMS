#!/usr/bin/env node
/**
 * Register rows 93 / 116 / 131 (LEAD 2026-11-03).
 *
 *  R93a  every HOS writer resolves the driver to the SURVIVOR before it writes (Samsara HOS poll, webhook projector,
 *        verbatim clocks snapshots) — nothing is written onto a merged shell (mdata.drivers.merged_into_driver_id).
 *  R93b  a merge moves the shell's HOS rows to the survivor (merge engine + Samsara-mapping retire path), after the merge is
 *        recorded, duplicates of a survivor event kept on the shell — never deleted.
 *  R93c  migration 202616340100: the append-only ledger admits ONLY driver_id shell -> its survivor; DELETE still refused.
 *  R116a a fence crossing without an OBD read is measured through the shared anchor at the crossing's own time.
 *  R116b E11 boundary reads are stored as 'samsara_boundary' (outside the one-'samsara'-row-per-day key) and the plan no
 *        longer skips a boundary because the daily snapshot holds that day.
 *  R131a Book Load's deadhead refusal queues the relearn with fill_deadhead; the handler fills miles_deadhead (one engine).
 *
 * Prod (read-only, 11-03, USMCA): 9,035 duty events on 15 shells, 49,486 snapshots on 8 shells; delivered loads with real
 * driven miles 80 of 194; 11 delivered loads booked 10-21/22 with miles_deadhead NULL ("the first stop has no real point yet").
 *   --selftest   plants each defect and proves it is caught
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-rows-93-116-131";
const FILES = {
  pull: "apps/backend/src/integrations/samsara/samsara-hos-pull.service.ts",
  projector: "apps/backend/src/integrations/samsara/webhook-projectors/hos-projector.ts",
  clocks: "apps/backend/src/integrations/samsara/samsara-hos-clocks-pull.service.ts",
  resolver: "apps/backend/src/mdata/driver-merge-resolution.ts",
  repoint: "apps/backend/src/mdata/hos-shell-repoint.service.ts",
  merge: "apps/backend/src/mdata/driver-merge.service.ts",
  mapping: "apps/backend/src/integrations/samsara/driver-mapping/driver-mapping.routes.ts",
  migration: "db/migrations/202616340100_hos_shell_repoint_and_odometer_boundary_source.sql",
  miles: "apps/backend/src/telematics/load-real-driven-miles.service.ts",
  backfill: "apps/backend/src/telematics/odometer-history-backfill.service.ts",
  manual: "apps/backend/src/telematics/odometer-manual-upsert.service.ts",
  relearn: "apps/backend/src/outbox/handlers/dispatch-relearn-load-miles.handler.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
};

const before = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b); return i >= 0 && j >= 0 && i < j; };

export function audit(s) {
  const f = [];
  // R93a
  if (!/COALESCE\(d\.merged_into_driver_id, d\.id\)/.test(s.resolver)) f.push("R93a: resolveSurvivorDriverId does not follow merged_into_driver_id");
  // CLS-JOIN-ENTITY-UNSCOPED: the shell is read in the writer's company (merges never cross companies) — an id from another
  // entity is never followed onto this company's HOS ledger.
  if (!/FROM mdata\.drivers d WHERE d\.id = \$1::uuid AND d\.operating_company_id = \$2::uuid/.test(s.resolver)) f.push("R93a: resolveSurvivorDriverId reads the shell without the writer's company");
  if (!/const localDriverId = await resolveSurvivorDriverId\(client as never, mappedDriverId, operatingCompanyId\)/.test(s.pull) || !before(s.pull, "resolveSurvivorDriverId(client as never, mappedDriverId, operatingCompanyId)", "INSERT INTO hos.duty_status_events"))
    f.push("R93a: the Samsara HOS poll writes the mapped id without resolving the survivor");
  if (!/const localDriverId = mappedDriverId \? await resolveSurvivorDriverId\(client as never, mappedDriverId, event\.operating_company_id\) : null/.test(s.projector))
    f.push("R93a: the HOS webhook projector writes the mapped id without resolving the survivor");
  if (!/const driverUuid = await resolveSurvivorDriverId\(client as never, map\.local, operatingCompanyId\)/.test(s.clocks) || !/operatingCompanyId, driverUuid, map\.unit,/.test(s.clocks))
    f.push("R93a: the HOS clocks snapshot writes the mapped id without resolving the survivor");
  // R93b
  if (!/NOT EXISTS[\s\S]*s\.duty_status = e\.duty_status[\s\S]*s\.started_at = e\.started_at[\s\S]*s\.source = e\.source/.test(s.repoint)) f.push("R93b: the HOS repoint can move a duplicate onto the survivor");
  if (/DELETE\s+FROM/i.test(s.repoint)) f.push("R93b: the HOS repoint deletes rows");
  if (!before(s.merge, "SET merged_into_driver_id = $2::uuid", "await repointHosRowsToSurvivor(client, M, S)")) f.push("R93b: the merge engine does not move HOS rows after recording the merge");
  if (!before(s.mapping, "SET merged_into_driver_id = $3::uuid", "await repointHosRowsToSurvivor(client as never, driver_id, target_id)")) f.push("R93b: the Samsara-mapping retire path leaves HOS rows on the shell");
  // R93c
  if (!/shell\.merged_into_driver_id = NEW\.driver_id/.test(s.migration) || !/NEW\.started_at = OLD\.started_at/.test(s.migration) || !/NEW\.duty_status = OLD\.duty_status/.test(s.migration))
    f.push("R93c: the ledger carve-out is not limited to a shell -> its survivor with every other column unchanged");
  if (!/IF TG_OP = 'UPDATE'/.test(s.migration) || !/RAISE EXCEPTION 'hos\.duty_status_events is append-only/.test(s.migration)) f.push("R93c: the ledger no longer refuses DELETE / other UPDATEs");
  // R116a
  if (!/if \(h\) timed\.push\(\{ key: `\$\{w\.key\}:fence`, unit_id: w\.stop\.unit_id, at: h\.at \}\)/.test(s.miles)) f.push("R116a: a no-OBD fence crossing's time is not resolved through the anchor");
  if (!/if \(fenceAnchor\?\.anchor\) return \{ anchor: fenceAnchor\.anchor, reason: null, at: hit\.at, via: "geofence_time" \}/.test(s.miles)) f.push("R116a: the boundary ignores the anchor at the crossing time");
  // R116b
  if (!/'samsara_boundary', 'measured'/.test(s.backfill)) f.push("R116b: E11 boundary reads still compete for the daily 'samsara' slot");
  if (/odometer_reading_day/.test(s.backfill.slice(s.backfill.indexOf("export async function planOdometerBackfill")))) f.push("R116b: the plan still skips a boundary on a day the snapshot already wrote");
  if (!/AND source <> 'samsara_boundary'/.test(s.migration) || !/AND source <> 'samsara_boundary'/.test(s.manual)) f.push("R116b: the per-day key / its manual ON CONFLICT target does not exclude boundary reads");
  // R131a
  if (!/actor_user_id: input\.requestingUserUuid, fill_deadhead: true \}/.test(s.book)) f.push("R131a: Book Load's refusal does not ask the relearn to fill the deadhead");
  if (!/payload\.fill_deadhead === true \? await fillLoadDeadhead\(/.test(s.relearn)) f.push("R131a: the relearn handler never fills miles_deadhead");
  return f;
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => (src[k].includes(a) ? audit({ ...src, [k]: src[k].replace(a, b) }).length > 0 : null);
  const cases = [
    ["clean sources pass", audit(src).length === 0],
    ["93a poll writes the shell FAILS", plant("pull", "const localDriverId = await resolveSurvivorDriverId(client as never, mappedDriverId, operatingCompanyId);", "const localDriverId = mappedDriverId;")],
    ["93a projector writes the shell FAILS", plant("projector", "const localDriverId = mappedDriverId ? await resolveSurvivorDriverId(client as never, mappedDriverId, event.operating_company_id) : null;", "const localDriverId = mappedDriverId;")],
    ["93a resolver reads the shell unscoped FAILS", plant("resolver", " AND d.operating_company_id = $2::uuid`", "`")],
    ["93a snapshot writes the shell FAILS", plant("clocks", "operatingCompanyId, driverUuid, map.unit,", "operatingCompanyId, map.local, map.unit,")],
    ["93a resolver stops following merges FAILS", plant("resolver", "COALESCE(d.merged_into_driver_id, d.id)", "d.id")],
    ["93b duplicate moved FAILS", plant("repoint", "AND s.started_at = e.started_at", "")],
    ["93b merge engine skips HOS FAILS", plant("merge", "await repointHosRowsToSurvivor(client, M, S)", "await Promise.resolve({ duty_events_moved: 0, duty_events_duplicate_kept: 0, snapshots_moved: 0 })")],
    ["93b mapping retire skips HOS FAILS", plant("mapping", "await repointHosRowsToSurvivor(client as never, driver_id, target_id);", "")],
    ["93c carve-out admits any driver FAILS", plant("migration", "AND shell.merged_into_driver_id = NEW.driver_id", "")],
    ["116a crossing time ignored FAILS", plant("miles", "if (h) timed.push({ key: `${w.key}:fence`, unit_id: w.stop.unit_id, at: h.at });", "")],
    ["116b boundary reads in the daily slot FAILS", plant("backfill", "'samsara_boundary', 'measured'", "'samsara', 'measured'")],
    ["131a no fill flag FAILS", plant("book", "actor_user_id: input.requestingUserUuid, fill_deadhead: true }", "actor_user_id: input.requestingUserUuid }")],
    ["131a handler never fills FAILS", plant("relearn", "payload.fill_deadhead === true ? await fillLoadDeadhead(", "false ? await fillLoadDeadhead(")],
  ];
  let bad = 0;
  for (const [name, ok] of cases) { if (ok !== true) bad++; console.log(`${ok === true ? "ok  " : "FAIL"}  ${name}`); }
  console.log(bad ? `${LABEL} --selftest FAIL (${bad})` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const findings = audit(src);
if (findings.length) { console.error(`${LABEL}: FAIL\n - ${findings.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — HOS writes land on the survivor, merges move HOS rows, fence times / boundary reads measure miles, booked deadhead refusals get filled`);
