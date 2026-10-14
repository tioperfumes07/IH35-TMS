#!/usr/bin/env node
/**
 * Close CC-3 fuel_event load-null cohort: Owner history path
 * (apps/backend/src/fuel/fuel-receipt-repoint.service.ts → repointAllFuelReceipts).
 *
 * Attaches every posted load-less fuel/Relay receipt a load now covers through the ONE
 * fuel-to-load rule. Same JE + same expense document move — no re-post, no invent.
 *
 *   default          DRY RUN (one transaction, rolled back)
 *   --apply --auth AUTH-NNN   apply on production
 *
 * Proof: candidates · attached · planned · no_covering_load · refused · seconds · single txn.
 */
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { repointAllFuelReceipts } from "../../apps/backend/src/fuel/fuel-receipt-repoint.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}

const t0 = Date.now();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "fuel receipt repoint load-null" });

await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);

  const before = (
    await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event' AND load_id IS NULL`,
      [USMCA]
    )
  ).rows[0]!.n;

  const outcomes = await repointAllFuelReceipts(db as never, {
    operatingCompanyId: USMCA,
    actorUserId: OWNER,
    dryRun: !APPLY,
  });

  const tallies = { attached: 0, planned: 0, no_covering_load: 0, refused: 0 };
  for (const o of outcomes) {
    if (o.outcome in tallies) tallies[o.outcome as keyof typeof tallies] += 1;
  }
  const refused = outcomes.filter((o) => o.outcome === "refused");

  const after = (
    await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'fuel_event' AND load_id IS NULL`,
      [USMCA]
    )
  ).rows[0]!.n;

  const seconds = (Date.now() - t0) / 1000;
  console.log(
    JSON.stringify(
      {
        dry_run: !APPLY,
        auth: auth || null,
        candidates: outcomes.length,
        ...tallies,
        postings_null_load_before: before,
        postings_null_load_after: after,
        refused_detail: refused.map((r) => ({ fill_id: r.fill_id, reason: r.reason })),
        batches: 1,
        seconds,
        single_transaction_per_batch: true,
      },
      null,
      2
    )
  );

  await db.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
