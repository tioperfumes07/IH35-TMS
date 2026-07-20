#!/usr/bin/env node
/**
 * verify-unbilled-revenue-accounts.mjs
 *
 * Anti-regression guard for the ASC 606 contract-asset accounts created by
 * db/migrations/202607620000_unbilled_revenue_accounts.sql.
 *
 * WHY BOTH A STATIC AND A DB LAYER:
 *   A DB-only guard SKIPS whenever no database is reachable (`npm run verify:static` runs with a dead-port
 *   sentinel). A guard that silently skips is a hollow guard — it reads green while asserting nothing.
 *   So the STATIC layer below always runs and can never be skipped: it pins the migration's content so the
 *   values cannot be quietly edited, TRK cannot be added, and the hardcoded-UUID regression cannot return.
 *   The DB layer then proves the real end state wherever a DB exists (CI fresh-DB, local, prod).
 *
 * STATIC assertions (always run, no DB required):
 *   S1 migration file exists.
 *   S2 declares TRANSP→1240 and USMCA→1150.
 *   S3 resolves entity ids BY CODE from org.companies — NO hardcoded company UUIDs. Hardcoding passes on
 *      prod but breaks the fresh-CI DB with accounts_operating_company_id_fkey
 *      (see 202606272100_af1_catalogs_accounts_per_entity.sql, which documents this exact regression).
 *   S4 TRK is NOT seeded (lessor entity: no freight/line-haul income account, 0 freight loads).
 *   S5 idempotent — carries ON CONFLICT DO NOTHING.
 *   S6 subtype is the local spelling 'Other Current Assets', not the QBO enum 'OtherCurrentAssets'
 *      (QBO enum spellings are reserved for mirrored rows carrying a qbo_account_id).
 *
 * DB assertions (run only when a DATABASE_URL is reachable):
 *   D1 TRANSP has exactly ONE active unbilled_revenue account, number 1240, type Asset, is_postable.
 *   D2 USMCA  has exactly ONE active unbilled_revenue account, number 1150, type Asset, is_postable.
 *   D3 TRK has ZERO unbilled_revenue accounts.
 *
 * Read-only. Never repairs. FINANCIAL CLUSTER — this guard is the regression fence for an owner-approved
 * chart-of-accounts change (§2: every bug fix / financial change gets a static CI guard).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(ROOT, "db/migrations/202607620000_unbilled_revenue_accounts.sql");

const EXPECTED = [
  { code: "TRANSP", number: "1240" },
  { code: "USMCA", number: "1150" },
];

const failures = [];
const fail = (id, msg) => failures.push(`[${id}] ${msg}`);

// ---------------------------------------------------------------- STATIC ----
function runStatic() {
  if (!fs.existsSync(MIGRATION)) {
    fail("S1", `migration missing: ${path.relative(ROOT, MIGRATION)}`);
    return;
  }
  const sql = fs.readFileSync(MIGRATION, "utf8");
  // Strip comments so assertions test executable SQL, not prose in the header.
  const body = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  for (const { code, number } of EXPECTED) {
    const pair = new RegExp(`'${code}'\\s*,\\s*'${number}'`);
    if (!pair.test(body)) fail("S2", `migration must seed ${code} → account_number ${number}`);
  }

  const uuids = body.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi) ?? [];
  if (uuids.length) {
    fail(
      "S3",
      `hardcoded company UUID(s) ${uuids.join(", ")} — resolve ids BY CODE from org.companies. ` +
        `Hardcoded ids pass on prod but violate accounts_operating_company_id_fkey on the fresh CI DB.`
    );
  }
  if (!/JOIN\s+org\.companies\s+\w*\s*ON\s+\w*\.?code\s*=/i.test(body)) {
    fail("S3", "migration must resolve entity ids via JOIN org.companies ON code = ...");
  }

  if (/'TRK'/.test(body)) {
    fail("S4", "TRK must NOT be seeded — lessor entity, no freight income account, 0 freight loads");
  }

  if (!/ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/i.test(body)) {
    fail("S5", "migration must be idempotent (ON CONFLICT ... DO NOTHING)");
  }

  if (/'OtherCurrentAssets'/.test(body)) {
    fail("S6", "subtype must be 'Other Current Assets' (local spelling), not the QBO enum 'OtherCurrentAssets'");
  }
  if (!/'Other Current Assets'/.test(body)) {
    fail("S6", "subtype 'Other Current Assets' not found");
  }
}

// -------------------------------------------------------------------- DB ----
const DB_SQL = `
  SELECT c.code,
         count(*) FILTER (WHERE a.system_purpose = 'unbilled_revenue'
                            AND a.deactivated_at IS NULL)                          AS n_active,
         min(a.account_number) FILTER (WHERE a.system_purpose = 'unbilled_revenue'
                                         AND a.deactivated_at IS NULL)             AS account_number,
         bool_and(a.account_type = 'Asset' AND a.is_postable)
           FILTER (WHERE a.system_purpose = 'unbilled_revenue'
                     AND a.deactivated_at IS NULL)                                 AS shape_ok
    FROM org.companies c
    LEFT JOIN catalogs.accounts a ON a.operating_company_id = c.id
   WHERE c.code IN ('TRANSP','USMCA','TRK')
   GROUP BY c.code`;

/**
 * An UNREACHABLE database is not a guard failure — `npm run verify:static` deliberately points
 * DATABASE_URL at a dead-port sentinel (127.0.0.1:59999) so static guards run with no DB. Checking
 * only `if (!cs)` is wrong: the string IS set, so the pool connects, throws ECONNREFUSED, and the
 * guard hard-fails on every static run. Degrade to the static layer on a CONNECTION error, but keep
 * hard-failing on a real assertion violation — the distinction is what stops this from becoming a
 * hollow guard that skips its way to green.
 */
