#!/usr/bin/env node
// T122 stored Samsara vehicle id correction (1 row). Refuses unless the row is exactly as measured.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
const UNIT = "c9f6737d-3f0b-4a20-aa7e-5cebc8e48787", STALE = "212014918407330", LIVE = "212014918197571";
await run("t122_samsara_vehicle_id", async (c) => {
  const pre = (await c.query(`SELECT unit_number, samsara_vehicle_id FROM mdata.units WHERE id=$1`, [UNIT])).rows[0];
  if (!pre || pre.unit_number !== "T122" || pre.samsara_vehicle_id !== STALE) throw new Error(`refused: T122 not as measured ${JSON.stringify(pre)}`);
  const mirror = (await c.query(`SELECT count(*)::int n FROM integrations.samsara_vehicles WHERE operating_company_id=$1 AND local_unit_id=$2 AND samsara_vehicle_id=$3`, [USMCA, UNIT, LIVE])).rows[0].n;
  if (mirror !== 1) throw new Error("refused: mirror does not link T122 to the live id");
  const taken = (await c.query(`SELECT count(*)::int n FROM mdata.units WHERE samsara_vehicle_id=$1`, [LIVE])).rows[0].n;
  if (taken !== 0) throw new Error("refused: live id already on another unit");
  const u = await c.query(`UPDATE mdata.units SET samsara_vehicle_id=$2, updated_at=now() WHERE id=$1 AND samsara_vehicle_id=$3 RETURNING id`, [UNIT, LIVE, STALE]);
  const post = (await c.query(`SELECT samsara_vehicle_id FROM mdata.units WHERE id=$1`, [UNIT])).rows[0].samsara_vehicle_id;
  return { unit: "T122", unit_id: UNIT, from: STALE, to: LIVE, rows_updated: u.rowCount, after: post };
});
