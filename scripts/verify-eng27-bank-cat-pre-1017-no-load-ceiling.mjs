#!/usr/bin/env node
/**
 * ENG-27 — pre-2026-10-17 bank_categorization postings without a load.
 * Shrink-only ratchet. Never auto-match. Explain or back-fill through the engine only.
 *
 * Measured LIVE 10-28 CT: 290 (was claimed 458). Ceiling shrinks only.
 */
import pg from "pg";

const LABEL = "verify-eng27-bank-cat-pre-1017-no-load-ceiling";
export const REQUIRES_LIVE_DB = "live USMCA journal_entry_postings";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const CEILING = 290; // measured 2026-10-28 CT; shrink-only

export function evaluate(n, ceiling = CEILING) {
  const out = [];
  if (n > ceiling) out.push(`RULE 1: ${n} > ceiling ${ceiling} — new pre-10-17 bank-cat posting without load`);
  if (n < ceiling) out.push(`RULE 1 RATCHET: ${n} < ceiling ${ceiling} — lower CEILING to ${n}`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["at ceiling passes", evaluate(CEILING).length === 0],
    ["above fails", evaluate(CEILING + 1).some((x) => x.startsWith("RULE 1:"))],
    ["below demands ratchet", evaluate(CEILING - 1).some((x) => x.startsWith("RULE 1 RATCHET"))],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  process.exit(cases.some(([, p]) => !p) ? 1 : 0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const { rows } = await client.query(
    `SELECT count(*)::int AS n
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
      WHERE je.operating_company_id = $1::uuid
        AND jep.source_transaction_type = 'bank_categorization'
        AND jep.load_id IS NULL
        AND jep.reversal_of_line_id IS NULL
        AND jep.created_at < TIMESTAMPTZ '2026-10-17'`,
    [USMCA]
  );
  await client.query("ROLLBACK");
  const n = rows[0].n;
  const failures = evaluate(n);
  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${n} pre-10-17 bank-cat postings without load (ceiling ${CEILING}); never auto-match`);
} finally {
  await client.end();
}
