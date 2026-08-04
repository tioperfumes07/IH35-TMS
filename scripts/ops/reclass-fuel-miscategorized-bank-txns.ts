/**
 * FINANCIAL-HOLD — CLS-CATEGORY-MAP-COHERENCE step 4
 *
 * Reclass TRANSP bank txns miscategorized to Fuel → Repair & Maintenance / OTR Bridge & Toll.
 * For each posted row: reverseJournalEntryNoFlip (#4225 path) → stamp correct
 * categorization_gl_account_id → maybePostBankCategorizationToGl (EXISTING poster — no new GL math).
 *
 * Default = dry-run (list + verify only). Prod apply ONLY with:
 *   DATABASE_URL=... ACTOR_USER_UUID=... npx tsx scripts/ops/reclass-fuel-miscategorized-bank-txns.ts \
 *     --apply --i-understand-financial-hold
 *
 * Agent must NOT run --apply against prod.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { maybePostBankCategorizationToGl } from "../../apps/backend/src/banking/bank-feed-gl-posting.service.js";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("../lib/pg-connection-options.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = path.join(ROOT, "scripts/ops/fuel-miscategorization-reclass.manifest.json");

type ManifestItem = {
  bank_transaction_id: string;
  target_account_id: string;
  kind: string;
  amount_cents: number;
};

type Manifest = {
  operating_company_code: string;
  from_account_id: string;
  expected_net_cents: number;
  items: ManifestItem[];
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const holdAck = args.includes("--i-understand-financial-hold");

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

async function main() {
  const manifest = loadManifest();
  const net = manifest.items.reduce((s, i) => s + i.amount_cents, 0);
  if (net !== manifest.expected_net_cents) {
    throw new Error(
      `manifest sum ${net} != expected_net_cents ${manifest.expected_net_cents} — refuse to run`
    );
  }

  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");

  const actorUserUuid = process.env.ACTOR_USER_UUID?.trim();
  if (apply && !actorUserUuid) {
    throw new Error("ACTOR_USER_UUID required for --apply (poster + reverse actor)");
  }

  if (apply && !holdAck) {
    throw new Error("Refusing --apply without --i-understand-financial-hold");
  }

  const client = new pg.Client(buildPgClientConfig(cs));
  await client.connect();

  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const companyRes = await client.query<{ id: string }>(
      `SELECT id::text FROM org.companies WHERE code = $1 LIMIT 1`,
      [manifest.operating_company_code]
    );
    const companyId = companyRes.rows[0]?.id;
    if (!companyId) throw new Error(`company ${manifest.operating_company_code} not found`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);

    console.log(
      JSON.stringify(
        {
          mode: apply ? "APPLY" : "DRY_RUN",
          companyId,
          itemCount: manifest.items.length,
          expectedNetCents: manifest.expected_net_cents,
          expectedNetUsd: (manifest.expected_net_cents / 100).toFixed(2),
        },
        null,
        2
      )
    );

    let ok = 0;
    for (const item of manifest.items) {
      const rowRes = await client.query<{
        id: string;
        amount_cents: string;
        categorization_gl_account_id: string | null;
        matched_journal_entry_id: string | null;
        status: string | null;
        description: string | null;
      }>(
        `
          SELECT id::text, amount_cents::text, categorization_gl_account_id::text,
                 matched_journal_entry_id::text, status, description
          FROM banking.bank_transactions
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [item.bank_transaction_id, companyId]
      );
      const row = rowRes.rows[0];
      if (!row) {
        console.error(`MISSING ${item.bank_transaction_id}`);
        process.exitCode = 1;
        continue;
      }
      if (Number(row.amount_cents) !== item.amount_cents) {
        console.error(
          `AMOUNT_MISMATCH ${item.bank_transaction_id}: live=${row.amount_cents} manifest=${item.amount_cents}`
        );
        process.exitCode = 1;
        continue;
      }

      const plan = {
        id: item.bank_transaction_id,
        kind: item.kind,
        amount_cents: item.amount_cents,
        from: row.categorization_gl_account_id,
        to: item.target_account_id,
        prior_je: row.matched_journal_entry_id,
        status: row.status,
      };
      console.log(JSON.stringify({ plan }));

      if (!apply) {
        ok += 1;
        continue;
      }

      // Per-row transaction: reverse → clear → stamp (fail-closed like undo-categorization).
      await client.query("BEGIN");
      try {
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);

        const locked = await client.query<{ matched_journal_entry_id: string | null }>(
          `
            SELECT matched_journal_entry_id::text
            FROM banking.bank_transactions
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            FOR UPDATE
          `,
          [item.bank_transaction_id, companyId]
        );
        const priorJe = locked.rows[0]?.matched_journal_entry_id ?? null;
        if (priorJe) {
          await reverseJournalEntryNoFlip(client, {
            operatingCompanyId: companyId,
            journalEntryId: priorJe,
            reason: `reclass fuel miscategorization → ${item.kind} (${item.bank_transaction_id})`,
            actorUserId: actorUserUuid!,
          });
        }

        await client.query(
          `
            UPDATE banking.bank_transactions
            SET
              status = 'categorized',
              matched_journal_entry_id = NULL,
              category = $3,
              category_kind = 'expense',
              categorization_gl_account_id = $4::uuid,
              coa_account_id = $4::uuid,
              categorized_at = now(),
              skip_reason = NULL,
              investigate_note = NULL,
              updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
          `,
          [item.bank_transaction_id, companyId, item.kind === "tire" ? "maintenance" : "toll", item.target_account_id]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }

      const posting = await maybePostBankCategorizationToGl({
        companyId,
        actorUserUuid: actorUserUuid!,
        bankTransactionId: item.bank_transaction_id,
      });
      console.log(JSON.stringify({ applied: item.bank_transaction_id, posting }));
      ok += 1;
    }

    console.log(JSON.stringify({ done: true, processed: ok, mode: apply ? "APPLY" : "DRY_RUN" }));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
