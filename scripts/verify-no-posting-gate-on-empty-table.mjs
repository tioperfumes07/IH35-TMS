#!/usr/bin/env node
/** @independent-input DATABASE_URL — queries every declared launch-owed table under verified bypass. */
/**
 * verify-no-posting-gate-on-empty-table.mjs — EMPTY-POSTING-GATE-CLASS guard (CC-2)
 *
 * docs/lockdown/EMPTY-POSTING-GATE-CLASS-2026-08-28.md: "Same shape as ACCT-F5692
 * missing_pod_evidence — fail-closed poster returns a gate string; Chrome walk PASSes; GL does
 * not move." A table that gates a poster/match/recon/factoring-submit/loan/detention/POD/Faro-
 * import/tax-doc/RP-schedule path but holds 0 USMCA rows means that entire path is silently
 * inert — the UI can look complete while nothing can ever post through it.
 *
 * docs/lockdown/OWNER-NEVER-IDLE-SEED-EVERY-TABLE-2026-08-27.md §3: "CC-2 extends
 * docs/specs/scoreboard/posting-gate-tables.json by tracing posters." This guard reads that
 * registry and fails when any table with launch_owed: true has 0 USMCA rows — lucia bypass
 * (a plain SELECT COUNT(*) on a FORCE-RLS table would report 0 for the wrong reason) plus a
 * completeness discriminator (current_user asserted in the same transaction) so a masked-RLS
 * zero is never mistaken for a genuine empty table, per this session's own "an empty result is
 * an instrument claim" standard.
 *
 *   node scripts/verify-no-posting-gate-on-empty-table.mjs
 *   node scripts/verify-no-posting-gate-on-empty-table.mjs --selftest
 *
 * DEGRADE-SAFE: no DATABASE_URL → skip with a warning, exit 0 (never crash CI on infra absence;
 * mirrors scripts/verify-balanced-ledger.mjs). Read-only — never inserts/updates a row; seeding
 * the actual TEST rows is separate, owner-directed work per seat/table-domain.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const REGISTRY_PATH = "docs/specs/scoreboard/posting-gate-tables.json";

export function loadLaunchOwedTables(registry) {
  const tables = Array.isArray(registry?.tables) ? registry.tables : [];
  return tables.filter((t) => t && t.launch_owed === true && typeof t.table === "string" && t.table.trim());
}

function qualifiedTableRegex(table) {
  // "schema.table" -> schema and table identifiers, each a plain word (no injection surface —
  // values come from the checked-in JSON registry, never user input, but validate the shape
  // anyway before interpolating into SQL).
  const m = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/.exec(table);
  return m ? { schema: m[1], table: m[2] } : null;
}

async function main() {
  const registryFile = path.join(root, REGISTRY_PATH);
  const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
  const owedTables = loadLaunchOwedTables(registry);

  if (owedTables.length === 0) {
    console.log(`[posting-gate] PASS — 0 launch_owed tables declared in ${REGISTRY_PATH} (nothing to check)`);
    process.exit(0);
  }

  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.warn("[posting-gate] no DATABASE_URL — skipping (advisory). CI/cron with a DB is the real gate.");
    process.exit(0);
  }

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs, max: 2 });

  try {
    const client = await pool.connect();
    const violations = [];
    const malformed = [];
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");

      // Completeness discriminator: assert we are actually inside the bypass, in this same
      // transaction, before trusting any 0-count below — "THE BYPASS IS NOT PROOF" applies to
      // AND-gated policies, so a wrong role/GUC state must fail loud, not report a false empty.
      const who = await client.query("SELECT current_user AS u, current_setting('app.bypass_rls', true) AS b");
      const bypassActive = who.rows[0]?.b === "lucia";
      if (!bypassActive) {
        throw new Error(
          `completeness discriminator failed: app.bypass_rls did not read back as 'lucia' (current_user=${who.rows[0]?.u}) — refusing to trust any row count from this connection`
        );
      }

      const companyRes = await client.query("SELECT id::text AS id FROM org.companies WHERE code = 'USMCA' LIMIT 1");
      const usmcaId = companyRes.rows[0]?.id;
      if (!usmcaId) {
        throw new Error("completeness discriminator failed: org.companies has no row with code='USMCA' — cannot scope the check");
      }

      for (const entry of owedTables) {
        const q = qualifiedTableRegex(entry.table);
        if (!q) {
          malformed.push(entry.table);
          continue;
        }
        const existsRes = await client.query(
          `SELECT to_regclass($1) IS NOT NULL AS ok`,
          [`${q.schema}.${q.table}`]
        );
        if (!existsRes.rows[0]?.ok) {
          violations.push({ table: entry.table, reason: "table does not exist on this database", path: entry.path });
          continue;
        }
        const countRes = await client.query(
          `SELECT COUNT(*)::text AS n FROM ${q.schema}.${q.table} WHERE operating_company_id = $1::uuid`,
          [usmcaId]
        );
        const n = Number(countRes.rows[0]?.n ?? 0);
        if (n === 0) {
          violations.push({ table: entry.table, reason: "0 USMCA rows", path: entry.path, triage: entry.triage });
        }
      }
      await client.query("ROLLBACK"); // read-only — never commit a write, there isn't one, but stay explicit.
    } finally {
      client.release();
    }

    if (malformed.length > 0) {
      console.error(`[posting-gate] FAIL — malformed table name(s) in ${REGISTRY_PATH} (expected "schema.table"): ${malformed.join(", ")}`);
      process.exit(1);
    }

    if (violations.length === 0) {
      console.log(`[posting-gate] PASS — all ${owedTables.length} launch_owed table(s) hold >=1 USMCA row`);
      process.exit(0);
    }

    console.error(`\nEMPTY POSTING-GATE CLASS — ${violations.length} launch_owed table(s) still at 0 USMCA rows`);
    console.error("=".repeat(64));
    for (const v of violations) {
      console.error(`  ${v.table} (${v.path}) — ${v.reason}${v.triage ? ` [triage: ${v.triage}]` : ""}`);
    }
    console.error("=".repeat(64));
    console.error(`Seed a labeled TEST row through the live wizard (never a SQL dump unless the money poster requires it). Do not delete an existing fixture to "fix" this.`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function selftest() {
  const registryFile = path.join(root, REGISTRY_PATH);
  const text = fs.readFileSync(registryFile, "utf8");
  const registry = JSON.parse(text);

  const owed = loadLaunchOwedTables(registry);
  if (owed.length === 0) {
    console.error("FAIL(selftest): baseline registry has 0 launch_owed tables — nothing to plant an offender against");
    process.exit(1);
  }
  if (!owed.every((t) => qualifiedTableRegex(t.table))) {
    console.error("FAIL(selftest): a launch_owed table name in the registry does not parse as schema.table");
    process.exit(1);
  }

  // Offender: launch_owed table with a malformed name (no schema qualifier) must be caught by the
  // malformed-name path rather than silently skipped.
  const offenderRegistry = { ...registry, tables: [...registry.tables, { table: "not_qualified", launch_owed: true, path: "selftest" }] };
  const offenderOwed = loadLaunchOwedTables(offenderRegistry);
  const offenderMalformed = offenderOwed.filter((t) => !qualifiedTableRegex(t.table));
  if (offenderMalformed.length === 0) {
    console.error("FAIL(selftest): planted malformed table name was NOT flagged");
    process.exit(1);
  }

  // Offender: dropping launch_owed:true from every real entry must change the owed set (proves
  // the filter is load-bearing, not a no-op that would silently pass every table forever).
  const droppedRegistry = { ...registry, tables: registry.tables.map((t) => ({ ...t, launch_owed: false })) };
  const droppedOwed = loadLaunchOwedTables(droppedRegistry);
  if (droppedOwed.length !== 0) {
    console.error("FAIL(selftest): dropping launch_owed:true from every entry did not empty the owed set — filter is not load-bearing");
    process.exit(1);
  }

  console.log(`PASS(selftest): ${owed.length} launch_owed table(s) parse cleanly; malformed-name and launch_owed-filter offenders both correctly caught`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    main().catch((e) => {
      console.error("[posting-gate] error:", e?.message ?? e);
      process.exit(1);
    });
  }
}
