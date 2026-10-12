#!/usr/bin/env node
// ROUND 130.2 (Lead, P0, permanent fix): mdata.loads_operating_company_id_load_number_key is
// UNIQUE (operating_company_id, load_number) with NO partial predicate -- a voided load that keeps
// its real load_number permanently blocks the AlwaysTrack feed from ever re-creating that load
// number. stampDocumentVoided() now renumbers `load` family rows to `VOID-<original>-<id8>` in the
// SAME UPDATE as the void stamp (void-document-stamp.service.ts). This guard verifies the invariant
// holds live: no voided USMCA load may hold a real (non-VOID-prefixed) load_number.
//
// A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B) -- no
// ALLOW_OFFLINE_SKIP declared.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-voided-loads-hold-no-real-number";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export const VOIDED_REAL_NUMBER_SQL = `
      SELECT id::text, load_number
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND status = 'voided'
        AND load_number NOT LIKE 'VOID%'
    `;

/** The query must stay scoped to the company, to voided loads, and to real (non-VOID) numbers. */
export function sqlShapeProblems(sql) {
  const p = [];
  if (!/operating_company_id = \$1::uuid/.test(sql)) p.push("not scoped to the company");
  if (!/status = 'voided'/.test(sql)) p.push("not scoped to voided loads");
  if (!/load_number NOT LIKE 'VOID%'/.test(sql)) p.push("does not isolate real (non-VOID) numbers");
  return p;
}

/** Rows the live query would return are the violations; mirror its predicate for the selftest. */
export function violations(rows) {
  return rows.filter((r) => r.status === "voided" && !String(r.load_number).startsWith("VOID"));
}

function selftest() {
  const planted = [
    ["voided load keeps a real number", violations([{ status: "voided", load_number: "13539" }]).length === 1],
    ["one bad among renumbered", violations([{ status: "voided", load_number: "VOID-13540-ab12cd34" }, { status: "voided", load_number: "13541" }]).length === 1],
    ["query drops the void filter", sqlShapeProblems(VOIDED_REAL_NUMBER_SQL.replace("AND status = 'voided'", "")).length > 0],
    ["query drops the real-number filter", sqlShapeProblems(VOIDED_REAL_NUMBER_SQL.replace("AND load_number NOT LIKE 'VOID%'", "")).length > 0],
    ["query unscoped", sqlShapeProblems(VOIDED_REAL_NUMBER_SQL.replace("operating_company_id = $1::uuid", "true")).length > 0],
  ];
  const caught = planted.filter(([, ok]) => ok).length;
  for (const [name, ok] of planted) if (!ok) console.error(`${LABEL} SELFTEST: planted violation escaped — ${name}`);
  const clean = violations([{ status: "voided", load_number: "VOID-13539-ab12cd34" }, { status: "delivered", load_number: "13542" }]).length === 0
    && sqlShapeProblems(VOIDED_REAL_NUMBER_SQL).length === 0;
  if (!clean) console.error(`${LABEL} SELFTEST: clean input flagged`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && clean ? 0 : 1);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(VOIDED_REAL_NUMBER_SQL, [USMCA]);

    await client.query("ROLLBACK");

    if (res.rows.length > 0) {
      console.error(`${LABEL}: FAIL — ${res.rows.length} voided USMCA load(s) still hold a real (non-VOID-prefixed) load_number:`);
      for (const r of res.rows.slice(0, 30)) {
        console.error(`  ✗ load=${r.id} load_number="${r.load_number}"`);
      }
      console.error(`${LABEL}: stampDocumentVoided()'s 'load' family renumbering did not apply. Every voided load blocks the AlwaysTrack feed from re-creating that number.`);
      process.exit(1);
    }

    console.log(`${LABEL}: OK — 0 voided USMCA loads hold a real load_number. Required value achieved.`);
    process.exit(0);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL —`, e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
