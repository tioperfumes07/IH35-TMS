#!/usr/bin/env tsx
/**
 * ROUND 443.22-2f — OPTION 2 (owner): backfill Scentsx related-party loan facility ONLY
 * through createRelatedPartyLoanEntry (document + bank reverse pointer). No JE rewrite.
 *
 * HOLD Jorge (2410-00-001) and Tio Perfumes 2 (2410-00-003) until debit-balance ruling.
 * Laura (2410-00-004) has 0 live lines — nothing to backfill.
 *
 * 9 live Scentsx bank-categorization lines (proposal appendix), chrono:
 *   IN  bank_funding   ×8  then  OUT bank_repayment ×1 (07-22 returned $2,000)
 * Net open after backfill: +$11,450.00. Interest 400 bps (4.00% bank default).
 *
 * Rule 53: ONE transaction for the whole set. Engine calls batched on one client.
 * POSTS NOTHING to the GL — create writer is document-only; GL already on the bank cats.
 *
 * Dry run default. Writes only with:
 *   DATABASE_URL=<neon> npx tsx scripts/ops/r44322-2f-scentsx-option2-backfill.ts \
 *     --actor-user-id <Owner uuid> --execute --expect-host <DATABASE_URL host>
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { register } from "tsx/esm/api";
register();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SCENTSX_ACCOUNT_ID = "7e755038-8385-4453-8934-fef604656471";
const SCENTSX_ACCOUNT_NUMBER = "2410-00-002";
const INTEREST_RATE_BPS = 400;
const EXPECTED_OPEN_CENTS = 1_145_000;
const EXPECTED_LINE_COUNT = 9;

/** Chrono from docs/bus/RELATED-PARTY-LOAN-BACKFILL-PROPOSAL-44322-2f.json (Scentsx only). */
const SCENTSX_LINES = [
  {
    bank_transaction_id: "0ae38f7e-08d4-430d-8004-e68e4136bb5b",
    entry_date: "2026-04-14",
    principal_cents: 30_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Online transfer from CHK 2080 Confirmation# d3veahbj0; SCENTSX LLC",
  },
  {
    bank_transaction_id: "3338ac76-0d6a-4717-832b-c5b3ee9d33be",
    entry_date: "2026-05-26",
    principal_cents: 30_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Mobile transfer from CHK 2080 Confirmation# c7fopz1cn; SCENTSX LLC",
  },
  {
    bank_transaction_id: "5d21b1bc-f7a0-4f2e-8032-52df6390be50",
    entry_date: "2026-05-28",
    principal_cents: 40_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Mobile transfer from CHK 2080 Confirmation# fjifp8seo; SCENTSX LLC",
  },
  {
    bank_transaction_id: "e769a4c9-e978-4af0-ab92-1be0a62e1c7c",
    entry_date: "2026-06-24",
    principal_cents: 500_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Mobile transfer from CHK 2080 Confirmation# fd9mlt6jy; SCENTSX LLC",
  },
  {
    bank_transaction_id: "18b97368-f7f8-4394-8445-b6f89ea2075d",
    entry_date: "2026-07-21",
    principal_cents: 200_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Mobile transfer from CHK 2080 Confirmation# ahx5rnbih; SCENTSX LLC",
  },
  {
    bank_transaction_id: "6b7cbc72-1371-4cb4-a8db-4e80f10ea082",
    entry_date: "2026-07-22",
    principal_cents: 200_000,
    direction: "out" as const,
    target_type: "bank_repayment" as const,
    note: "Returned: Mobile transfer from CHK 2080 Confirmation# ahx5rnbih; SCENTSX LLC",
  },
  {
    bank_transaction_id: "b1bb738d-29df-4629-8e0a-7e0c91e5b2bc",
    entry_date: "2026-07-27",
    principal_cents: 5_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Mobile transfer from CHK 2080 Confirmation# hg2u5vias; SCENTSX LLC",
  },
  {
    bank_transaction_id: "75094f3d-81b0-44de-9b26-31f7aaade9cd",
    entry_date: "2026-07-28",
    principal_cents: 490_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Online transfer from CHK 2080 Confirmation# l4yfuhrhr; SCENTSX LLC",
  },
  {
    bank_transaction_id: "bfafd9fc-2a0c-4e5e-9c0e-a220224278cc",
    entry_date: "2026-09-23",
    principal_cents: 50_000,
    direction: "in" as const,
    target_type: "bank_funding" as const,
    note: "Online transfer from CHK 2080 Confirmation# chjhr3hco; SCENTSX LLC",
  },
] as const;

