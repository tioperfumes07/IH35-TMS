#!/usr/bin/env node
/**
 * verify:coa-canonical — ACCT-COA-CANONICALIZATION guard.
 *
 * Asserts:
 *   1. catalogs.accounts is the canonical posting chart of accounts (the additive
 *      backfill migration links it to QBO; COA FKs reference it — checked vs DB when available).
 *   2. accounting.coa_account is NOT treated as canonical COA anywhere new: every code-side
 *      reference to the schema-qualified table accounting.coa_account stays within the known
 *      PSE allowlist. (It is a legitimate QBO expense-account mirror for PSE enforcement, so we
 *      do NOT assert zero references — we assert no NEW surfaces appear and that it is documented
 *      as non-canonical via the retirement-note migration.)
 *   3. catalogs.accounts.qbo_account_id is populated for >= THRESHOLD% of the matchable
 *      TRANSP-linkable accounts (checked vs DB when available; threshold from the committed
 *      reconciliation report, floored at 50%, overridable via COA_QBO_LINK_MIN_PCT).
 *
 * Static checks always run. DB checks run only when a database is reachable AND seeded
 * (fresh/un-migrated CI databases are treated as a SKIP for the DB-backed assertions).
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BACKFILL_MIGRATION = "db/migrations/202606080100_coa_qbo_link_backfill.sql";
const RETIRE_MIGRATION = "db/migrations/202606080110_coa_account_retire_note.sql";
const RECONCILE_SCRIPT = "scripts/reconcile-coa-qbo.mjs";
const RECONCILE_ARTIFACT = "docs/audits/COA-QBO-RECONCILIATION.json";

// Code-side files permitted to reference the schema-qualified table accounting.coa_account.
// This is the PSE (Product/Service/Expense) mirror surface plus this block's own files.
// Any NEW file referencing accounting.coa_account must be reviewed and added here deliberately.
const COA_ACCOUNT_REF_ALLOWLIST = new Set([
  "db/migrations/0265_ps_mirror.sql",
  "db/migrations/202606080110_coa_account_retire_note.sql",
  "scripts/verify-pse-mirror.mjs",
  "scripts/verify-coa-canonical.mjs",
  "apps/backend/src/banking/bulk-transactions.ts",
  "apps/backend/src/accounting/pse-mirror.service.ts",
  "apps/backend/src/accounting/pse-mirror.routes.ts",
]);

const SCAN_DIRS = ["apps", "scripts", "db/migrations"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql"]);
const COA_ACCOUNT_TABLE_RE = /accounting\.coa_account(?![\w])/;

const DEFAULT_THRESHOLD_PCT = 90;
const THRESHOLD_FLOOR_PCT = 50;

function fail(msg) {
  console.error(`verify:coa-canonical FAILED\n- ${msg}`);
  process.exit(1);
}

function readRequired(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing required file: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

function walk(dirAbs, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      walk(full, acc);
    } else if (SCAN_EXT.has(path.extname(e.name))) {
      acc.push(full);
    }
  }
  return acc;
}

function staticChecks() {
  // (1) migrations present + additive backfill
  const backfill = readRequired(BACKFILL_MIGRATION);
  if (!/UPDATE\s+catalogs\.accounts/i.test(backfill)) {
    fail(`${BACKFILL_MIGRATION} must UPDATE catalogs.accounts`);
  }
  if (!/qbo_account_id\s+IS\s+NULL/i.test(backfill)) {
    fail(`${BACKFILL_MIGRATION} must only link rows where qbo_account_id IS NULL (additive)`);
  }
  if (/INSERT\s+INTO\s+catalogs\.accounts/i.test(backfill)) {
    fail(`${BACKFILL_MIGRATION} must not INSERT into catalogs.accounts (additive-only, no row creation)`);
  }
  if (/DELETE\s+FROM\s+catalogs\.accounts/i.test(backfill) || /DROP\s+TABLE/i.test(backfill)) {
    fail(`${BACKFILL_MIGRATION} must not DELETE/DROP (additive-only)`);
  }
  if (/SET[\s\S]*\baccount_type\b\s*=/i.test(backfill)) {
    fail(`${BACKFILL_MIGRATION} must not change account_type (no type changes)`);
  }

  // (2) retirement note is COMMENT-only, documents non-canonical status
  const retire = readRequired(RETIRE_MIGRATION);
  if (!/COMMENT\s+ON\s+TABLE\s+accounting\.coa_account/i.test(retire)) {
    fail(`${RETIRE_MIGRATION} must COMMENT ON TABLE accounting.coa_account`);
  }
  if (!/NOT the canonical chart of accounts/i.test(retire) || !/catalogs\.accounts/i.test(retire)) {
    fail(`${RETIRE_MIGRATION} comment must state accounting.coa_account is NOT canonical and point to catalogs.accounts`);
  }
  if (/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?accounting\.coa_account/i.test(retire) || /RENAME\s+TO/i.test(retire)) {
    fail(`${RETIRE_MIGRATION} must be COMMENT-only (no DROP / RENAME of accounting.coa_account)`);
  }

  // reconcile script + artifact present
  readRequired(RECONCILE_SCRIPT);
  const artifactRaw = readRequired(RECONCILE_ARTIFACT);
  let artifact;
  try {
    artifact = JSON.parse(artifactRaw);
  } catch (e) {
    fail(`${RECONCILE_ARTIFACT} is not valid JSON: ${String(e?.message || e)}`);
  }

  // (3) coa_account reference allowlist — no NEW surfaces treat it as canonical
  const offenders = [];
  for (const dir of SCAN_DIRS) {
    const files = walk(path.join(ROOT, dir), []);
    for (const abs of files) {
      const rel = path.relative(ROOT, abs).split(path.sep).join("/");
      const text = fs.readFileSync(abs, "utf8");
      if (COA_ACCOUNT_TABLE_RE.test(text) && !COA_ACCOUNT_REF_ALLOWLIST.has(rel)) {
        offenders.push(rel);
      }
    }
  }
  if (offenders.length > 0) {
    fail(
      `new code references accounting.coa_account (treat catalogs.accounts as canonical instead). ` +
        `Unexpected files:\n  - ${offenders.join("\n  - ")}`
    );
  }

  return { artifact };
}

function resolveThreshold(artifact) {
  const envRaw = process.env.COA_QBO_LINK_MIN_PCT;
  if (envRaw != null && envRaw.trim() !== "") {
    const n = Number(envRaw);
    if (!Number.isFinite(n)) fail(`COA_QBO_LINK_MIN_PCT is not a number: ${envRaw}`);
    return Math.max(THRESHOLD_FLOOR_PCT, n);
  }
  const fromArtifact = Number(artifact?.coverage?.suggested_verifier_threshold_pct);
  const base = Number.isFinite(fromArtifact) ? fromArtifact : DEFAULT_THRESHOLD_PCT;
  return Math.max(THRESHOLD_FLOOR_PCT, base);
}

async function withBypass(client, sql, params = []) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const res = await client.query(sql, params);
    await client.query("COMMIT");
    return res;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function dbChecks(threshold) {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("verify:coa-canonical — DB checks SKIPPED (no DATABASE_DIRECT_URL/DATABASE_URL)");
    return { skipped: true };
  }

  const pool = new pg.Pool({ connectionString });
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    console.log(`verify:coa-canonical — DB checks SKIPPED (cannot connect: ${String(e?.message || e)})`);
    await pool.end();
    return { skipped: true };
  }

  try {
    // Fresh/un-seeded DB (no ih35_app role, no catalogs schema) => treat as SKIP.
    try {
      await client.query("SET ROLE ih35_app");
      const reg = await client.query(`SELECT to_regclass('catalogs.accounts') AS t, to_regclass('accounting.qbo_accounts') AS q`);
      if (!reg.rows[0]?.t || !reg.rows[0]?.q) {
        console.log("verify:coa-canonical — DB checks SKIPPED (catalogs.accounts / accounting.qbo_accounts not present)");
        return { skipped: true };
      }
    } catch (e) {
      console.log(`verify:coa-canonical — DB checks SKIPPED (schema/role not seeded: ${String(e?.message || e)})`);
      return { skipped: true };
    }

    // (1) canonical FK: journal_entry_postings.account_id must reference catalogs.accounts
    const fkRes = await withBypass(
      client,
      `SELECT confrelid::regclass::text AS ref
         FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'accounting.journal_entry_postings'::regclass
          AND conkey = (
            SELECT array_agg(attnum)
              FROM pg_attribute
             WHERE attrelid = 'accounting.journal_entry_postings'::regclass
               AND attname = 'account_id'
          )`
    );
    const ref = fkRes.rows[0]?.ref;
    if (ref && ref !== "catalogs.accounts") {
      fail(`accounting.journal_entry_postings.account_id references ${ref}, expected catalogs.accounts (canonical COA)`);
    }

    // (3) coverage: linked / matchable within the TRANSP slice
    const company = await withBypass(client, `SELECT id::text AS id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`);
    const transpId = company.rows[0]?.id;
    if (!transpId) {
      console.log("verify:coa-canonical — coverage SKIPPED (no TRANSP company)");
      return { skipped: false, coverageSkipped: true };
    }

    const cov = await withBypass(
      client,
      `
      WITH tms AS (
        SELECT id, qbo_account_id,
               lower(btrim(regexp_replace(account_name, '\\s+', ' ', 'g'))) AS nkey
        FROM catalogs.accounts
      ),
      qbo AS (
        SELECT lower(btrim(regexp_replace(qa.name, '\\s+', ' ', 'g'))) AS nkey
        FROM accounting.qbo_accounts qa
        WHERE qa.operating_company_id = $1::uuid
      ),
      qbo_names AS (SELECT DISTINCT nkey FROM qbo),
      matchable AS (
        SELECT t.id, t.qbo_account_id
        FROM tms t
        WHERE t.nkey IN (SELECT nkey FROM qbo_names)
      )
      SELECT
        (SELECT count(*) FROM matchable)::int AS matchable,
        (SELECT count(*) FROM matchable WHERE qbo_account_id IS NOT NULL)::int AS linked,
        (SELECT count(*) FROM tms)::int AS tms_total
      `,
      [transpId]
    );
    const { matchable, linked, tms_total } = cov.rows[0];
    if (Number(tms_total) === 0 || Number(matchable) === 0) {
      console.log("verify:coa-canonical — coverage SKIPPED (no TRANSP-matchable accounts in this DB)");
      return { skipped: false, coverageSkipped: true };
    }
    const pct = Math.round((Number(linked) / Number(matchable)) * 100);
    if (pct < threshold) {
      fail(
        `catalogs.accounts.qbo_account_id coverage ${pct}% (${linked}/${matchable} matchable) is below threshold ${threshold}%. ` +
          `Run the backfill migration (db:migrate) or adjust COA_QBO_LINK_MIN_PCT.`
      );
    }
    console.log(
      `verify:coa-canonical — DB OK (canonical FK -> catalogs.accounts; qbo_account_id coverage ${pct}% >= ${threshold}%, ${linked}/${matchable} matchable)`
    );
    return { skipped: false, pct };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const { artifact } = staticChecks();
  const threshold = resolveThreshold(artifact);
  console.log(`verify:coa-canonical — static checks OK (threshold ${threshold}%, floor ${THRESHOLD_FLOOR_PCT}%)`);
  await dbChecks(threshold);
  console.log("verify:coa-canonical — OK");
}

main().catch((err) => fail(String(err?.stack || err?.message || err)));
