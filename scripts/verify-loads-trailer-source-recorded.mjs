#!/usr/bin/env node
/**
 * verify-loads-trailer-source-recorded — ENG-13 (register row 251), Claude Lead 2026-11-02.
 *
 * LAW (LEAD 443.107 item 3, owner 2026-10-12): every booked load records WHICH trailer moved it, by an explicit
 * choice — company trailer, customer / broker trailer by number, interchange, or "none" (bobtail / power only).
 * Book Load and Edit Load refuse a booking without it (trailer_choice_required). Loads booked before that law
 * were back-filled from documents (AUTH-470/472: 128 -> 'company'); the last one, 13595, is a broker trailer 445
 * per Settlement 5816 + owner ruling 2026-11-02 (AUTH-473).
 *
 * GUARD (live, ceiling 0): no USMCA non-cancelled, non-voided load has trailer_source NULL, and every
 * trailer_source = 'customer' load names its dispatch.non_owned_trailers row (non_owned_trailer_id NOT NULL).
 * A NULL is a load the driver-bill / expense trailer inheritance cannot read — a silent gap, never allowed.
 *
 * Usage: node scripts/verify-loads-trailer-source-recorded.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-loads-trailer-source-recorded";
export const REQUIRES_LIVE_DB = "trailer_source is load data — only verifiable against the live database; fails closed without one";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const CEILING = 0;

/** Pure — the verdict for a measured state. */
export function verdict({ nullSource, customerWithoutTrailer }) {
  const problems = [];
  if (nullSource.length > CEILING) problems.push(`${nullSource.length} load(s) with trailer_source NULL (ceiling ${CEILING}): ${nullSource.join(", ")}`);
  if (customerWithoutTrailer.length) problems.push(`${customerWithoutTrailer.length} customer-trailer load(s) name no non_owned_trailer: ${customerWithoutTrailer.join(", ")}`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["clean state passes", verdict({ nullSource: [], customerWithoutTrailer: [] }).length === 0],
    ["one NULL fails and names the load", verdict({ nullSource: ["13595"], customerWithoutTrailer: [] })[0]?.includes("13595") === true],
    ["customer without trailer row fails", verdict({ nullSource: [], customerWithoutTrailer: ["13689"] }).length === 1],
    ["both problems both reported", verdict({ nullSource: ["1"], customerWithoutTrailer: ["2"] }).length === 2],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
let code = 1;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const base = `FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND l.voided_at IS NULL AND l.status::text <> 'cancelled'`;
  const nullSource = (await client.query(`SELECT l.load_number::text n ${base} AND l.trailer_source IS NULL ORDER BY 1`, [USMCA])).rows.map((r) => r.n);
  const customerWithoutTrailer = (await client.query(
    `SELECT l.load_number::text n ${base} AND l.trailer_source = 'customer' AND l.non_owned_trailer_id IS NULL ORDER BY 1`, [USMCA])).rows.map((r) => r.n);
  const total = (await client.query(`SELECT count(*)::int n ${base}`, [USMCA])).rows[0].n;
  await client.query("ROLLBACK");
  const problems = verdict({ nullSource, customerWithoutTrailer });
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`${LABEL} FAIL — ${total} USMCA live loads measured`);
  } else {
    console.log(`${LABEL} PASS — ${total} USMCA live loads, trailer_source NULL 0, customer loads without trailer row 0`);
    code = 0;
  }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`${LABEL} ERROR — ${e.message}`);
} finally {
  client.release?.();
  await pool?.end?.();
}
process.exit(code);
