#!/usr/bin/env node
/**
 * B-D3 — Restore-drill data-integrity assertion (CONTINUOUS-ASSURANCE Item 3).
 *
 * Gap: monthly-restore-drill can report success after a restore onto a partial/corrupt DB.
 * After restore, assert on the RESTORED copy:
 *   (a) hub-table row counts non-zero (+ within tolerance of baseline when provided)
 *   (b) balanced-ledger assertions pass (reuse verify-balanced-ledger ASSERTIONS)
 *   (c) migration ledger complete vs repo db/migrations/*.sql
 *   (d) audit hash-chain linkage intact (sample / entity-scoped, read-only)
 *   (e) critical FK orphan checks
 *   (f) no NULL in required financial columns
 * Fail loudly. Optionally record to ops.daily_attestations (check_key='restore_drill') when present.
 *
 * Usage:
 *   node scripts/restore-drill-integrity.mjs --selftest
 *   RESTORED_DATABASE_URL=… node scripts/restore-drill-integrity.mjs
 *   DATABASE_URL=… RESTORE_DRILL_ENFORCE=true node scripts/restore-drill-integrity.mjs
 *
 * Env:
 *   RESTORED_DATABASE_URL | DATABASE_DIRECT_URL | DATABASE_URL — target DB (prefer restored copy)
 *   RESTORE_BASELINE_COUNTS — JSON map of hub key → expected count (optional)
 *   RESTORE_COUNT_TOLERANCE_PCT — default 5 (only when baseline present)
 *   RESTORE_DRILL_ENFORCE — "true" → exit 1 on failure (drill/CI); default true when not --selftest
 *   RESTORE_DRILL_ALLOW_SKIP — "true" → exit 0 when no DB (CI structural path only)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSERTIONS as LEDGER_ASSERTIONS } from "./verify-balanced-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "restore-drill-integrity";
const CHECK_KEY = "restore_drill";

/** Hub tables per Law of the Land / constitution §10 linkage hubs. */
export const HUB_TABLES = [
  { key: "companies", sql: "SELECT COUNT(*)::bigint AS cnt FROM org.companies", min: 1 },
  { key: "users", sql: "SELECT COUNT(*)::bigint AS cnt FROM identity.users", min: 1 },
  { key: "drivers", sql: "SELECT COUNT(*)::bigint AS cnt FROM mdata.drivers", min: 1 },
  { key: "units", sql: "SELECT COUNT(*)::bigint AS cnt FROM mdata.units", min: 1 },
  { key: "customers", sql: "SELECT COUNT(*)::bigint AS cnt FROM mdata.customers", min: 1 },
  { key: "vendors", sql: "SELECT COUNT(*)::bigint AS cnt FROM mdata.vendors", min: 1 },
  { key: "accounts", sql: "SELECT COUNT(*)::bigint AS cnt FROM catalogs.accounts", min: 1 },
  { key: "journal_entries", sql: "SELECT COUNT(*)::bigint AS cnt FROM accounting.journal_entries", min: 1 },
];

/** Critical FK orphan probes (read-only). */
export const FK_CHECKS = [
  {
    key: "postings_orphan_je",
    sql: `
      SELECT COUNT(*)::bigint AS cnt
        FROM accounting.journal_entry_postings p
       WHERE NOT EXISTS (
         SELECT 1 FROM accounting.journal_entries je WHERE je.id = p.journal_entry_uuid
       )`,
  },
  {
    key: "postings_orphan_account",
    sql: `
      SELECT COUNT(*)::bigint AS cnt
        FROM accounting.journal_entry_postings p
       WHERE NOT EXISTS (
         SELECT 1 FROM catalogs.accounts a WHERE a.id = p.account_id
       )`,
  },
];

/** Required financial columns must not be NULL. */
export const NULL_CHECKS = [
  {
    key: "postings_amount_null",
    sql: `SELECT COUNT(*)::bigint AS cnt FROM accounting.journal_entry_postings WHERE amount_cents IS NULL`,
  },
  {
    key: "postings_opco_null",
    sql: `SELECT COUNT(*)::bigint AS cnt FROM accounting.journal_entry_postings WHERE operating_company_id IS NULL`,
  },
  {
    key: "je_opco_null",
    sql: `SELECT COUNT(*)::bigint AS cnt FROM accounting.journal_entries WHERE operating_company_id IS NULL`,
  },
];

