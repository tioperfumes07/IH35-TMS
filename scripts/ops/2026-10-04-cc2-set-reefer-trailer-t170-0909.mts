// ROUND 391.2 (Lead) + owner chat 2026-10-04 ("YES SET REEFER TRAILER ON EACH FILL"): the Relay reefer fill on T170,
// 2026-09-09, 97.452 gal (fuel transaction 86658559, fuel_type reefer_diesel since migration 202615400700) carries no
// trailer, so the federal reefer-fuel credit cannot name the reefer unit. Relay prompts only for "Truck #", never the
// trailer, so the evidence is the books: the ONLY trailer recorded on T170 within 7 days of the fill (fuel rows and
// expenses) is 10224 (Reefer, leased to USMCA). The script re-measures that and refuses if it no longer holds.
// It writes through setReeferTrailer (the same service the Reefer fuel credit report's "Set trailer" calls: asserts a
// Reefer-type trailer usable by USMCA, updates the fuel row and its expense line; the audit trigger records both).
// The other T156 fills have two or three candidate trailers — the owner picks those, they are NOT touched here.
// Dry run (default) rolls back. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { setReeferTrailer } from "../../apps/backend/src/fuel/reefer-fuel.service.js";

const FILL = "86658559-6dd3-4b1d-b680-de9d3374a92c"; // T170 2026-09-09 97.452 gal
const TRAILER = "fc534b3d"; // 10224 — resolved to its full id below and asserted by number

if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}

await run("cc2_set_reefer_trailer_t170_0909", async (c: any) => {
  const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
  const pre = await q(
    `SELECT ft.id::text fid, u.unit_number, coalesce(ft.purchased_at, ft.transaction_at)::date::text d, ft.gallons::text gal,
            ft.fuel_type, ft.trailer_id, ft.voided_at
       FROM fuel.fuel_transactions ft JOIN mdata.units u ON u.id = ft.unit_id
      WHERE ft.operating_company_id = $1::uuid AND ft.id = $2::uuid`,
    [USMCA, FILL],
  );
  const f = pre[0];
  if (!f || f.unit_number !== "T170" || f.fuel_type !== "reefer_diesel" || f.gal !== "97.452" || f.voided_at || f.trailer_id) {
    throw new Error(`REFUSE: fill not as measured ${JSON.stringify(pre)}`);
  }
  const trl = await q(`SELECT id::text, equipment_number, equipment_type FROM mdata.equipment WHERE id::text LIKE $1 AND equipment_number = '10224'`, [`${TRAILER}%`]);
  if (trl.length !== 1 || trl[0].equipment_type !== "Reefer") throw new Error(`REFUSE: trailer 10224 not as measured ${JSON.stringify(trl)}`);
  const seen = await q(
    `SELECT DISTINCT eq.equipment_number
       FROM (SELECT e.trailer_id t, e.transaction_date::date dd, e.unit_id uu FROM accounting.expenses e
              WHERE e.operating_company_id = $1::uuid AND e.trailer_id IS NOT NULL AND e.voided_at IS NULL
             UNION ALL
             SELECT ft.trailer_id, coalesce(ft.purchased_at, ft.transaction_at)::date, ft.unit_id FROM fuel.fuel_transactions ft
              WHERE ft.operating_company_id = $1::uuid AND ft.trailer_id IS NOT NULL AND ft.voided_at IS NULL) ev
       JOIN mdata.equipment eq ON eq.id = ev.t
       JOIN fuel.fuel_transactions f ON f.id = $2::uuid
      WHERE ev.uu = f.unit_id AND abs(ev.dd - coalesce(f.purchased_at, f.transaction_at)::date) <= 7`,
    [USMCA, FILL],
  );
  if (seen.length !== 1 || seen[0].equipment_number !== "10224") throw new Error(`REFUSE: T170 trailer evidence changed ${JSON.stringify(seen)}`);

  const res = await setReeferTrailer(c, USMCA, { source: "fuel_card", source_id: FILL, trailer_id: trl[0].id });
  const after = await q(
    `SELECT ft.trailer_id::text ft_trailer, el.trailer_id::text line_trailer
       FROM fuel.fuel_transactions ft
       LEFT JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
       LEFT JOIN accounting.expense_lines el ON el.expense_id = e.id
      WHERE ft.id = $1::uuid`,
    [FILL],
  );
  if (!after.length || after.some((r: any) => r.ft_trailer !== trl[0].id || (r.line_trailer && r.line_trailer !== trl[0].id))) {
    throw new Error(`REFUSE after: ${JSON.stringify(after)}`);
  }
  return { evidence_trailers_on_T170_pm7d: seen.map((r: any) => r.equipment_number), result: res, after };
});
