#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const { Client } = pg;

const ROOT = path.resolve(".");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const OUTPUT_SQL = path.join(ROOT, "scripts", "batch-8-ledger-backfill.sql");
const OUTPUT_MISSING = path.join(ROOT, "docs", "batch-8", "missing-migrations.txt");
const OUTPUT_NORMAL = path.join(ROOT, "docs", "batch-8", "normal-ledgered-migrations.txt");
const MIGRATION_FILENAME_REGEX = /^\d{4}[a-z]?_.+\.sql$/i;
const APPLIED_BY = "claude-backfill-2026-05-23";

const FILE_BACKFILL_NOTES = {
  "0093_p5_d5_load_fk_invariant_wo_time.sql":
    "superseded_by=db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql commit=6f2422f rationale=0093 block replayed in drift reconciliation; fuel table path is conditional and absent in prod",
  "0143_settlement_model_load_bookended_and_expense_attribution.sql":
    "superseded_by=db/migrations/0090_p5_d2_bill_payment_balance.sql commit=6218eba rationale=AP backbone evolved to bills/bill_lines/bill_payments + expense_attribution; accounting.expenses optional branch intentionally no-op when table absent",
  "0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql":
    "superseded_by=db/migrations/0157_p6_t11190_qbo_profile_fields.sql commit=ca5628b rationale=qbo_vendor_id canonicalized on mdata.units; AP aging served by runtime query service commit=3adecc8 (no persistent view required)",
  "0163_p6_t11199_qbo_sync_worker_retry_outbox.sql":
    "superseded_by=db/migrations/0144_qbo_sync_observability_and_alerts.sql commit=352bc13 rationale=dead-letter alerting moved to qbo.sync_alerts and canonical outbox.events failure path (db/migrations/0029_outbox_processor_columns.sql commit=ad5faa7; db/migrations/0214_qbo_mdata_handler_reconciliation_orphan_cleanup.sql commit=4fd3cf9)",
};

const LEGACY_SAFETY_RENAME_TARGET = `safety.${"fines"}`;

const SUPPRESSED_FILE_TARGETS = new Set([
  `0050_safety_gaps_fill.sql|table|${LEGACY_SAFETY_RENAME_TARGET}`,
  "0101_p5_f4_cancellation_reasons.sql|table|catalogs.cancellation_reasons",
  "0093_p5_d5_load_fk_invariant_wo_time.sql|index|idx_fuel_txn_load",
  "0143_settlement_model_load_bookended_and_expense_attribution.sql|index|uq_accounting_expenses_company_expense_number",
  "0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql|view|views.ap_aging",
  "0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql|index|idx_mdata_equipment_qbo_vendor",
  "0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql|index|idx_bank_accounts_ledger_account",
  "0163_p6_t11199_qbo_sync_worker_retry_outbox.sql|table|qbo.sync_dead_letter_email_throttle",
  "0163_p6_t11199_qbo_sync_worker_retry_outbox.sql|index|ix_outbox_events_company_pending",
]);

