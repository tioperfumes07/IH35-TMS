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

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const res = await client.query(`
      SELECT id::text, load_number
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND status = 'voided'
        AND load_number NOT LIKE 'VOID%'
    `, [USMCA]);

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

main();