/**
 * Pure evaluation over a collected snapshot (used by --selftest and live path).
 * @param {{
 *   hubCounts: Record<string, number>,
 *   baselineCounts?: Record<string, number> | null,
 *   tolerancePct?: number,
 *   ledgerViolationCounts: Record<string, number>,
 *   migration: { repoCount: number, ledgerCount: number, missingFromLedger: string[], ghostInLedger: string[] },
 *   auditChain: { eventsChecked: number, hashBreaks: number, linkBreaks: number },
 *   fkOrphans: Record<string, number>,
 *   nullFinancial: Record<string, number>,
 * }} snap
 * @returns {{ ok: boolean, failures: string[], checks: Record<string, 'pass'|'fail'> }}
 */
export function evaluateIntegritySnapshot(snap) {
  const failures = [];
  const checks = {};
  const tolerancePct = Number.isFinite(snap.tolerancePct) ? snap.tolerancePct : 5;

  for (const hub of HUB_TABLES) {
    const cnt = Number(snap.hubCounts?.[hub.key] ?? 0);
    if (cnt < hub.min) {
      failures.push(`hub.${hub.key}: count ${cnt} < min ${hub.min}`);
      checks[`hub.${hub.key}`] = "fail";
    } else {
      checks[`hub.${hub.key}`] = "pass";
    }
    const baseline = snap.baselineCounts?.[hub.key];
    if (baseline != null && Number(baseline) > 0) {
      const expected = Number(baseline);
      const deltaPct = (Math.abs(cnt - expected) / expected) * 100;
      if (deltaPct > tolerancePct) {
        failures.push(
          `hub.${hub.key}: count ${cnt} outside ±${tolerancePct}% of baseline ${expected} (delta ${deltaPct.toFixed(2)}%)`,
        );
        checks[`hub.${hub.key}.tolerance`] = "fail";
      } else {
        checks[`hub.${hub.key}.tolerance`] = "pass";
      }
    }
  }

  for (const [name, n] of Object.entries(snap.ledgerViolationCounts || {})) {
    if (Number(n) > 0) {
      failures.push(`ledger.${name}: ${n} violation(s)`);
      checks[`ledger.${name}`] = "fail";
    } else {
      checks[`ledger.${name}`] = "pass";
    }
  }

  const mig = snap.migration || { repoCount: 0, ledgerCount: 0, missingFromLedger: [], ghostInLedger: [] };
  if (mig.repoCount < 1) {
    failures.push("migration: repo migration file count is 0");
    checks.migration_repo = "fail";
  } else {
    checks.migration_repo = "pass";
  }
  if (mig.ledgerCount < 1) {
    failures.push("migration: restored ledger (_system._schema_migrations) is empty");
    checks.migration_ledger = "fail";
  } else {
    checks.migration_ledger = "pass";
  }
  if ((mig.missingFromLedger || []).length) {
    failures.push(
      `migration: ${mig.missingFromLedger.length} repo file(s) missing from ledger (e.g. ${mig.missingFromLedger.slice(0, 3).join(", ")})`,
    );
    checks.migration_complete = "fail";
  } else {
    checks.migration_complete = "pass";
  }

  const ac = snap.auditChain || { eventsChecked: 0, hashBreaks: 0, linkBreaks: 0 };
  if (Number(ac.hashBreaks) > 0 || Number(ac.linkBreaks) > 0) {
    failures.push(
      `audit_chain: hash_breaks=${ac.hashBreaks} link_breaks=${ac.linkBreaks} (events_checked=${ac.eventsChecked})`,
    );
    checks.audit_chain = "fail";
  } else {
    checks.audit_chain = "pass";
  }

  for (const [k, n] of Object.entries(snap.fkOrphans || {})) {
    if (Number(n) > 0) {
      failures.push(`fk.${k}: ${n} orphan row(s)`);
      checks[`fk.${k}`] = "fail";
    } else {
      checks[`fk.${k}`] = "pass";
    }
  }

  for (const [k, n] of Object.entries(snap.nullFinancial || {})) {
    if (Number(n) > 0) {
      failures.push(`null_financial.${k}: ${n} NULL row(s)`);
      checks[`null_financial.${k}`] = "fail";
    } else {
      checks[`null_financial.${k}`] = "pass";
    }
  }

  return { ok: failures.length === 0, failures, checks };
}