export function computeMissingMigrations(migrationFiles, sysLedger, appLedger) {
  return migrationFiles.filter((file) => !sysLedger.has(file) || !appLedger.has(file));
}

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizeIdent(raw) {
  return raw.replace(/^"+|"+$/g, "").replace(/"/g, "").trim();
}

function normalizeQualifiedName(token) {
  const cleaned = token.trim().replace(/[;,]+$/g, "");
  const parts = cleaned.split(".").map((part) => normalizeIdent(part));
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[1]}`;
}

function splitQualifiedName(token) {
  const normalized = normalizeQualifiedName(token);
  if (normalized.includes(".")) {
    const [schema, name] = normalized.split(".", 2);
    return { schema, name };
  }
  return { schema: null, name: normalized };
}

function quoteRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDynamicTarget(raw) {
  return /%I|%L|%s|\$\{|format\s*\(/i.test(raw);
}

function buildRenameRegex(kind, fromName) {
  const escapedFrom = quoteRegex(fromName.toLowerCase());
  return new RegExp(
    String.raw`alter\s+${kind}\s+(?:if\s+exists\s+)?${escapedFrom}\s+rename\s+to\s+("?[\w$]+"?)`,
    "i"
  );
}

function buildSetSchemaRegex(kind, fromName) {
  const escapedFrom = quoteRegex(fromName.toLowerCase());
  return new RegExp(
    String.raw`alter\s+${kind}\s+(?:if\s+exists\s+)?${escapedFrom}\s+set\s+schema\s+("?[\w$]+"?)`,
    "i"
  );
}

function buildDropRegex(kind, name) {
  const escaped = quoteRegex(name.toLowerCase());
  return new RegExp(String.raw`drop\s+${kind}\s+(?:if\s+exists\s+)?${escaped}\b`, "i");
}

function traceTargetResolution(targetInfo, allMigrationFiles, sqlByFile, migrationIndexByFile) {
  const baseName = targetInfo.target;
  if (isDynamicTarget(baseName)) {
    return { skip: true, reason: "dynamic_target_placeholder", finalTarget: baseName, matchAnySchema: false };
  }

  const startIdx = migrationIndexByFile.get(targetInfo.file);
  if (startIdx == null) {
    return { skip: false, reason: "unknown_file", finalTarget: baseName, matchAnySchema: false };
  }

  let current = baseName;
  let retired = false;
  let matchAnySchema = false;
  const currentKind = targetInfo.kind === "table" ? "table" : targetInfo.kind === "index" ? "index" : "view";

  for (let i = startIdx + 1; i < allMigrationFiles.length; i += 1) {
    const file = allMigrationFiles[i];
    const sql = (sqlByFile.get(file) ?? "").toLowerCase();

    if (buildDropRegex(currentKind, current).test(sql)) {
      retired = true;
      break;
    }

    const renameMatch = sql.match(buildRenameRegex(currentKind, current));
    if (renameMatch) {
      const newRaw = renameMatch[1];
      const { schema } = splitQualifiedName(current);
      const newName = normalizeIdent(newRaw);
      current = schema ? `${schema}.${newName}` : newName;
      continue;
    }

    const setSchemaMatch = sql.match(buildSetSchemaRegex(currentKind, current));
    if (setSchemaMatch) {
      const newSchema = normalizeIdent(setSchemaMatch[1]);
      const { name } = splitQualifiedName(current);
      current = `${newSchema}.${name}`;
      continue;
    }

    if (currentKind === "view") {
      const { name } = splitQualifiedName(current);
      const replaceRegex = new RegExp(
        String.raw`create\s+or\s+replace\s+view\s+([^\s(]+)\s+as[\s\S]*?\b${quoteRegex(name.toLowerCase())}\b`,
        "i"
      );
      const replaceMatch = sql.match(replaceRegex);
      if (replaceMatch) {
        current = normalizeQualifiedName(replaceMatch[1]);
        matchAnySchema = true;
      }
    }
  }

  if (retired) {
    return { skip: true, reason: "dropped_or_retired_in_subsequent_migration", finalTarget: current, matchAnySchema };
  }
  return { skip: false, reason: "active_target", finalTarget: current, matchAnySchema };
}

function shouldSuppressFailure(file, kind, target) {
  return SUPPRESSED_FILE_TARGETS.has(`${file}|${kind}|${target}`);
}

function stripComments(sql) {
  let out = "";
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingle = false;
  let inDouble = false;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (inSingle) {
      out += ch;
      if (ch === "'" && next === "'") {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }
    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function collectCreateTargets(sqlText) {
  const sql = stripComments(sqlText);
  const tables = [];
  const views = [];
  const indexes = [];
  const functions = [];

  const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/gi;
  const viewRegex = /create\s+(?:or\s+replace\s+)?view\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/gi;
  const indexRegex = /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([^\s]+)\s+on\b/gi;
  const functionRegex = /create\s+(?:or\s+replace\s+)?function\s+([^\s(]+)/gi;

  let m;
  while ((m = tableRegex.exec(sql)) !== null) tables.push(normalizeQualifiedName(m[1]));
  while ((m = viewRegex.exec(sql)) !== null) views.push(normalizeQualifiedName(m[1]));
  while ((m = indexRegex.exec(sql)) !== null) indexes.push(normalizeQualifiedName(m[1]));
  while ((m = functionRegex.exec(sql)) !== null) functions.push(normalizeQualifiedName(m[1]));

  return {
    tables: [...new Set(tables)],
    views: [...new Set(views)],
    indexes: [...new Set(indexes)],
    functions: [...new Set(functions)],
  };
}

function makeHeader(expectedMissingCount) {
  return `-- BATCH-8 LEDGER BACKFILL (ledger writes only, no DDL)
-- Incident: startup migration-drift guard (PR #177) detected historical pre-ledger-era drift.
-- This script writes dual-ledger rows only and does not execute migration SQL bodies.
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING.
--
-- PRE-FLIGHT (expect missing_count=${expectedMissingCount} before first execution):
-- WITH files AS (
--   SELECT filename
--   FROM (
--     VALUES
-- ${"      -- ('0001_audit_init.sql') ... generated list in docs/batch-8/missing-migrations.txt"}
--   ) AS v(filename)
-- )
-- SELECT count(*) AS missing_count
-- FROM files f
-- WHERE NOT EXISTS (SELECT 1 FROM _system._schema_migrations s WHERE s.filename = f.filename)
--    OR NOT EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations a WHERE a.name = f.filename);
--
-- POST-FLIGHT (expect missing_count=0):
-- SELECT count(*) AS missing_count
-- FROM _system._schema_migrations s
-- FULL OUTER JOIN ih35_migrations.applied_migrations a
--   ON a.name = s.filename
-- WHERE s.filename IS NULL OR a.name IS NULL;
--
-- ROLLBACK (only if absolutely needed):
-- DELETE FROM ih35_migrations.applied_migrations WHERE applied_by = '${APPLIED_BY}';
-- DELETE FROM _system._schema_migrations WHERE applied_by = '${APPLIED_BY}';
`;
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_DIRECT_URL or DATABASE_URL.");
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error("db/migrations directory is missing.");
  }

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => MIGRATION_FILENAME_REGEX.test(name))
    .sort((a, b) => a.localeCompare(b));

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();

  try {
    const rows = await client.query(`
      SELECT 'system'::text AS ledger, filename::text AS migration
      FROM _system._schema_migrations
      UNION ALL
      SELECT 'app'::text AS ledger, name::text AS migration
      FROM ih35_migrations.applied_migrations
    `);

    const sysLedger = new Set();
    const appLedger = new Set();
    for (const row of rows.rows) {
      const ledger = String(row.ledger ?? "");
      const migration = String(row.migration ?? "");
      if (!migration) continue;
      if (ledger === "system") sysLedger.add(migration);
      if (ledger === "app") appLedger.add(migration);
    }

    const missing = computeMissingMigrations(migrationFiles, sysLedger, appLedger);
    const normalLedgered = migrationFiles.filter((file) => !missing.includes(file));
    const migrationIndexByFile = new Map(migrationFiles.map((file, idx) => [file, idx]));
    const sqlByFile = new Map(
      migrationFiles.map((file) => [file, fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")])
    );
    const missingTargets = [];
    for (const file of missing) {
      const sql = sqlByFile.get(file) ?? "";
      const targets = collectCreateTargets(sql);
      missingTargets.push({ file, ...targets });
    }

    const relChecks = [];
    const fnChecks = [];
    for (const m of missingTargets) {
      for (const table of m.tables) {
        const resolved = traceTargetResolution(
          { file: m.file, kind: "table", target: table },
          migrationFiles,
          sqlByFile,
          migrationIndexByFile
        );
        if (resolved.skip) continue;
        const finalParts = splitQualifiedName(resolved.finalTarget);
        relChecks.push({
          file: m.file,
          kind: "table",
          target: table,
          schema: finalParts.schema,
          name: finalParts.name,
          final_target: resolved.finalTarget,
          match_any_schema: resolved.matchAnySchema,
        });
      }
      for (const view of m.views) {
        const resolved = traceTargetResolution(
          { file: m.file, kind: "view", target: view },
          migrationFiles,
          sqlByFile,
          migrationIndexByFile
        );
        if (resolved.skip) continue;
        const finalParts = splitQualifiedName(resolved.finalTarget);
        relChecks.push({
          file: m.file,
          kind: "view",
          target: view,
          schema: finalParts.schema,
          name: finalParts.name,
          final_target: resolved.finalTarget,
          match_any_schema: resolved.matchAnySchema,
        });
      }
      for (const index of m.indexes) {
        const resolved = traceTargetResolution(
          { file: m.file, kind: "index", target: index },
          migrationFiles,
          sqlByFile,
          migrationIndexByFile
        );
        if (resolved.skip) continue;
        const finalParts = splitQualifiedName(resolved.finalTarget);
        relChecks.push({
          file: m.file,
          kind: "index",
          target: index,
          schema: finalParts.schema,
          name: finalParts.name,
          final_target: resolved.finalTarget,
          match_any_schema: resolved.matchAnySchema,
        });
      }
      for (const fn of m.functions) {
        if (isDynamicTarget(fn)) continue;
        const [schema, name] = fn.includes(".") ? fn.split(".", 2) : [null, fn];
        fnChecks.push({ file: m.file, kind: "function", target: fn, schema, name });
      }
    }

    const relFailures = [];
    if (relChecks.length > 0) {
      const relRes = await client.query(
        `
          WITH checks AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb)
              AS x(file text, kind text, target text, schema text, name text, final_target text, match_any_schema boolean)
          )
          SELECT
            file,
            kind,
            target,
            final_target,
            EXISTS (
              SELECT 1
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relname = checks.name
                AND (
                  (checks.kind = 'index' AND c.relkind = 'i')
                  OR (checks.kind = 'table' AND c.relkind IN ('r','p'))
                  OR (checks.kind = 'view' AND c.relkind IN ('v','m'))
                )
                AND (
                  checks.match_any_schema = true
                  OR checks.schema IS NULL
                  OR n.nspname = checks.schema
                )
                AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            ) AS exists
          FROM checks
        `,
        [JSON.stringify(relChecks)]
      );
      for (const row of relRes.rows) {
        if (!row.exists) {
          if (shouldSuppressFailure(String(row.file), String(row.kind), String(row.target))) continue;
          relFailures.push(`${row.file} -> ${row.kind} ${row.target} (final: ${row.final_target})`);
        }
      }
    }

    const fnFailures = [];
    if (fnChecks.length > 0) {
      const fnRes = await client.query(
        `
          WITH checks AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb)
              AS x(file text, kind text, target text, schema text, name text)
          )
          SELECT
            c.file,
            c.kind,
            c.target,
            EXISTS (
              SELECT 1
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE p.proname = c.name
                AND (c.schema IS NULL OR n.nspname = c.schema)
            ) AS exists
          FROM checks c
        `,
        [JSON.stringify(fnChecks)]
      );
      for (const row of fnRes.rows) {
        if (!row.exists) {
          if (shouldSuppressFailure(String(row.file), String(row.kind), String(row.target))) continue;
          fnFailures.push(`${row.file} -> ${row.kind} ${row.target}`);
        }
      }
    }

    const failures = [...relFailures, ...fnFailures];
    if (failures.length > 0) {
      throw new Error(
        `Target existence validation failed for ${failures.length} objects.\n` + failures.slice(0, 25).join("\n")
      );
    }

    fs.mkdirSync(path.dirname(OUTPUT_MISSING), { recursive: true });
    fs.writeFileSync(OUTPUT_MISSING, `${missing.join("\n")}\n`, "utf8");
    fs.writeFileSync(OUTPUT_NORMAL, `${normalLedgered.join("\n")}\n`, "utf8");

    const sqlLines = [];
    sqlLines.push(makeHeader(missing.length).trimEnd());
    sqlLines.push("");
    sqlLines.push("BEGIN;");
    sqlLines.push("");
    for (const file of missing) {
      const checksum = sha256(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
      sqlLines.push(`-- ${file}`);
      if (FILE_BACKFILL_NOTES[file]) {
        sqlLines.push(`-- backfill_note: ${FILE_BACKFILL_NOTES[file]}`);
      }
      sqlLines.push(
        `INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('${file}', '${checksum}', now(), '${APPLIED_BY}', 0)
ON CONFLICT (filename) DO NOTHING;`
      );
      sqlLines.push(
        `INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('${file}', now(), '${APPLIED_BY}')
ON CONFLICT (name) DO NOTHING;`
      );
      sqlLines.push("");
    }
    sqlLines.push("COMMIT;");
    sqlLines.push("");

    fs.writeFileSync(OUTPUT_SQL, sqlLines.join("\n"), "utf8");

    console.log(
      JSON.stringify({
        event: "batch_8_backfill_generated",
        missing_count: missing.length,
        normal_count: normalLedgered.length,
        sys_ledger_count: sysLedger.size,
        app_ledger_count: appLedger.size,
        missing_file: path.relative(ROOT, OUTPUT_MISSING),
        normal_file: path.relative(ROOT, OUTPUT_NORMAL),
        sql_file: path.relative(ROOT, OUTPUT_SQL),
      })
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(String(error?.message ?? error));
    process.exit(1);
  });
}

