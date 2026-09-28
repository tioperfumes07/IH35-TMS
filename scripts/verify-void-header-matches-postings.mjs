#!/usr/bin/env node
// ROUND 155.13 J4 / 155.8 — a voided accounting.expenses row's own reversed_by_je_id must reflect
// reality: if the JE it originally posted through (journal_entry_id) has itself been reversed
// (accounting.journal_entries.reversed_by_je_id IS NOT NULL), the expense header must say so too.
// Backfilled to 0 by scripts/ops/2026-09-28-cc2-r1558-void-header-posting-status-backfill.ts
// (AUTH-102) — this guard is the permanent lock against the header drifting out of sync again.
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

function findDrifted(rows) {
  return rows.filter((r) => r.voided_at != null && r.expense_reversed_by_je_id == null && r.je_reversed_by_je_id != null);
}

function selftest() {
  const fixture = [
    { id: "clean", voided_at: "2026-01-01", expense_reversed_by_je_id: "je-1", je_reversed_by_je_id: "je-1" },
    { id: "drifted", voided_at: "2026-01-01", expense_reversed_by_je_id: null, je_reversed_by_je_id: "je-2" },
    { id: "not-voided", voided_at: null, expense_reversed_by_je_id: null, je_reversed_by_je_id: null },
    { id: "voided-not-yet-reversed", voided_at: "2026-01-01", expense_reversed_by_je_id: null, je_reversed_by_je_id: null },
  ];
  const drifted = findDrifted(fixture);
  if (drifted.length !== 1 || drifted[0].id !== "drifted") {
    console.error(`verify-void-header-matches-postings --selftest FAIL: expected exactly 1 drifted row ("drifted"), got ${JSON.stringify(drifted)}`);
    process.exit(1);
  }
  console.log("verify-void-header-matches-postings --selftest PASS (drifted row detected; clean/not-voided/not-yet-reversed rows correctly ignored)");
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const r = await client.query(
    `
    SELECT e.id::text, e.total_amount_cents::text
    FROM accounting.expenses e
    JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
    WHERE e.voided_at IS NOT NULL
      AND e.reversed_by_je_id IS NULL
      AND je.reversed_by_je_id IS NOT NULL
      AND e.operating_company_id = $1
  `,
    [USMCA]
  );
  await client.end();

  if (r.rows.length > 0) {
    console.log(`verify-void-header-matches-postings FAIL — ${r.rows.length} voided accounting.expenses row(s) have a reversed JE but a stale (NULL) reversed_by_je_id header:`);
    for (const row of r.rows.slice(0, 20)) {
      console.log(`  ${row.id} ($${(Number(row.total_amount_cents) / 100).toFixed(2)})`);
    }
    if (r.rows.length > 20) console.log(`  ... and ${r.rows.length - 20} more`);
    process.exit(1);
  }

  console.log("verify-void-header-matches-postings PASS — every voided expense's reversed_by_je_id matches its JE's real reversal state.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