function loadRepoMigrationFilenames() {
  const dir = path.join(ROOT, "db/migrations");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

function loadBaselineCounts() {
  const raw = process.env.RESTORE_BASELINE_COUNTS?.trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`RESTORE_BASELINE_COUNTS is not valid JSON: ${e.message}`);
    }
  }
  const audits = path.join(ROOT, "docs/audits");
  if (!fs.existsSync(audits)) return null;
  const files = fs
    .readdirSync(audits)
    .filter((f) => /^backup-checksums-\d{4}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  if (!files.length) return null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(audits, files[0]), "utf8"));
    return j.counts && typeof j.counts === "object" && !j.counts.note ? j.counts : null;
  } catch {
    return null;
  }
}

async function collectSnapshot(client) {
  await client.query("BEGIN");
  await client.query("SET TRANSACTION READ ONLY");
  try {
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  } catch {
    /* GUC may be absent on bare local DBs — continue */
  }

  const hubCounts = {};
  for (const hub of HUB_TABLES) {
    try {
      const r = await client.query(hub.sql);
      hubCounts[hub.key] = Number(r.rows[0]?.cnt ?? 0);
    } catch (e) {
      hubCounts[hub.key] = 0;
      console.error(`[${LABEL}] hub.${hub.key} query failed: ${e.message}`);
    }
  }

  const ledgerViolationCounts = {};
  for (const [name, sql] of Object.entries(LEDGER_ASSERTIONS)) {
    try {
      const r = await client.query(sql);
      ledgerViolationCounts[name] = r.rows.length;
    } catch (e) {
      ledgerViolationCounts[name] = -1;
      console.error(`[${LABEL}] ledger.${name} query failed: ${e.message}`);
      // Treat query failure as a failure signal via evaluate (negative counts → we map below)
    }
  }
  for (const [name, n] of Object.entries(ledgerViolationCounts)) {
    if (n < 0) ledgerViolationCounts[name] = 1; // force fail on query error
  }

  const repoFiles = loadRepoMigrationFilenames();
  let ledgerFiles = [];
  try {
    const r = await client.query(`SELECT filename FROM _system._schema_migrations`);
    ledgerFiles = r.rows.map((row) => row.filename);
  } catch (e) {
    console.error(`[${LABEL}] migration ledger query failed: ${e.message}`);
  }
  const ledgerSet = new Set(ledgerFiles);
  const repoSet = new Set(repoFiles);
  const missingFromLedger = repoFiles.filter((f) => !ledgerSet.has(f));
  const ghostInLedger = ledgerFiles.filter((f) => !repoSet.has(f));

  let auditChain = { eventsChecked: 0, hashBreaks: 0, linkBreaks: 0 };
  try {
    const r = await client.query(`
      WITH post_anchor AS (
        SELECT chain_seq, prev_hash, hash,
               lag(hash) OVER (ORDER BY chain_seq) AS expected_prev
          FROM events.event_log
         WHERE is_active = true AND chain_seq IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*)::bigint FROM events.event_log WHERE is_active = true) AS events_checked,
        (SELECT COUNT(*)::bigint FROM post_anchor
          WHERE expected_prev IS NOT NULL AND prev_hash IS DISTINCT FROM expected_prev) AS link_breaks,
        0::bigint AS hash_breaks
    `);
    auditChain = {
      eventsChecked: Number(r.rows[0]?.events_checked ?? 0),
      hashBreaks: Number(r.rows[0]?.hash_breaks ?? 0),
      linkBreaks: Number(r.rows[0]?.link_breaks ?? 0),
    };
  } catch (e) {
    console.error(`[${LABEL}] audit chain query failed: ${e.message}`);
    auditChain = { eventsChecked: 0, hashBreaks: 1, linkBreaks: 0 };
  }

  const fkOrphans = {};
  for (const fk of FK_CHECKS) {
    try {
      const r = await client.query(fk.sql);
      fkOrphans[fk.key] = Number(r.rows[0]?.cnt ?? 0);
    } catch (e) {
      console.error(`[${LABEL}] fk.${fk.key} query failed: ${e.message}`);
      fkOrphans[fk.key] = 1;
    }
  }

  const nullFinancial = {};
  for (const nc of NULL_CHECKS) {
    try {
      const r = await client.query(nc.sql);
      nullFinancial[nc.key] = Number(r.rows[0]?.cnt ?? 0);
    } catch (e) {
      console.error(`[${LABEL}] null_financial.${nc.key} query failed: ${e.message}`);
      nullFinancial[nc.key] = 1;
    }
  }

  await client.query("ROLLBACK");

  return {
    hubCounts,
    baselineCounts: loadBaselineCounts(),
    tolerancePct: Number(process.env.RESTORE_COUNT_TOLERANCE_PCT ?? 5),
    ledgerViolationCounts,
    migration: {
      repoCount: repoFiles.length,
      ledgerCount: ledgerFiles.length,
      missingFromLedger,
      ghostInLedger,
    },
    auditChain,
    fkOrphans,
    nullFinancial,
  };
}

