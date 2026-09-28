#!/usr/bin/env node
// ROUND 155.18 — accounting.journal_entries carries a perfect invariant as of 2026-09-28: every
// live JE has at least one posting behind it (3,565 checked, 0 with zero postings). This guard
// protects that invariant going forward, specifically against the purge design in
// scripts/ops/2026-09-28-cc2-r15518-purge-voided-usmca.ts ever leaving a zero-posting JE husk
// behind -- the purge script deletes a JE header only when a runtime FK sweep confirms nothing else
// references it, precisely so this guard keeps passing after a real purge run.
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

function findZeroPostingRows(rows) {
  return rows.filter((r) => r.posting_count === 0);
}

function selftest() {
  const fixture = [
    { id: "je-with-postings", operating_company_id: USMCA, posting_count: 2 },
    { id: "je-husk", operating_company_id: USMCA, posting_count: 0 },
  ];
  const zero = findZeroPostingRows(fixture);
  if (zero.length !== 1 || zero[0].id !== "je-husk") {
    console.error(`verify-no-journal-entry-has-zero-postings --selftest FAIL: expected exactly 1 husk ("je-husk"), got ${JSON.stringify(zero)}`);
    process.exit(1);
  }
  const clean = findZeroPostingRows([{ id: "je-with-postings", operating_company_id: USMCA, posting_count: 3 }]);
  if (clean.length !== 0) {
    console.error(`verify-no-journal-entry-has-zero-postings --selftest FAIL: expected 0 husks on an all-posted fixture, got ${JSON.stringify(clean)}`);
    process.exit(1);
  }
  console.log("verify-no-journal-entry-has-zero-postings --selftest PASS (husk detected in mixed fixture; none detected in clean fixture)");
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const r = await client.query(`
    SELECT je.id::text, je.operating_company_id::text
    FROM accounting.journal_entries je
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.journal_entry_postings jep WHERE jep.journal_entry_uuid = je.id
    )
  `);
  await client.end();

  if (r.rows.length > 0) {
    console.log(`verify-no-journal-entry-has-zero-postings FAIL — ${r.rows.length} journal_entries row(s) have zero postings:`);
    for (const row of r.rows.slice(0, 20)) {
      console.log(`  ${row.id} (operating_company_id=${row.operating_company_id})`);
    }
    if (r.rows.length > 20) console.log(`  ... and ${r.rows.length - 20} more`);
    process.exit(1);
  }

  console.log("verify-no-journal-entry-has-zero-postings PASS — every accounting.journal_entries row has at least one posting.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