if (SCENTSX_LINES.length !== EXPECTED_LINE_COUNT) {
  throw new Error(`SCENTSX_LINES must be ${EXPECTED_LINE_COUNT}`);
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const actorUserId = arg("--actor-user-id");
  const expectHost = arg("--expect-host");
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_DIRECT_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is required");
  if (!actorUserId || !/^[0-9a-f-]{36}$/i.test(actorUserId)) {
    throw new Error("--actor-user-id <Owner uuid> is required");
  }
  if (execute && (!expectHost || new URL(url).hostname !== expectHost)) {
    throw new Error(
      "--execute needs --expect-host equal to DATABASE_URL's host (refusing to write to an unnamed database)"
    );
  }

  const { createRelatedPartyLoanEntry } = await import(
    path.join(ROOT, "apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts")
  );
  const { getFacilityOpenBalanceCents } = await import(
    path.join(ROOT, "apps/backend/src/accounting/related-party-loan-posting/facility.service.ts")
  );

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const t0 = Date.now();
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.current_user_id', $1::text, true)", [actorUserId]);
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

    const actor = await client.query(
      `SELECT role FROM identity.users WHERE id = $1::uuid AND deactivated_at IS NULL`,
      [actorUserId]
    );
    if (actor.rows[0]?.role !== "Owner") throw new Error("--actor-user-id must be an active Owner");

    const acct = await client.query(
      `SELECT id::text, account_number FROM catalogs.accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL`,
      [SCENTSX_ACCOUNT_ID, USMCA]
    );
    if (!acct.rows[0] || acct.rows[0].account_number !== SCENTSX_ACCOUNT_NUMBER) {
      throw new Error(`Scentsx account ${SCENTSX_ACCOUNT_ID} / ${SCENTSX_ACCOUNT_NUMBER} not found for USMCA`);
    }

    // Fail closed if Jorge / Tio bank lines sneak into this Option-2 script.
    const bankIds = SCENTSX_LINES.map((l) => l.bank_transaction_id);
    const bankRows = await client.query(
      `SELECT id::text, matched_related_party_loan_id::text AS loan_id, voided_at
         FROM banking.bank_transactions
        WHERE operating_company_id = $1::uuid
          AND id = ANY($2::uuid[])`,
      [USMCA, bankIds]
    );
    if (bankRows.rows.length !== EXPECTED_LINE_COUNT) {
      throw new Error(
        `Expected ${EXPECTED_LINE_COUNT} USMCA bank rows for Scentsx lines; got ${bankRows.rows.length}`
      );
    }
    const byId = new Map(bankRows.rows.map((r) => [String(r.id), r]));

    const results: Array<Record<string, unknown>> = [];
    let created = 0;
    let skipped = 0;
    let facilityId: string | null = null;

    for (const line of SCENTSX_LINES) {
      const bt = byId.get(line.bank_transaction_id);
      if (!bt) throw new Error(`missing bank tx ${line.bank_transaction_id}`);
      if (bt.voided_at) throw new Error(`bank tx ${line.bank_transaction_id} is voided — stop`);
      if (bt.loan_id) {
        skipped += 1;
        results.push({
          bank_transaction_id: line.bank_transaction_id,
          entry_date: line.entry_date,
          status: "skipped_already_linked",
          loan_id: bt.loan_id,
        });
        continue;
      }

      const out = await createRelatedPartyLoanEntry(
        client,
        {
          operating_company_id: USMCA,
          direction: line.direction,
          relationship: "related_company",
          counterparty_kind: "company",
          counterparty_name: "Scentsx",
          account_id: SCENTSX_ACCOUNT_ID,
          target_type: line.target_type,
          principal_cents: line.principal_cents,
          entry_date: line.entry_date,
          interest_rate_bps: INTEREST_RATE_BPS,
          interest_method: "simple",
          funding_source_note: `443.22-2f Option 2 backfill: ${line.note}`,
          bank_transaction_id: line.bank_transaction_id,
        },
        actorUserId
      );

      if ("error" in out) {
        throw new Error(
          `createRelatedPartyLoanEntry failed for ${line.bank_transaction_id}: ${JSON.stringify(out)}`
        );
      }
      created += 1;
      facilityId = out.facility_id;
      results.push({
        bank_transaction_id: line.bank_transaction_id,
        entry_date: line.entry_date,
        status: "created",
        loan_id: out.id,
        display_id: out.display_id,
        document_kind: out.document_kind,
        facility_id: out.facility_id,
        principal_cents: line.principal_cents,
        target_type: line.target_type,
      });
    }

    if (!facilityId) {
      const existing = await client.query(
        `SELECT id::text FROM accounting.related_party_loan_facilities
          WHERE operating_company_id = $1::uuid AND account_id = $2::uuid
            AND deleted_at IS NULL AND is_active LIMIT 1`,
        [USMCA, SCENTSX_ACCOUNT_ID]
      );
      facilityId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;
    }
    if (!facilityId) throw new Error("no Scentsx facility after backfill");

    const openCents = await getFacilityOpenBalanceCents(client, USMCA, facilityId);
    const entryCount = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM accounting.related_party_loan_entries
        WHERE operating_company_id = $1::uuid
          AND facility_id = $2::uuid
          AND deleted_at IS NULL
          AND status IS DISTINCT FROM 'reversed'`,
      [USMCA, facilityId]
    );
    const n = Number(entryCount.rows[0]?.n ?? 0);

    // HOLD assertion — this script must never touch Jorge / Tio facilities.
    const foreign = await client.query(
      `SELECT a.account_number, COUNT(e.id)::int AS n
         FROM accounting.related_party_loan_entries e
         JOIN catalogs.accounts a ON a.id = e.account_id
        WHERE e.operating_company_id = $1::uuid
          AND a.account_number IN ('2410-00-001', '2410-00-003')
          AND e.deleted_at IS NULL
          AND e.funding_source_note ILIKE '%443.22-2f Option 2%'
        GROUP BY a.account_number`,
      [USMCA]
    );
    if (foreign.rows.length > 0) {
      throw new Error(`Option 2 must HOLD Jorge/Tio — found foreign rows: ${JSON.stringify(foreign.rows)}`);
    }

    const seconds = (Date.now() - t0) / 1000;
    const report = {
      mode: execute ? "EXECUTE" : "DRY_RUN",
      option: 2,
      person: "Scentsx",
      account_number: SCENTSX_ACCOUNT_NUMBER,
      account_id: SCENTSX_ACCOUNT_ID,
      facility_id: facilityId,
      lines_planned: EXPECTED_LINE_COUNT,
      created,
      skipped_already_linked: skipped,
      entry_count: n,
      open_balance_cents: openCents,
      open_balance_usd: (openCents / 100).toFixed(2),
      expected_open_cents: EXPECTED_OPEN_CENTS,
      interest_rate_bps: INTEREST_RATE_BPS,
      batches: 1,
      seconds,
      rows_per_second: seconds > 0 ? Number((created / seconds).toFixed(2)) : created,
      single_transaction: true,
      rewrite_journal: false,
      results,
    };

    if (n !== EXPECTED_LINE_COUNT) {
      throw new Error(`entry_count ${n} !== ${EXPECTED_LINE_COUNT}`);
    }
    if (openCents !== EXPECTED_OPEN_CENTS) {
      throw new Error(`open_balance_cents ${openCents} !== ${EXPECTED_OPEN_CENTS}`);
    }

    if (execute) {
      await client.query("COMMIT");
      console.log(JSON.stringify({ ...report, committed: true }, null, 2));
    } else {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ ...report, committed: false, rolled_back: true }, null, 2));
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