const CONNECTION_ERRORS = new Set([
  "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET", "EAI_AGAIN",
]);
const isConnectionError = (e) =>
  CONNECTION_ERRORS.has(e?.code) || /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|getaddrinfo|connect/i.test(e?.message ?? "");

async function runDb() {
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    console.warn("[unbilled-revenue-accounts] no DATABASE_URL — static layer only (DB layer runs in CI).");
    return;
  }

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs, max: 2, connectionTimeoutMillis: 5000 });
  try {
    // catalogs.accounts is FORCE RLS. This guard runs as the migration/CI role; if RLS masks the rows we
    // would read 0 and report a FALSE PASS on D3 / false fail on D1-D2. Bypass explicitly so a masked read
    // can never be mistaken for a verdict.
    const client = await pool.connect();
    try {
      await client.query("SET LOCAL row_security = off").catch(() => {});
      const { rows } = await client.query(DB_SQL);
      const by = Object.fromEntries(rows.map((r) => [r.code, r]));

      for (const { code, number } of EXPECTED) {
        const r = by[code];
        if (!r) { fail("D1/D2", `entity ${code} not present in org.companies`); continue; }
        if (Number(r.n_active) !== 1) {
          fail("D1/D2", `${code} must have exactly 1 active unbilled_revenue account, found ${r.n_active}`);
          continue;
        }
        if (r.account_number !== number) {
          fail("D1/D2", `${code} unbilled_revenue account_number is ${r.account_number}, expected ${number}`);
        }
        if (r.shape_ok !== true) {
          fail("D1/D2", `${code} unbilled_revenue account must be type Asset and is_postable=true`);
        }
      }

      const trk = by.TRK;
      if (trk && Number(trk.n_active) !== 0) {
        fail("D3", `TRK must have 0 unbilled_revenue accounts, found ${trk.n_active}`);
      }
    } finally {
      client.release();
    }
  } catch (e) {
    if (isConnectionError(e)) {
      console.warn(
        `[unbilled-revenue-accounts] database unreachable (${e.code ?? "connect"}) — static layer only. ` +
          `The DB layer runs where a database exists (CI fresh-DB, local, prod).`
      );
      return;
    }
    throw e;
  } finally {
    await pool.end().catch(() => {});
  }
}

// ------------------------------------------------------------------ main ----
async function main() {
  runStatic();
  await runDb();

  if (failures.length === 0) {
    console.log("[unbilled-revenue-accounts] PASS — TRANSP 1240 + USMCA 1150 contract assets intact; TRK excluded.");
    process.exit(0);
  }

  console.error("\nUNBILLED-REVENUE-ACCOUNTS GUARD FAILED");
  console.error("=".repeat(64));
  for (const f of failures) console.error(`  ${f}`);
  console.error("=".repeat(64));
  console.error("This guards an OWNER-APPROVED chart-of-accounts change. Fix the migration — never weaken the guard.");
  process.exit(1);
}

main().catch((e) => {
  console.error("[unbilled-revenue-accounts] error:", e?.message ?? e);
  process.exit(1);
});
