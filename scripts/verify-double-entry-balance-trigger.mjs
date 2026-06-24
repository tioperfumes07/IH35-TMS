#!/usr/bin/env node
/**
 * TIER 1 TRUST — Block 5: Double-Entry Balance Guard
 *
 * Static (file-system) guard that asserts the double-entry balance constraint
 * is present in the migration files and that no subsequent migration silently
 * drops or replaces it.
 *
 * Two modes:
 *
 *   STATIC (default — `npm run verify:double-entry-balance`):
 *     File-system guard that runs in CI WITHOUT a Postgres connection.
 *     1. accounting.ensure_journal_entry_balanced() function is defined in the
 *        canonical migration (0092_p5_d4_manual_journal_entries.sql).
 *     2. trg_check_journal_entry_balanced CONSTRAINT TRIGGER is defined on
 *        accounting.journal_entry_postings in the same migration and is marked
 *        DEFERRABLE INITIALLY DEFERRED.
 *     3. No migration file drops accounting.ensure_journal_entry_balanced.
 *     4. No migration file drops trg_check_journal_entry_balanced.
 *     5. No migration file creates accounting.journal_entry_lines (forbidden by
 *        verify-accounting-backbone-schema — duplicated here as belt-and-suspenders).
 *
 *   LIVE (`--live` flag — `npm run db:verify:double-entry-balance`):
 *     Runs the static checks first, then connects to the REAL database named by
 *     DATABASE_URL / DATABASE_DIRECT_URL and asserts the constraint trigger is
 *     actually attached to accounting.journal_entry_postings. This catches the
 *     class of drift discovered on 2026-06-07: 0092 marked applied + function
 *     present, yet the trigger missing in production (double-entry UNENFORCED).
 *
 *     The static guard is decoupled from the live check ON PURPOSE: the static
 *     guard runs in CI before the verify DB is guaranteed to be migrated, so it
 *     must never depend on a live connection. The live check is opt-in via the
 *     --live flag (wired as the db:verify:double-entry-balance npm script) and
 *     MUST be run post-deploy against production before any financial-write
 *     block merges. See docs/finance/double-entry.md.
 *
 * Exit 0 → all checks pass
 * Exit 1 → at least one check failed (message printed to stderr)
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// The STATIC guard intentionally has no third-party imports so it always runs in
// CI without a DB or installed runtime deps. `pg`/`dotenv` are loaded lazily only
// when the --live flag is used (see runLiveDbCheck).
const LIVE = process.argv.includes("--live");

const CANONICAL_MIGRATION = "db/migrations/0092_p5_d4_manual_journal_entries.sql";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) {
    throw new Error(message);
  }
}

function assertNotMatches(source, regex, message) {
  if (regex.test(source)) {
    throw new Error(message);
  }
}

try {
  // ── 1 & 2. Function + trigger present in canonical migration ─────────────
  const canonical = read(CANONICAL_MIGRATION);

  assertMatches(
    canonical,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+accounting\.ensure_journal_entry_balanced\s*\(\s*\)/i,
    `accounting.ensure_journal_entry_balanced() function not found in ${CANONICAL_MIGRATION}`,
  );

  assertMatches(
    canonical,
    /CREATE\s+CONSTRAINT\s+TRIGGER\s+trg_check_journal_entry_balanced/i,
    `CONSTRAINT TRIGGER trg_check_journal_entry_balanced not found in ${CANONICAL_MIGRATION}`,
  );

  assertMatches(
    canonical,
    /trg_check_journal_entry_balanced[\s\S]{0,300}DEFERRABLE\s+INITIALLY\s+DEFERRED/i,
    `trg_check_journal_entry_balanced is not DEFERRABLE INITIALLY DEFERRED in ${CANONICAL_MIGRATION}`,
  );

  assertMatches(
    canonical,
    /AFTER\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+accounting\.journal_entry_postings/i,
    `trg_check_journal_entry_balanced is not on accounting.journal_entry_postings in ${CANONICAL_MIGRATION}`,
  );

  console.log(`✅ [1/4] ensure_journal_entry_balanced() defined in ${CANONICAL_MIGRATION}`);
  console.log(`✅ [2/4] trg_check_journal_entry_balanced CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED confirmed`);

  // ── 3 & 4. No subsequent migration drops the function or trigger ─────────
  const migrationsDir = "db/migrations";
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const dropsFunction = [];
  const dropsTrigger = [];
  const createsJournalEntryLines = [];

  for (const file of migrationFiles) {
    if (file === path.basename(CANONICAL_MIGRATION)) continue;

    const sql = read(path.join(migrationsDir, file));

    // DROP FUNCTION variants
    if (/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?accounting\.ensure_journal_entry_balanced\b/i.test(sql)) {
      dropsFunction.push(file);
    }

    // CREATE OR REPLACE FUNCTION that replaces without preserving the balance check
    // We flag any re-definition outside the canonical file so it must be reviewed.
    if (
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+accounting\.ensure_journal_entry_balanced\s*\(/i.test(sql)
    ) {
      // A re-definition is only acceptable if it still raises an exception on imbalance.
      // Check that it still contains the imbalance RAISE EXCEPTION.
      if (!/RAISE\s+EXCEPTION\s+['"]journal\s+entry/i.test(sql)) {
        dropsFunction.push(`${file} (re-defines function WITHOUT balance RAISE EXCEPTION — balance check removed)`);
      }
    }

    // DROP TRIGGER variants
    if (/DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?trg_check_journal_entry_balanced\b/i.test(sql)) {
      // A DROP followed immediately by a CREATE in the SAME file is OK (idempotent re-creation).
      if (!/CREATE\s+CONSTRAINT\s+TRIGGER\s+trg_check_journal_entry_balanced/i.test(sql)) {
        dropsTrigger.push(`${file} (drops trigger without re-creating it)`);
      }
    }

    // Forbidden table
    if (
      /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?accounting\.journal_entry_lines\b/i.test(sql)
    ) {
      createsJournalEntryLines.push(file);
    }
  }

  const failures = [];

  if (dropsFunction.length > 0) {
    for (const f of dropsFunction) {
      failures.push(`accounting.ensure_journal_entry_balanced() dropped or replaced without balance check in: ${f}`);
    }
  } else {
    console.log(`✅ [3/4] No migration drops accounting.ensure_journal_entry_balanced() (${migrationFiles.length} files scanned)`);
  }

  if (dropsTrigger.length > 0) {
    for (const f of dropsTrigger) {
      failures.push(`trg_check_journal_entry_balanced dropped without re-creation in: ${f}`);
    }
  } else {
    console.log(`✅ [4/4] No migration drops trg_check_journal_entry_balanced without re-creating it`);
  }

  if (createsJournalEntryLines.length > 0) {
    for (const f of createsJournalEntryLines) {
      failures.push(`accounting.journal_entry_lines forbidden — canonical lines table is accounting.journal_entry_postings (found in: ${f})`);
    }
  }

  // Forbidden WRITE (H-1, 2026-06-24): no route/service may INSERT INTO accounting.journal_entry_lines —
  // every JE must post via createJournalEntry() → accounting.journal_entry_postings (the canonical GL table the
  // trial balance reads). The old guard only forbade CREATEing the table; the (now-archived) banking manual-JE
  // route INSERTed into it and was NOT caught. This scans the backend source too.
  const backendSrcDir = path.join(process.cwd(), "apps/backend/src");
  const insertOffenders = [];
  const walkTs = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walkTs(p);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".deprecated.ts")) {
        // .deprecated.ts = archived/unmounted code (ARCHIVE-never-DELETE); the guard targets LIVE writers only.
        if (/INSERT\s+INTO\s+accounting\.journal_entry_lines\b/i.test(fs.readFileSync(p, "utf8"))) {
          insertOffenders.push(p.replace(process.cwd() + "/", ""));
        }
      }
    }
  };
  if (fs.existsSync(backendSrcDir)) walkTs(backendSrcDir);
  if (insertOffenders.length > 0) {
    for (const f of insertOffenders) {
      failures.push(
        `${f}: INSERT INTO accounting.journal_entry_lines — forbidden write. Post via createJournalEntry() → accounting.journal_entry_postings (the GL/trial-balance table).`
      );
    }
  } else {
    console.log("✅ [5/5] No route/service INSERTs into accounting.journal_entry_lines (canonical postings path only)");
  }

  if (failures.length > 0) {
    for (const msg of failures) {
      console.error(`✘ ${msg}`);
    }
    process.exit(1);
  }

  console.log("✅ verify-double-entry-balance-trigger (static) passed");
} catch (error) {
  console.error(`✘ verify-double-entry-balance-trigger: ${error.message}`);
  process.exit(1);
}

// ── LIVE-DB CHECK (opt-in via --live) ───────────────────────────────────────
// Asserts the constraint trigger is actually attached in the target database.
if (LIVE) {
  await runLiveDbCheck();
}

async function runLiveDbCheck() {
  const require = createRequire(import.meta.url);
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = (await import("pg")).default;
  try {
    (await import("dotenv")).default.config();
  } catch {
    // dotenv is optional — env vars may already be present in the shell.
  }

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "✘ db:verify:double-entry-balance: DATABASE_URL (or DATABASE_DIRECT_URL) must be set for the live-DB check",
    );
    process.exit(1);
  }

  const { Client } = pg;
  const client = new Client(buildPgClientConfig(connectionString, { connectionTimeoutMillis: 15000 }));

  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'accounting'
        AND c.relname = 'journal_entry_postings'
        AND t.tgname = 'trg_check_journal_entry_balanced'
        AND t.tgconstraint > 0
    `);
    const count = rows[0]?.count ?? 0;

    if (count < 1) {
      console.error(
        "✘ CRITICAL: trg_check_journal_entry_balanced is NOT attached in the target DB — double-entry is UNENFORCED",
      );
      process.exit(1);
    }

    console.log(
      `✅ live-DB check: trg_check_journal_entry_balanced is attached as a constraint trigger on accounting.journal_entry_postings (count=${count})`,
    );
  } catch (error) {
    console.error(`✘ db:verify:double-entry-balance live check failed: ${error.message}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}
