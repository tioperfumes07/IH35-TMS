#!/usr/bin/env node
// --apply requires --auth AUTH-NNN and runs scripts/verify-owner-authorization.mjs (in 2026-10-01-cc3-lib.mjs args()) before any write.
// Finish the 5 clear driver merges (USMCA). The losers already carry merged_into_driver_id = survivor
// (CC-1, 2026-09-28) but still hold mdata.drivers.samsara_driver_id, which is what split 5 Samsara ids
// across two rows. Move the id to the survivor when the survivor has none; clear it from the loser when
// the survivor already holds a different id (the mirror keeps the link). Never deletes; refuses any pair
// not exactly as measured or whose loser has activity.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
const PAIRS = [
  { sid: "13680780", survivor: "5dd518ff-db91-429f-b651-a71b5f0db672", loser: "df9fd576-69dd-4ec0-b1ec-4b382175c3bd" },
  { sid: "55857614", survivor: "52037e93-484a-4659-ab60-cf2a78f4c647", loser: "9a4b4e37-7df4-4553-82f5-ff792d58fff0" },
  { sid: "56507640", survivor: "6edcb351-e81b-4bf2-adf7-5eca9eff9137", loser: "fdc47fb2-acc5-4849-81c8-909e0af890b3" },
  { sid: "58031381", survivor: "3445cf68-4a7f-4d73-89f7-04bf1fd207b4", loser: "31f7e27f-e4b0-415b-9f41-79b23660c7cb" },
  { sid: "60695293", survivor: "61727a46-af2e-4d33-8236-e2d99b737708", loser: "5363ee51-35f2-430f-9516-5be13e50e253" },
];
await run("driver_samsara_link_to_merge_survivor", async (c) => {
  const out = [];
  for (const p of PAIRS) {
    const l = (await c.query(`SELECT operating_company_id::text oc, merged_into_driver_id::text m, samsara_driver_id::text sid, status FROM mdata.drivers WHERE id=$1`, [p.loser])).rows[0];
    const s = (await c.query(`SELECT operating_company_id::text oc, samsara_driver_id::text sid, merged_into_driver_id FROM mdata.drivers WHERE id=$1`, [p.survivor])).rows[0];
    if (!l || !s || l.oc !== USMCA || s.oc !== USMCA || l.m !== p.survivor || l.sid !== p.sid || s.merged_into_driver_id) throw new Error(`refused pair ${p.sid}: not as measured`);
    const act = (await c.query(
      `SELECT (SELECT count(*) FROM mdata.loads WHERE assigned_primary_driver_id=$1 OR assigned_secondary_driver_id=$1)
            + (SELECT count(*) FROM driver_finance.driver_settlements WHERE driver_id=$1)
            + (SELECT count(*) FROM telematics.vehicle_driver_assignments WHERE driver_id=$1)
            + (SELECT count(*) FROM fuel.fuel_transactions WHERE driver_id=$1) AS n`, [p.loser])).rows[0].n;
    if (Number(act) !== 0) throw new Error(`refused pair ${p.sid}: loser has ${act} activity rows`);
    await c.query(`UPDATE mdata.drivers SET samsara_driver_id=NULL, updated_at=now() WHERE id=$1`, [p.loser]);
    let action = "cleared_on_loser";
    if (!s.sid) {
      await c.query(`UPDATE mdata.drivers SET samsara_driver_id=$2, updated_at=now() WHERE id=$1 AND samsara_driver_id IS NULL`, [p.survivor, p.sid]);
      action = "moved_to_survivor";
    }
    out.push({ samsara_driver_id: p.sid, survivor: p.survivor, loser: p.loser, action, survivor_other_id: s.sid ?? null });
  }
  const dup = (await c.query(
    `WITH links AS (SELECT samsara_driver_id::text sid, id d FROM mdata.drivers WHERE operating_company_id=$1 AND samsara_driver_id IS NOT NULL
       UNION SELECT samsara_driver_id::text, local_driver_id FROM integrations.samsara_drivers WHERE operating_company_id=$1 AND local_driver_id IS NOT NULL)
     SELECT count(*)::int n FROM (SELECT sid FROM links GROUP BY sid HAVING count(DISTINCT d)>1) x`, [USMCA])).rows[0].n;
  return { pairs: out, samsara_ids_still_on_two_rows: dup };
});
