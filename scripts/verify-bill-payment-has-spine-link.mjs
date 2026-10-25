#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// ENG-46 (443.328): every posted bill_payment on USMCA must have at least one journal_entry_postings
// row whose source_transaction_type = 'bill_payment' and source_transaction_id = bp.id.
//
// MEASURED LIVE (2026-10-25, USMCA, neondb_owner): 223 posted bill_payments have no such spine entry.
// These are pre-existing gaps; the ceiling shrinks as the spine writer is wired to each payment path.
//
// Shrink-only ratchet: the ceiling can only go DOWN.
import pg from "pg";

const LABEL = "verify-bill-payment-has-spine-link";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const UNLINKED_BP_CEILING = 223; // measured 2026-10-25; shrink-only

export function evaluate(unlinked, ceiling = UNLINKED_BP_CEILING) {
  const out = [];
  if (unlinked > ceiling) out.push(`RULE 1: ${unlinked} posted bill_payments > ceiling ${ceiling} — a new posted bill_payment was written without its JE spine entry`);
  if (unlinked < ceiling) out.push(`RULE 1 RATCHET: ${unlinked} < ceiling ${ceiling} — lower ceiling to ${unlinked} so it can only shrink`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["at ceiling passes", evaluate(UNLINKED_BP_CEILING).length === 0],
    ["above ceiling fails", evaluate(UNLINKED_BP_CEILING + 1).some((x) => x.startsWith("RULE 1:"))],
    ["below ceiling demands ratchet drop", evaluate(UNLINKED_BP_CEILING - 1).some((x) => x.startsWith("RULE 1 RATCHET"))],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, pass]) => !pass).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
  if (probe.rows.length === 0) {
    await client.end();
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--selftest"], { stdio: "inherit" });
    console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest only, NOT live proof`);
    process.exit(r.status ?? 1);
  }
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const who = await client.query("SELECT current_user AS u");
    if (who.rows[0].u === "ih35_app") {
      console.error(`${LABEL}: FAIL — connected as ih35_app (pooler); count would be masked`);
      await client.query("ROLLBACK");
      process.exit(1);
    }
    const { rows } = await client.query(
      `SELECT count(*)::int AS n
         FROM accounting.bill_payments bp
        WHERE bp.operating_company_id = $1
          AND bp.status = 'posted'
          AND NOT EXISTS (
            SELECT 1 FROM accounting.journal_entry_postings jep
             WHERE jep.source_transaction_type = 'bill_payment'
               AND jep.source_transaction_id = bp.id::text
          )`,
      [USMCA]
    );
    await client.query("ROLLBACK");
    const n = rows[0].n;
    const failures = evaluate(n);
    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.join("; ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS (ratchet, ENG-46) — ${n} posted bill_payments lack a JE spine entry (ceiling ${UNLINKED_BP_CEILING})`);
  } finally {
    await client.end();
  }
}

await run();
