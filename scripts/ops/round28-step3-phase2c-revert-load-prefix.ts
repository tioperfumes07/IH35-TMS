#!/usr/bin/env tsx
// ROUND 29.5 owner ruling (2026-09-22) — item 2, second half: revert the 17 "Load {number} — "
// description prefixes Phase 2B's gap-fill applied as a workaround for
// uq_settlement_lines_no_duplicate_lines missing load_id. The REAL fix
// (db/migrations/202614170000_settlement_lines_duplicate_key_includes_load_id.sql) now includes
// load_id in that index, so two different loads' identical bare AlwaysTrack text no longer collides
// — the prefix workaround is no longer needed and is reverted here, in the same PR that ships the
// migration, per the ruling: "the description belongs to the document."
//
// Scope: EXACTLY the 17 rows Phase 2B created (identified by their own settlement_lines id, not by
// pattern-matching "Load N — " text — a live check found that prefix is ALSO the pre-existing house
// convention on every earnings/deadhead_pay/escrow_contribution line system-wide, predating this
// session; touching those would be far out of scope and wrong). Pure text UPDATE on `description`
// only — no amount/line_type/load_id/status/posting_account_id touched, no dollar impact, no GL
// impact. Each row's driver_reimbursements/driver_settlement_deductions source row's own `reason`
// column is left untouched (it never carried the prefix in the first place — only the settlement_lines
// description did).
import pg from "pg";

const ROWS: { id: string; from: string; to: string }[] = [
  { id: "41186644-a9f7-41c0-b42c-268f3f45404e", from: "Load 13592 — Driver Pay-Enlonada", to: "Driver Pay-Enlonada" },
  { id: "0979cf7c-bc04-400b-8e58-ff8e9767167b", from: "Load 13592 — Driver Pay-Desenlonada", to: "Driver Pay-Desenlonada" },
  { id: "bd111523-d544-4b90-b7b5-628e363e6a5d", from: "Load 13591 — Driver Pay-Enlonada", to: "Driver Pay-Enlonada" },
  { id: "86cd0f63-ad81-409c-89e8-367398686883", from: "Load 13591 — Driver Pay-Desenlonada", to: "Driver Pay-Desenlonada" },
  { id: "62d31a75-ea80-4608-8a45-b3efdd702c48", from: "Load 13585 — Driver-Escrow For Claims", to: "Driver-Escrow For Claims" },
  { id: "bb35f367-51a5-42ff-b1b4-0c69b3298cf5", from: "Load 13601 — Driver Pay-Enlonada", to: "Driver Pay-Enlonada" },
  { id: "a5190f71-5bb8-4d72-8d51-9a0e3b69ce5c", from: "Load 13601 — Driver Pay-Desenlonada", to: "Driver Pay-Desenlonada" },
  { id: "85f9c747-7252-4616-ae5a-dac37d6ead5c", from: "Load 13606 — Driver-Escrow For Claims", to: "Driver-Escrow For Claims" },
  // EXCEPTION, found live: this load's OWN OTHER "Driver Pay-Extra Pick Up" $25.00 line (Phase 2's
  // first run) already reverted to bare text on this same load_id — the document itself lists this
  // exact item TWICE for load 13599 (two real, separate $25.00 charges), so two truly-identical rows
  // (same settlement+load+type+description+amount) collide under ANY unique index regardless of key
  // design; this is not the load_id-omission bug the migration fixed, it is a genuine same-load
  // duplicate-text line that always needs one distinguishing detail. Left prefixed, disclosed.
  // { id: "90d8ce74-0627-401e-b6da-fed2bf71ea6d", from: "Load 13599 — Driver Pay-Extra Pick Up", to: "Driver Pay-Extra Pick Up" },
  { id: "3cda7b89-19f6-464b-9b91-cb44357b0690", from: "Load 13603 — Driver Pay-Enlonada", to: "Driver Pay-Enlonada" },
  { id: "545139cd-fb39-491a-a61f-9dee78b3df83", from: "Load 13603 — Driver Pay-Desenlonada", to: "Driver Pay-Desenlonada" },
  { id: "081c0b11-d5ed-4961-a288-7ee0a393fc5b", from: "Load 13600 — Driver-Escrow For Claims", to: "Driver-Escrow For Claims" },
  { id: "1ea7ec56-86a4-4cfd-b586-607a0d3c472b", from: "Load 13607 — Driver Pay-Enlonada", to: "Driver Pay-Enlonada" },
  { id: "35210b95-f6d3-43cc-bec6-a30324bd094c", from: "Load 13607 — Driver Pay-Desenlonada", to: "Driver Pay-Desenlonada" },
  { id: "bb72f633-9284-4d30-8c83-6577f035abbf", from: "Load 13608 — Driver Pay-Enlonada", to: "Driver Pay-Enlonada" },
  { id: "7979692e-2b9c-4180-9615-68450ccfa403", from: "Load 13608 — Driver Pay-Desenlonada", to: "Driver Pay-Desenlonada" },
  { id: "d12c5325-32a6-4bb6-b5ac-c49dbc78762a", from: "Load 13611 — Driver-Escrow For Claims", to: "Driver-Escrow For Claims" },
];

async function main() {
  const execute = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (execute && !process.env.ROUND263_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND263_ALLOW_HOST.");
  if (execute && !url.includes(process.env.ROUND263_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL does not match ROUND263_ALLOW_HOST.");

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', ${execute ? "true" : "false"})`);
  let ok = 0;
  for (const row of ROWS) {
    const cur = await client.query<{ description: string }>(`SELECT description FROM driver_finance.settlement_lines WHERE id = $1::uuid`, [row.id]);
    const current = cur.rows[0]?.description;
    if (current !== row.from) {
      console.log(`- SKIP ${row.id}: current description "${current}" != expected "${row.from}" (already reverted or drifted)`);
      continue;
    }
    console.log(`- REVERT ${row.id}: "${row.from}" -> "${row.to}"`);
    if (execute) {
      await client.query(`UPDATE driver_finance.settlement_lines SET description = $2 WHERE id = $1::uuid AND description = $3`, [row.id, row.to, row.from]);
    }
    ok += 1;
  }
  console.log(`\n${ok}/${ROWS.length} rows ${execute ? "reverted" : "would be reverted"}.`);
  if (!execute) console.log("DRY RUN ONLY -- pass --execute with ROUND263_ALLOW_HOST set to actually run.");
  client.release();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
