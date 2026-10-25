// ROUND 443.292-F void — P-0123 (Carlos Pena), P-0124 (Jose Antonio Vicente), P-0125 (Angel Sosa)
// all closed with 0 lines, $0.00. The close engine now refuses empty shells; these three must be voided.
// Uses THE engine: reverseSettlementForVoid (void-document-callees.service.ts) — same function
// POST /settlements/:id/reverse calls. Owns unlinking loads / driver bills / GL reversal.
// Guard: verify-no-empty-zero-settlement. TB must be 0 before and after (no GL postings exist).
//   default: dry run (ROLLBACK) · --fork-commit (assertNotProduction) · --apply with OWNER_AUTH_ID=AUTH-459
// verify-owner-authorization: scripts/verify-owner-authorization.mjs AUTH-459
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { reverseSettlementForVoid } from "../../apps/backend/src/driver-finance/void-document-callees.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DISPLAY_IDS = ["P-0123", "P-0124", "P-0125"];
const VOID_REASON = "443.292-F: closed with 0 settlement lines and $0.00 — empty shell voided per engine enforcement (443.294 override-reason)";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");

if (APPLY) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  // verify-owner-authorization: OWNER AUTH-459 (443.292-F void empty settlements)
  if (auth !== "AUTH-459") throw new Error("--apply requires OWNER_AUTH_ID=AUTH-459");
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }

async function tbCents(c: InstanceType<typeof pg.Client>): Promise<number> {
  const res = await c.query<{ net: string }>(
    `SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text net
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
      WHERE je.operating_company_id=$1 AND je.status='posted'`,
    [USMCA]
  );
  return Number(res.rows[0]?.net ?? 0);
}

const conn = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await conn.connect();
if (APPLY) await assertIsIntendedProduction(conn as never, { label: "443.292-F void empty settlements" });
else if (FORK) await assertNotProduction(conn as never, { label: "443.292-F void empty settlements (fork)" });

await conn.query("BEGIN");
try {
  await conn.query("SET LOCAL app.bypass_rls = 'lucia'");
  await conn.query("SET LOCAL lock_timeout = '5s'");
  await conn.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
  await conn.query("SELECT set_config('app.current_user_id', $1, true)", [OWNER_USER]);

  const tbBefore = await tbCents(conn);

  // Look up settlement IDs in order
  const lookupRes = await conn.query<{ id: string; display_id: string; status: string }>(
    `SELECT id::text, display_id, status
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[])
      ORDER BY array_position($2::text[], display_id)`,
    [USMCA, DISPLAY_IDS]
  );
  if (lookupRes.rows.length !== DISPLAY_IDS.length) {
    throw new Error(`Expected ${DISPLAY_IDS.length} rows, got ${lookupRes.rows.length}`);
  }

  const results = [];
  for (const row of lookupRes.rows) {
    // Measure: must have 0 active lines and 0 GL postings before voiding
    const linesCount = Number((await conn.query<{ n: string }>(
      `SELECT count(*) n FROM driver_finance.settlement_lines WHERE settlement_id=$1::uuid AND is_active=true`,
      [row.id]
    )).rows[0].n);
    const glCount = Number((await conn.query<{ n: string }>(
      `SELECT count(*) n FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid AND source_transaction_id=$2`,
      [USMCA, row.id]
    )).rows[0].n);
    if (linesCount !== 0) throw new Error(`${row.display_id} has ${linesCount} active lines — not an empty shell`);
    if (glCount !== 0) throw new Error(`${row.display_id} has ${glCount} GL postings — cannot void without GL reversal check`);

    // Void via the engine
    await reverseSettlementForVoid(conn as never, {
      operatingCompanyId: USMCA,
      settlementId: row.id,
      reason: VOID_REASON,
      actor: { userId: OWNER_USER },
    });
    results.push({ settlement: row.display_id, id: row.id, status_was: row.status, lines_count: linesCount, gl_count: glCount, result: "OK" });
  }

  const tbAfter = await tbCents(conn);
  if (tbAfter !== tbBefore) throw new Error(`TB changed: before=${tbBefore} after=${tbAfter} — rolled back`);

  if (!APPLY && !FORK) {
    await conn.query("ROLLBACK");
    console.log(JSON.stringify({ result: "DRY RUN — ROLLED BACK", tb_before: tbBefore, tb_after: tbAfter, rows: results }, null, 2));
  } else {
    await conn.query("COMMIT");
    console.log(JSON.stringify({ result: "COMMITTED", tb_before: tbBefore, tb_after: tbAfter, rows: results }, null, 2));
  }
} catch (e) {
  await conn.query("ROLLBACK");
  throw new Error(`REFUSED: rolled back — ${(e as Error).message}`);
} finally {
  await conn.end();
}
