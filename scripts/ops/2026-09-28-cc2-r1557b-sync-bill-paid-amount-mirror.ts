#!/usr/bin/env tsx
/**
 * ROUND 155.7 follow-up (same AUTH-088 scope). The 2026-09-28-cc2-r1557-backfill-bill-posting-
 * source-links.ts script synced accounting.bills.paid_cents (canonical) from each bill's own
 * bill_payments total, but ledger.ap_tieout's open-bill subledger SQL reads the DEPRECATED dollar
 * mirror `total_amount - paid_amount`, which that first script never touched -- paid_amount stayed
 * $0.00 for the same 68 Round-148-set-based bills even after paid_cents was corrected, so
 * ap_tieout's subledger figure was still $48,864.07 after the linkage backfill, unchanged. This
 * syncs the mirror. No amount_cents/paid_cents change, no GL touched, additive-only correction to
 * a column the schema itself documents as "do NOT write as an independent value" -- writing it to
 * MATCH the canonical paid_cents is exactly what that comment requires, not a violation of it.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r1557b-sync-bill-paid-amount-mirror.ts
 *     (dry-run: prints the mismatched rows, does not write)
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-088 npx tsx scripts/ops/2026-09-28-cc2-r1557b-sync-bill-paid-amount-mirror.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const apply = process.argv.includes("--apply");

if (apply) {
  const auth = process.env.OWNER_AUTH_ID;
  if (auth !== "AUTH-088") {
    console.error(`FAIL: --apply requires OWNER_AUTH_ID=AUTH-088 (got ${JSON.stringify(auth ?? null)}).`);
    process.exit(1);
  }
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia', true)`);

  const mismatched = await client.query<{ id: string; amount_cents: string; paid_cents: string; total_amount: string; paid_amount: string }>(
    `SELECT id, amount_cents, paid_cents, total_amount, paid_amount
       FROM accounting.bills
      WHERE operating_company_id = $1 AND revoked_at IS NULL
        AND round(paid_amount * 100)::bigint <> paid_cents
      ORDER BY id`,
    [USMCA]
  );
  console.log(`Found ${mismatched.rows.length} bill(s) where paid_amount mirror does not match canonical paid_cents.`);
  for (const r of mismatched.rows) console.log(`  ${r.id}: paid_cents=${r.paid_cents} paid_amount=${r.paid_amount} amount_cents=${r.amount_cents} total_amount=${r.total_amount}`);

  if (apply) {
    const res = await client.query(
      `UPDATE accounting.bills
          SET paid_amount = round(paid_cents / 100.0, 2)
        WHERE operating_company_id = $1 AND revoked_at IS NULL
          AND round(paid_amount * 100)::bigint <> paid_cents
        RETURNING id`,
      [USMCA]
    );
    console.log(`Synced paid_amount on ${res.rowCount} bill(s).`);
    const check = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.bills
        WHERE operating_company_id = $1 AND revoked_at IS NULL AND round(paid_amount * 100)::bigint <> paid_cents`,
      [USMCA]
    );
    if (check.rows[0].n !== "0") throw new Error(`REFUSED: ${check.rows[0].n} bill(s) still mismatched after update.`);
    await client.query("COMMIT");
    console.log("COMMITTED.");
  } else {
    await client.query("ROLLBACK");
    console.log("DRY RUN -- rolled back, no writes.");
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
