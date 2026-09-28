#!/usr/bin/env tsx
/**
 * AUTH-082 — void the two 5812 residual dups AUTH-080's ref+item_id set missed.
 *
 *   13600-10 3d07eb3f… $15.69 DEF (ref NULL; R145 twin 13600-13)
 *   13600-1  955cb68d… $55.21 washout (item Reefer vs R145 TRACTOR twin 13588-4)
 *
 *   OWNER_AUTH_ID=AUTH-082 npx tsx scripts/feed/r145-void-5812-residual-dups.mts
 *   OWNER_AUTH_ID=AUTH-082 npx tsx scripts/feed/r145-void-5812-residual-dups.mts --apply
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR = "00000000-0000-4000-8000-000000000001";
const APPLY = process.argv.includes("--apply");

const TARGETS = [
  {
    id: "3d07eb3f-3888-4061-b28a-e6d22e89e90f",
    expense_number: "13600-10",
    cents: 1569,
  },
  {
    id: "955cb68d-f6c0-49fe-b98c-1cb01fb0c39f",
    expense_number: "13600-1",
    cents: 5521,
  },
] as const;

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
  const { voidDocument } = await import("../../apps/backend/src/accounting/void-document.service.js");
  const { stampDocumentVoided } = await import("../../apps/backend/src/accounting/void-document-stamp.service.js");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const businessDate = new Date().toISOString().slice(0, 10);
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

    const ids = TARGETS.map((t) => t.id);
    const live = await client.query<{
      id: string;
      expense_number: string | null;
      cents: string;
      voided: boolean;
    }>(
      `SELECT id::text AS id,
              expense_number,
              total_amount_cents::text AS cents,
              (voided_at IS NOT NULL) AS voided
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
          AND id = ANY($2::uuid[])
        ORDER BY expense_number`,
      [USMCA, ids]
    );

    if (live.rows.length !== TARGETS.length) {
      throw new Error(`STOP: expected ${TARGETS.length} rows, found ${live.rows.length}`);
    }
    for (const t of TARGETS) {
      const row = live.rows.find((r) => r.id === t.id);
      if (!row) throw new Error(`STOP: missing ${t.expense_number}`);
      if (row.voided) throw new Error(`STOP: ${t.expense_number} already voided`);
      if (Number(row.cents) !== t.cents) {
        throw new Error(`STOP: ${t.expense_number} cents ${row.cents} ≠ ${t.cents}`);
      }
      if (row.expense_number !== t.expense_number) {
        throw new Error(`STOP: id ${t.id} number ${row.expense_number} ≠ ${t.expense_number}`);
      }
    }

    console.log(
      `residual_5812_dups: n=${TARGETS.length} cents=${TARGETS.reduce((s, t) => s + t.cents, 0)}`
    );
    for (const t of TARGETS) {
      console.log(`  ${t.expense_number} ${t.id} $${(t.cents / 100).toFixed(2)}`);
    }

    if (!APPLY) {
      console.log("DRY-RUN — pass --apply to void");
      await client.query("ROLLBACK");
      return;
    }

    let voided = 0;
    for (const t of TARGETS) {
      const reason = `AUTH-082 residual 5812 dup superseded by AUTH-076 R145 twin (${t.expense_number})`;
      await voidDocument(client as never, {
        type: "expense",
        id: t.id,
        operatingCompanyId: USMCA,
        reason,
        actor: { userId: SYSTEM_ACTOR, role: "Owner" },
        currentBusinessDate: businessDate,
      });
      await stampDocumentVoided(client as never, {
        operatingCompanyId: USMCA,
        family: "expense",
        documentId: t.id,
        voidReason: reason,
        voidedByUserId: SYSTEM_ACTOR,
      });
      voided += 1;
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
    const cents = Number(exp5812.rows[0]!.cents);
    if (cents !== 59362) {
      throw new Error(`STOP: 5812 company-exp cents=${cents} (want 59362)`);
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({ voided, exp_5812_cents: cents }));
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
