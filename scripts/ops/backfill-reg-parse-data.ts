#!/usr/bin/env tsx
/**
 * scripts/ops/backfill-reg-parse-data.ts — ROUND 11 REG-PARSE-DATA backfill.
 *
 * Finds every accounting.expenses row whose memo matches the 2026-09-05 seed's composite grammar
 * ("<item> — <address> — inv <n> — <date> — $<amt> (settlement <n>)") and backfills it through the
 * real, audited service function backfillExpenseParsedFields (apps/backend/src/accounting/
 * expense-parse-backfill.service.ts) — never a raw ad-hoc UPDATE. Candidate rows are found by a
 * read-only SELECT (memo containing the em-dash separator this grammar always uses); the actual
 * parse-and-write decision is made INSIDE the service by parseExpenseMemo's own seedShape flag, so
 * a false-positive candidate (a real expense whose memo happens to contain an em-dash) is safely
 * skipped by the service itself, never guessed at here.
 *
 * Usage:
 *   DATABASE_URL=<Neon prod> npx tsx scripts/ops/backfill-reg-parse-data.ts --dry-run
 *   DATABASE_URL=<Neon prod> npx tsx scripts/ops/backfill-reg-parse-data.ts --apply
 */
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { backfillExpenseParsedFields } from "../../apps/backend/src/accounting/expense-parse-backfill.service.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("../lib/pg-connection-options.cjs");
const pg = require("pg");

// Owner (tioperfumes07@gmail.com) — this backfill was ordered directly by the owner in chat
// (ROUND 11), so the audit trail's actor is the real requesting user.
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EM_DASH = "—";

type Candidate = { id: string; operating_company_id: string };

async function findCandidates(): Promise<Candidate[]> {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL/DATABASE_DIRECT_URL required");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await client.query(
      `
        SELECT id::text, operating_company_id::text
        FROM accounting.expenses
        WHERE memo LIKE $1
          AND merchant_address IS NULL
          AND source_settlement_ref IS NULL
      `,
      [`%${EM_DASH}%`]
    );
    await client.query("ROLLBACK");
    return res.rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const candidates = await findCandidates();
  console.log(`backfill-reg-parse-data: ${apply ? "--apply" : "--dry-run"} — ${candidates.length} candidate expense(s) (memo contains em-dash, not yet backfilled)`);

  let updated = 0;
  let notSeedShape = 0;
  let alreadyDone = 0;
  let notFound = 0;

  for (const c of candidates) {
    if (!apply) continue;
    const result = await withCompanyScope(OWNER_USER_ID, c.operating_company_id, (client) =>
      backfillExpenseParsedFields(client, {
        operatingCompanyId: c.operating_company_id,
        expenseId: c.id,
        actorUserId: OWNER_USER_ID,
      })
    );
    if (result.updated) {
      updated += 1;
    } else if (result.reason === "not_seed_shape") {
      notSeedShape += 1;
    } else if (result.reason === "already_backfilled") {
      alreadyDone += 1;
    } else {
      notFound += 1;
    }
  }

  if (apply) {
    console.log(`backfill-reg-parse-data: applied — updated=${updated} not_seed_shape=${notSeedShape} already_backfilled=${alreadyDone} not_found=${notFound}`);
  } else {
    console.log("backfill-reg-parse-data: dry-run — re-run with --apply to write");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
