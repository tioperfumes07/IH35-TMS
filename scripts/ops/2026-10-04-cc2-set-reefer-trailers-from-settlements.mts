// Owner chat 2026-10-04: "YES SET REEFER TRAILER ON EACH FILL" and "IT SHOULD ALL BE IN THE COMPANY AND DRIVER
// SETTLEMENTS". Every AllwaysTrack driver settlement prints, per load, "Load N  Truck T / Trailer X". This sets the reefer
// trailer on the reefer fuel fills whose load the settlement names, each one through setReeferTrailer (the service behind
// Reports > Reefer fuel credit > Set trailer: asserts a Reefer-type trailer usable by USMCA; the audit trigger records it).
// Each row's load is re-asserted before writing, so a moved fill is refused instead of mislabelled.
// NOT here: the 2026-09-08 T156 fill (load 13585 -> trailer 10219) — 10219 is typed DryVan and the service refuses it until
// its type is corrected; the 2026-08-20 reefer line on 13523-32 (receipt 99133290 is also on 13534-28 — an open duplicate).
// Dry run (default) rolls back. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { setReeferTrailer } from "../../apps/backend/src/fuel/reefer-fuel.service.js";

type Row = { source: "fuel_card" | "expense"; id: string; load: string; trailer: string; settlement: string };
const ROWS: Row[] = [
  { source: "fuel_card", id: "c93014f7-79bf-4711-8515-4879fa255969", load: "13587", trailer: "10222", settlement: "5807" }, // T156 09-10
  { source: "expense", id: "e796d552-7e7f-44f7-b0f8-b6284f0244a0", load: "13517", trailer: "10209", settlement: "5774" }, // 13517-17 08-07
  { source: "expense", id: "41a626c8-3e02-457b-8ebd-af5ea7818c90", load: "13517", trailer: "10209", settlement: "5774" }, // 13517-19 08-12
  { source: "expense", id: "d8c8db13-3156-4523-9612-63005dedf2d5", load: "13523", trailer: "10222", settlement: "5781" }, // 13523-30 08-16
  { source: "expense", id: "c2a8c40e-8c29-4220-b543-6a2ec7fcb53e", load: "13523", trailer: "10222", settlement: "5781" }, // 13523-31 08-17
  { source: "expense", id: "416a1b04-8154-4207-aa8b-0269c32fdd38", load: "13561", trailer: "10224", settlement: "5795" }, // 13561-10 09-01
  { source: "expense", id: "fc344d3a-4c45-420a-a973-35c999645351", load: "13599", trailer: "10218", settlement: "5810" }, // 13599-23 09-16
];

if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}

await run("cc2_set_reefer_trailers_from_settlements", async (c: any) => {
  const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
  const out: unknown[] = [];
  for (const r of ROWS) {
    const cur =
      r.source === "fuel_card"
        ? await q(
            `SELECT l.load_number, ft.trailer_id FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id
              WHERE ft.id = $1::uuid AND ft.operating_company_id = $2::uuid AND ft.voided_at IS NULL AND ft.fuel_type = 'reefer_diesel'`,
            [r.id, USMCA],
          )
        : await q(
            `SELECT l.load_number, coalesce(el.trailer_id, e.trailer_id) trailer_id FROM accounting.expense_lines el
               JOIN accounting.expenses e ON e.id = el.expense_id JOIN mdata.loads l ON l.id = coalesce(el.load_id, e.load_id)
              WHERE el.id = $1::uuid AND e.operating_company_id = $2::uuid AND e.voided_at IS NULL`,
            [r.id, USMCA],
          );
    if (cur.length !== 1 || cur[0].load_number !== r.load || cur[0].trailer_id) throw new Error(`REFUSE: ${r.id} not as measured ${JSON.stringify(cur)}`);
    const trl = await q(`SELECT id::text FROM mdata.equipment WHERE equipment_number = $1 AND equipment_type = 'Reefer'`, [r.trailer]);
    if (trl.length !== 1) throw new Error(`REFUSE: trailer ${r.trailer} is not exactly one Reefer ${JSON.stringify(trl)}`);
    const res = await setReeferTrailer(c, USMCA, { source: r.source, source_id: r.id, trailer_id: trl[0].id });
    out.push({ id: r.id.slice(0, 8), load: r.load, trailer: r.trailer, settlement: r.settlement, updated: res.updated });
  }
  return out;
});
