#!/usr/bin/env node
/**
 * verify-deadhead-where-previous-load — RULING 443.86 #1 (G5 "deadhead where a previous load exists"), CC-3.
 *   STATIC  S1 INVERTED by LEAD RULING 15:10Z #2 ("Empty (deadhead) miles: Settlement Creator = the signed document's
 *              empty miles ONLY; never auto-filled from the engine; blank when the document has none"): the Creator seed
 *              books miles_deadhead = the document's empty miles and NEVER calls fillLoadDeadhead (code, not comments);
 *              S2 the engine records its method (google_practical_prev_stop / _samsara_position) and never replaces a
 *              value (UPDATE ... AND miles_deadhead IS NULL).
 *   LIVE    L1 0 live invoiced loads in an enforcing company (USMCA) with miles_deadhead NULL while the same unit has a
 *              load with an earlier first pickup — Creator-seeded loads excluded (their deadhead is the document's, and
 *              blank is correct when the document prints none).
 * --selftest plants each failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "deadhead is live load data — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-deadhead-where-previous-load";
const F = {
  creator: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts",
  engine: "apps/backend/src/dispatch/mileage/miles-recommendations.service.ts",
};
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function staticFailures(src) {
  const f = [];
  const creatorCode = src.creator.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/\bfillLoadDeadhead\b|\bfillDeadheadAtBooking\b/.test(creatorCode)) f.push(`S1 ${F.creator}: the Creator fills deadhead from the miles engine — Lead 15:10Z #2: the signed document's empty miles ONLY`);
  if (!/miles_deadhead:\s*load\.empty_miles \?\? null,/.test(creatorCode)) f.push(`S1 ${F.creator}: the Creator must book miles_deadhead = the document's empty miles (load.empty_miles ?? null), verbatim`);
  if (!/method = "google_practical_samsara_position"/.test(src.engine) || !/"google_practical_prev_stop"/.test(src.engine)) f.push(`S2 ${F.engine}: the deadhead method is not recorded`);
  if (!/SET miles_deadhead = \$3::numeric, deadhead_miles_calculation_method = \$4,[\s\S]{0,200}AND miles_deadhead IS NULL/.test(src.engine)) f.push(`S2 ${F.engine}: the fill may replace an existing deadhead`);
  return f;
}

export function liveFailures(m) {
  return Number(m.null_with_previous) === 0 ? [] : [`L1 ${m.null_with_previous} live invoiced load(s) with NULL deadhead and a previous load on the unit (e.g. ${m.sample ?? "?"})`];
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const r = (await client.query(
    `WITH s AS (
       SELECT l.id, l.load_number, l.assigned_unit_id u, l.miles_deadhead,
              COALESCE(l.notes, '') LIKE 'Settlement Creator R-186.1 seed%' AS creator,
              (SELECT min(COALESCE(st.appointment_start_at, st.scheduled_arrival_at)) FROM mdata.load_stops st
                WHERE st.load_id = l.id AND st.soft_deleted_at IS NULL) fp
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL
          AND l.id IN (SELECT source_load_id FROM accounting.invoices WHERE operating_company_id = $1::uuid AND voided_at IS NULL))
     SELECT count(*) AS null_with_previous, min(load_number) AS sample FROM s
      WHERE miles_deadhead IS NULL AND NOT creator AND EXISTS (SELECT 1 FROM s p WHERE p.u = s.u AND p.fp < s.fp)`, [USMCA])).rows[0];
  await client.query("ROLLBACK");
  return r;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = { creator: readFileSync(join(ROOT, F.creator), "utf8"), engine: readFileSync(join(ROOT, F.engine), "utf8") };
  if (process.argv.includes("--selftest")) {
    const plant = (k, from, to) => ({ ...src, [k]: src[k].split(from).join(to) });
    const cases = [
      ["the real sources pass", staticFailures(src).length === 0],
      ["a Creator that fills deadhead from the engine fails S1 (origin/main shape)", staticFailures(plant("creator", "      miles_deadhead: load.empty_miles ?? null,", "      miles_deadhead: load.empty_miles ?? null,\n    }; if (bookedId && load.empty_miles == null) { await fillLoadDeadhead(client, {}); } const _x = {")).some((x) => x.startsWith("S1"))],
      ["a Creator booking deadhead from anything but the document fails S1", staticFailures(plant("creator", "miles_deadhead: load.empty_miles ?? null,", "miles_deadhead: load.empty_miles ?? recs.empty ?? null,")).some((x) => x.startsWith("S1"))],
      ["a comment naming fillLoadDeadhead is not code", staticFailures(plant("creator", "miles_deadhead: load.empty_miles ?? null,", "// fillLoadDeadhead is not called\n      miles_deadhead: load.empty_miles ?? null,")).length === 0],
      ["an engine without the method fails S2", staticFailures(plant("engine", 'method = "google_practical_samsara_position"', 'method = null')).some((x) => x.startsWith("S2"))],
      ["an overwriting fill fails S2", staticFailures(plant("engine", "AND miles_deadhead IS NULL`,\n    [args.loadId, args.operatingCompanyId, miles", "`,\n    [args.loadId, args.operatingCompanyId, miles")).some((x) => x.startsWith("S2"))],
      ["0 nulls passes L1", liveFailures({ null_with_previous: 0 }).length === 0],
      ["a null with a previous load fails L1", liveFailures({ null_with_previous: 3, sample: "13500" }).some((x) => x.startsWith("L1"))],
    ];
    for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = staticFailures(src);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    let lf = [];
    try { const m = await measure(client); lf = liveFailures(m); console.log(`  null deadhead with a previous load: ${m.null_with_previous}`); }
    catch (err) { await client.query("ROLLBACK").catch(() => {}); lf = [`L0 the live check could not run — ${err?.message ?? err}`]; }
    const all = [...sf, ...lf];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — every live invoiced load with a previous load on its unit has a deadhead.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
