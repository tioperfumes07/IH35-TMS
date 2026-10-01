#!/usr/bin/env node
// --apply requires --auth AUTH-NNN and runs scripts/verify-owner-authorization.mjs (in 2026-10-01-cc3-lib.mjs args()) before any write.
// Delete EXACT-repeat telematics.odometer_readings: same unit, same America/Chicago day (the table's own
// telematics.odometer_reading_day), same source, same odometer value -- keep the earliest (read_at, id).
// Distinct readings on the same day are REAL reads and are kept (R-02). With --apply the deleted rows
// are written to --backup <file.ndjson> first.
import { writeFileSync } from "node:fs";
import { run } from "./2026-10-01-cc3-lib.mjs";
const bi = process.argv.indexOf("--backup");
const backup = bi > 0 ? process.argv[bi + 1] : null;
if (process.argv.includes("--apply") && !backup) throw new Error("--apply requires --backup <file.ndjson>");
const KEY = "unit_id, telematics.odometer_reading_day(read_at), source, odometer_miles";
await run("odometer_readings_exact_repeat_dedupe", async (c, { apply }) => {
  const before = (await c.query(`SELECT count(*)::int total, count(DISTINCT (${KEY}))::int keys FROM telematics.odometer_readings`)).rows[0];
  const victims = await c.query(
    `SELECT r.* FROM telematics.odometer_readings r JOIN (
       SELECT id, row_number() OVER (PARTITION BY ${KEY} ORDER BY read_at, id) rn FROM telematics.odometer_readings) x
       ON x.id = r.id WHERE x.rn > 1`
  );
  if (apply) writeFileSync(backup, victims.rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const del = await c.query(`DELETE FROM telematics.odometer_readings WHERE id = ANY($1::uuid[])`, [victims.rows.map((r) => r.id)]);
  const after = (await c.query(`SELECT count(*)::int total, count(DISTINCT (${KEY}))::int keys FROM telematics.odometer_readings`)).rows[0];
  if (after.total !== after.keys || after.keys !== before.keys) throw new Error(`refused: survivors ${after.total} != distinct keys ${after.keys}/${before.keys}`);
  const perDay = (await c.query(`SELECT coalesce(sum(n-1),0)::int surplus FROM (SELECT count(*) n FROM telematics.odometer_readings GROUP BY operating_company_id, unit_id, telematics.odometer_reading_day(read_at), source HAVING count(*)>1) g`)).rows[0].surplus;
  return { before_total: before.total, distinct_keys: before.keys, deleted: del.rowCount, after_total: after.total, survivors_equal_distinct_keys: after.total === after.keys, remaining_same_day_distinct_readings_kept: perDay, backup };
}, { asTableOwner: true });