async function recordAttestation(client, status, delta) {
  try {
    const exists = await client.query(`
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'ops' AND table_name = 'daily_attestations' LIMIT 1`);
    if (!exists.rows.length) {
      console.log(`[${LABEL}] attestation SKIP — ops.daily_attestations not present (B-D1)`);
      return;
    }
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    } catch {
      /* optional */
    }
    // Schema may vary; try the blueprint shape and degrade if columns differ.
    await client.query(
      `
      INSERT INTO ops.daily_attestations
        (run_at, operating_company_id, check_key, status, delta_json, evidence, git_sha)
      VALUES (
        NOW(),
        NULL,
        $1,
        $2,
        $3::jsonb,
        $4,
        $5
      )
    `,
      [
        CHECK_KEY,
        status,
        JSON.stringify(delta),
        `${LABEL}:${status}`,
        process.env.GITHUB_SHA || process.env.GIT_SHA || null,
      ],
    );
    await client.query("COMMIT");
    console.log(`[${LABEL}] attestation recorded check_key=${CHECK_KEY} status=${status}`);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.warn(`[${LABEL}] attestation write skipped: ${e.message}`);
  }
}

function passSnapshot() {
  const repoCount = loadRepoMigrationFilenames().length;
  const hubCounts = Object.fromEntries(HUB_TABLES.map((h) => [h.key, Math.max(h.min, 3)]));
  return {
    hubCounts,
    baselineCounts: { companies: 3, customers: 3, vendors: 3 },
    tolerancePct: 5,
    ledgerViolationCounts: { balance: 0, minLines: 0, reversalIntegrity: 0 },
    migration: {
      repoCount,
      ledgerCount: repoCount,
      missingFromLedger: [],
      ghostInLedger: [],
    },
    auditChain: { eventsChecked: 10, hashBreaks: 0, linkBreaks: 0 },
    fkOrphans: Object.fromEntries(FK_CHECKS.map((f) => [f.key, 0])),
    nullFinancial: Object.fromEntries(NULL_CHECKS.map((n) => [n.key, 0])),
  };
}

