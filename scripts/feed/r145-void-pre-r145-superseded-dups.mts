#!/usr/bin/env tsx
/**
 * AUTH-080 — void pre-R145 expense headers superseded by AUTH-076 set-based seed.
 *
 * Identify set-based: live non-fuel settlement expenses (5769–5816) whose memo is NOT
 * 'R145 SETTL…' and that have an R145 twin on the same settlement_ref + line (amount_cents,
 * item_id). Void each via existing voidDocument(type='expense'). Keep R145 AT-dated rows.
 *
 *   OWNER_AUTH_ID=AUTH-080 npx tsx scripts/feed/r145-void-pre-r145-superseded-dups.mts
 *   OWNER_AUTH_ID=AUTH-080 npx tsx scripts/feed/r145-void-pre-r145-superseded-dups.mts --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000001";
const APPLY = process.argv.includes("--apply");

const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("OWNER_AUTH_ID required");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], {
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const DATABASE_URL = process.env.DATABASE_URL.replace("-pooler.", ".");

async function main() {
  const { voidDocument } = await import("../../apps/backend/src/accounting/void-document.js");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

    const dups = await client.query<{ id: string; ref: string; cents: string; expense_number: string | null }>(
      `SELECT DISTINCT e.id::text AS id,
              e.source_settlement_ref AS ref,
              e.total_amount_cents::text AS cents,
              e.expense_number
         FROM accounting.expenses e
         JOIN accounting.expense_lines el ON el.expense_id = e.id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND coalesce(e.is_sample_data,false)=false
          AND e.source_fuel_transaction_id IS NULL
          AND e.source_settlement_ref ~ '^[0-9]{4}$'
          AND e.source_settlement_ref::int BETWEEN 5769 AND 5816
          AND e.memo NOT LIKE 'R145 SETTL%'
          AND EXISTS (
            SELECT 1
              FROM accounting.expenses e2
              JOIN accounting.expense_lines el2 ON el2.expense_id = e2.id
             WHERE e2.operating_company_id = e.operating_company_id
               AND e2.voided_at IS NULL
               AND e2.memo LIKE 'R145 SETTL%'
               AND e2.source_settlement_ref = e.source_settlement_ref
               AND el2.amount_cents = el.amount_cents
               AND el2.item_id IS NOT DISTINCT FROM el.item_id
               AND e2.id <> e.id
          )
        ORDER BY e.source_settlement_ref, e.expense_number`,
      [USMCA]
    );

    const sumCents = dups.rows.reduce((s, r) => s + Number(r.cents), 0);
    console.log(`superseded_pre_r145: n=${dups.rows.length} cents=${sumCents}`);
    if (dups.rows.length === 0) {
      console.log("nothing to void");
      await client.query("ROLLBACK");
      return;
    }

    if (!APPLY) {
      for (const r of dups.rows.slice(0, 10)) {
        console.log(`DRY-RUN would void ${r.ref} ${r.expense_number} ${r.id} $${(Number(r.cents) / 100).toFixed(2)}`);
      }
      if (dups.rows.length > 10) console.log(`... +${dups.rows.length - 10} more`);
      await client.query("ROLLBACK");
      return;
    }

    let voided = 0;
    for (const r of dups.rows) {
      await voidDocument(client as never, {
        type: "expense",
        id: r.id,
        operatingCompanyId: USMCA,
        actorUserId: SYSTEM_ACTOR,
        reason: `AUTH-080 pre-R145 superseded by AUTH-076 AT-dated seed (doc ${r.ref})`,
      });
      voided += 1;
      if (voided % 10 === 0) console.log(`voided ${voided}/${dups.rows.length}`);
    }

    const left = await client.query<{ n: string; cents: string }>(
      `SELECT count(*)::text AS n, coalesce(sum(e.total_amount_cents),0)::text AS cents
         FROM accounting.expenses e
         JOIN accounting.expense_lines el ON el.expense_id = e.id
        WHERE e.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
          AND coalesce(e.is_sample_data,false)=false
          AND e.source_fuel_transaction_id IS NULL
          AND e.source_settlement_ref ~ '^[0-9]{4}$'
          AND e.source_settlement_ref::int BETWEEN 5769 AND 5816
          AND e.memo NOT LIKE 'R145 SETTL%'
          AND EXISTS (
            SELECT 1
              FROM accounting.expenses e2
              JOIN accounting.expense_lines el2 ON el2.expense_id = e2.id
             WHERE e2.memo LIKE 'R145 SETTL%'
               AND e2.source_settlement_ref = e.source_settlement_ref
               AND el2.amount_cents = el.amount_cents
               AND el2.item_id IS NOT DISTINCT FROM el.item_id
               AND e2.voided_at IS NULL
               AND e2.id <> e.id
          )`,
      [USMCA]
    );
    if (Number(left.rows[0]!.n) !== 0) {
      throw new Error(`STOP: ${left.rows[0]!.n} superseded dups remain`);
    }

    const exp5812 = await client.query<{ cents: string }>(
      `SELECT coalesce(sum(total_amount_cents),0)::text AS cents
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
          AND source_fuel_transaction_id IS NULL
          AND coalesce(is_sample_data,false)=false
          AND (source_settlement_ref = '5812'
               OR load_id IN (SELECT id FROM mdata.loads WHERE load_number IN ('13588','13600') AND operating_company_id = $1::uuid))`,
      [USMCA]
    );
    console.log(`voided=${voided}; 5812 company-exp cents=${exp5812.rows[0]!.cents} (AT 59362)`);

    await client.query("COMMIT");
    console.log(JSON.stringify({ voided, exp_5812_cents: Number(exp5812.rows[0]!.cents) }));
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
