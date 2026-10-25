#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// ENG-46 (443.328): USMCA driver_settlements whose source_document_ref is non-null must resolve to
// an actual USMCA load (mdata.loads.load_number). A settlement with a dead ref (P-0102 / '5796')
// cannot be traced back to its originating dispatch document.
//
// MEASURED LIVE (2026-10-25, USMCA, neondb_owner): 93 settlements carry a dead source_document_ref.
// Shrink-only ratchet.
import pg from "pg";

const LABEL = "verify-no-dead-settlement-source-ref";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const DEAD_REF_CEILING = 93; // measured 2026-10-25; shrink-only

export function evaluate(dead, ceiling = DEAD_REF_CEILING) {
  const out = [];
  if (dead > ceiling) out.push(`RULE 1: ${dead} settlements > ceiling ${ceiling} — a settlement was created with a source_document_ref that resolves to no USMCA load`);
  if (dead < ceiling) out.push(`RULE 1 RATCHET: ${dead} < ceiling ${ceiling} — lower ceiling to ${dead} so it can only shrink`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["at ceiling passes", evaluate(DEAD_REF_CEILING).length === 0],
    ["above ceiling fails", evaluate(DEAD_REF_CEILING + 1).some((x) => x.startsWith("RULE 1:"))],
    ["below ceiling demands ratchet drop", evaluate(DEAD_REF_CEILING - 1).some((x) => x.startsWith("RULE 1 RATCHET"))],
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
         FROM driver_finance.driver_settlements ds
        WHERE ds.operating_company_id = $1
          AND ds.source_document_ref IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM mdata.loads l
             WHERE l.operating_company_id = $1
               AND l.load_number::text = ds.source_document_ref
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
    console.log(`${LABEL}: LIVE PASS (ratchet, ENG-46) — ${n} settlements carry a dead source_document_ref (ceiling ${DEAD_REF_CEILING})`);
  } finally {
    await client.end();
  }
}

await run();