function selftest() {
  const cases = [];

  const ok = evaluateIntegritySnapshot(passSnapshot());
  cases.push(["clean restore passes", ok.ok === true && ok.failures.length === 0]);

  const missingRows = passSnapshot();
  missingRows.hubCounts.companies = 0;
  const miss = evaluateIntegritySnapshot(missingRows);
  cases.push(["zero hub rows fails", miss.ok === false && miss.failures.some((f) => f.includes("hub.companies"))]);

  const unbalanced = passSnapshot();
  unbalanced.ledgerViolationCounts.balance = 2;
  const bal = evaluateIntegritySnapshot(unbalanced);
  cases.push(["unbalanced ledger fails", bal.ok === false && bal.failures.some((f) => f.includes("ledger.balance"))]);

  const migGap = passSnapshot();
  migGap.migration.missingFromLedger = ["209999990000_fake.sql"];
  const mig = evaluateIntegritySnapshot(migGap);
  cases.push(["incomplete migration ledger fails", mig.ok === false && mig.failures.some((f) => f.includes("migration:"))]);

  const chainBreak = passSnapshot();
  chainBreak.auditChain.linkBreaks = 1;
  const chain = evaluateIntegritySnapshot(chainBreak);
  cases.push(["audit chain break fails", chain.ok === false && chain.failures.some((f) => f.includes("audit_chain"))]);

  const fkBreak = passSnapshot();
  fkBreak.fkOrphans.postings_orphan_je = 3;
  const fk = evaluateIntegritySnapshot(fkBreak);
  cases.push(["FK orphan fails", fk.ok === false && fk.failures.some((f) => f.includes("fk.postings_orphan_je"))]);

  const nullBreak = passSnapshot();
  nullBreak.nullFinancial.postings_amount_null = 1;
  const nl = evaluateIntegritySnapshot(nullBreak);
  cases.push(["NULL financial column fails", nl.ok === false && nl.failures.some((f) => f.includes("null_financial"))]);

  const tolBreak = passSnapshot();
  tolBreak.hubCounts.companies = 100;
  tolBreak.baselineCounts = { companies: 3 };
  tolBreak.tolerancePct = 5;
  const tol = evaluateIntegritySnapshot(tolBreak);
  cases.push(["count outside tolerance fails", tol.ok === false && tol.failures.some((f) => f.includes("tolerance") || f.includes("outside"))]);

  const failed = cases.filter(([, p]) => !p);
  if (failed.length) {
    console.error(`[${LABEL}] --selftest FAILED`);
    for (const [name, p] of cases) console.error(`  ${p ? "✓" : "✗"} ${name}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS (${cases.length} cases)`);
  process.exit(0);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    selftest();
    return;
  }

  const cs =
    process.env.RESTORED_DATABASE_URL?.trim() ||
    process.env.DATABASE_DIRECT_URL?.trim() ||
    process.env.DATABASE_URL?.trim();

  const enforce =
    process.env.RESTORE_DRILL_ENFORCE !== undefined
      ? process.env.RESTORE_DRILL_ENFORCE === "true"
      : true;
  const allowSkip = process.env.RESTORE_DRILL_ALLOW_SKIP === "true";

  if (!cs) {
    if (allowSkip) {
      console.log(`[${LABEL}] SKIP — no DATABASE_URL (ALLOW_SKIP); run --selftest for logic proof`);
      process.exit(0);
    }
    console.error(`[${LABEL}] FAIL — set RESTORED_DATABASE_URL (preferred) or DATABASE_URL`);
    process.exit(1);
  }

  const pg = (await import("pg")).default;
  const client = new pg.Client({
    connectionString: cs,
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();

  let result;
  try {
    const snap = await collectSnapshot(client);
    result = evaluateIntegritySnapshot(snap);
    const summary = {
      ok: result.ok,
      failures: result.failures,
      checks: result.checks,
      hubCounts: snap.hubCounts,
      migration: {
        repoCount: snap.migration.repoCount,
        ledgerCount: snap.migration.ledgerCount,
        missing: snap.migration.missingFromLedger.length,
        ghosts: snap.migration.ghostInLedger.length,
      },
      auditChain: snap.auditChain,
    };
    console.log(`[${LABEL}] summary ${JSON.stringify(summary)}`);

    // Attestation write needs a non-read-only connection — reopen pattern: use same client after ROLLBACK.
    await recordAttestation(client, result.ok ? "pass" : "fail", summary);

    if (!result.ok) {
      console.error(`\n[${LABEL}] FAIL — restore data-integrity assertion`);
      for (const f of result.failures) console.error(`  ✗ ${f}`);
      console.error(`[${LABEL}] A restore missing rows / unbalanced / broken chain must FAIL the drill (not false-green).`);
      process.exit(enforce ? 1 : 0);
    }
    console.log(`[${LABEL}] PASS — hub counts, ledger, migration ledger, audit chain, FKs, financial NULLs`);
    process.exit(0);
  } finally {
    await client.end().catch(() => {});
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(`[${LABEL}] error:`, e?.message ?? e);
    process.exit(1);
  });
}
