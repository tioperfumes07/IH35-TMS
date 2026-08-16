#!/usr/bin/env node
/**
 * FINDING: row 339 (AUDIT-COVERAGE-LIVE) — accounting.settlement_posting_config held 0 rows on
 * prod. Retracted as a settlement-math bug (row 637): settlement-posting.service.ts falls back to
 * DEFAULT_NET_PAY_FLOOR_PCT (0.05) / '1099' when no row exists, and the table's own column
 * defaults are the same values, so no settlement was ever mis-floored. The REAL defect is the
 * fragile coupling: the 5% wage-protection floor is correct only because a TypeScript constant
 * happens to equal a Postgres column default — nothing enforced that agreement, and an unseeded
 * entity is how the silent-code-default coupling would reappear (e.g. the first time TRK ever
 * settles a driver). Fixed by migration 202611200000_settlement_posting_config_seed_per_entity.sql
 * (SET-CFG-01): seeds TRANSP/TRK/USMCA rows pinned to the existing effective policy, self-checks at
 * migration time that the seed is a no-op on settlement math.
 *
 * That migration protects itself at APPLY time only. Nothing previously protected the invariant on
 * an ONGOING basis — a later PR could still drift DEFAULT_NET_PAY_FLOOR_PCT away from 0.05 with no
 * guard catching it, or a 4th operating entity could go live with no config row.
 *
 * Static check (always runs): DEFAULT_NET_PAY_FLOOR_PCT (the actual constant
 * settlement-posting.service.ts falls back to) is still 0.05, and the seed migration's own
 * post-check invariants are intact on disk.
 *
 * Live check (opt-in, same shape as verify-no-test-units-in-prod.mjs): every known operating
 * company (TRANSP/TRK/USMCA) has a settlement_posting_config row, and every seeded row's values
 * still equal the code default (0.0500 / '1099') — the exact invariant SET-CFG-01 exists to pin.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-posting-config-seeded";
const MIGRATION_REL = "db/migrations/202611200000_settlement_posting_config_seed_per_entity.sql";
const MATH_REL = "apps/backend/src/accounting/settlement-posting/settlement-posting.math.ts";
const KNOWN_ENTITY_CODES = ["TRANSP", "TRK", "USMCA"];
const EXPECTED_FLOOR = "0.0500";
const EXPECTED_CLASS = "1099";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against mutated in-memory copies. */
export function assertStaticInvariants({ mathSource, migrationSource }) {
  const errors = [];

  if (!/export const DEFAULT_NET_PAY_FLOOR_PCT\s*=\s*0\.05\s*;/.test(mathSource)) {
    errors.push(
      "DEFAULT_NET_PAY_FLOOR_PCT no longer equals 0.05 in settlement-posting.math.ts — this drifts the " +
        "wage-protection floor for every entity via a code-only edit, with no migration/audit row (row 339 / row 637)"
    );
  }

  if (!migrationSource.includes("SET-CFG-01")) {
    errors.push("seed migration no longer identifies itself as SET-CFG-01");
  }
  if (!migrationSource.includes("s.net_pay_floor_pct <> 0.0500 OR s.default_worker_classification <> '1099'")) {
    errors.push("seed migration's post-check no longer asserts seeded rows equal the code default (0.0500 / 1099)");
  }
  if (!migrationSource.includes("SET-CFG-01: % operating entit(y/ies) still have no settlement_posting_config row")) {
    errors.push("seed migration's post-check no longer refuses a partial seed (missing entity)");
  }

  return errors;
}

function selftest() {
  const problems = [];
  const mathLive = read(MATH_REL);
  const migrationLive = read(MIGRATION_REL);

  const liveErrors = assertStaticInvariants({ mathSource: mathLive, migrationSource: migrationLive });
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "floor constant drifted",
      { mathSource: mathLive.replace("DEFAULT_NET_PAY_FLOOR_PCT = 0.05;", "DEFAULT_NET_PAY_FLOOR_PCT = 0.10;"), migrationSource: migrationLive },
      "no longer equals 0.05",
    ],
    [
      "SET-CFG-01 identity dropped",
      { mathSource: mathLive, migrationSource: migrationLive.replace(/SET-CFG-01/g, "renamed") },
      "no longer identifies itself as SET-CFG-01",
    ],
    [
      "post-check divergence assertion weakened",
      { mathSource: mathLive, migrationSource: migrationLive.replace("s.net_pay_floor_pct <> 0.0500 OR s.default_worker_classification <> '1099'", "false") },
      "no longer asserts seeded rows equal the code default",
    ],
    [
      "post-check partial-seed refusal removed",
      { mathSource: mathLive, migrationSource: migrationLive.replace(/SET-CFG-01: % operating entit\(y\/ies\) still have no settlement_posting_config row/, "removed") },
      "no longer refuses a partial seed",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated.mathSource === mathLive && mutated.migrationSource === migrationLive) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertStaticInvariants(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    // The prod endpoint is a PgBouncer-style pooler in transaction-pooling mode: a SEPARATE
    // client.query() call can land on a DIFFERENT physical backend, so a set_config() issued in its
    // own call (any is_local value) can silently vanish before the next call runs — the bypass would
    // then look "applied" while the real SELECT sees RLS-filtered rows and the guard reports a false
    // "no active row" pass. Sending SET + SELECT as ONE multi-statement string guarantees the whole
    // simple-query message executes as a single implicit transaction on one backend.
    // No $1 param here on purpose: a parameterized query uses the extended protocol, which Postgres
    // refuses to combine with a multi-statement string ("cannot insert multiple commands into a
    // prepared statement"). KNOWN_ENTITY_CODES is a hardcoded module constant, never external input,
    // so inlining it as a literal array is safe.
    const codesLiteral = KNOWN_ENTITY_CODES.map((code) => `'${code}'`).join(", ");
    const res = await client
      .query(
        `
          SELECT set_config('app.bypass_rls', 'lucia', true);
          SELECT c.code AS entity_code, s.net_pay_floor_pct::text AS floor, s.default_worker_classification AS class
          FROM org.companies c
          LEFT JOIN accounting.settlement_posting_config s ON s.operating_company_id = c.id
          WHERE c.code = ANY(ARRAY[${codesLiteral}])
          ORDER BY c.code;
        `
      )
      .then((r) => (Array.isArray(r) ? r[r.length - 1] : r));

    const byCode = new Map(res.rows.map((r) => [r.entity_code, r]));
    const errors = [];
    for (const code of KNOWN_ENTITY_CODES) {
      const row = byCode.get(code);
      if (!row || row.floor === null) {
        errors.push(`${code} has no settlement_posting_config row`);
        continue;
      }
      if (row.floor !== EXPECTED_FLOOR || row.class !== EXPECTED_CLASS) {
        errors.push(`${code} diverges from the pinned policy: floor=${row.floor} class=${row.class} (expected ${EXPECTED_FLOOR}/${EXPECTED_CLASS})`);
      }
    }

    if (errors.length > 0) {
      console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertStaticInvariants({
    mathSource: read(MATH_REL),
    migrationSource: read(MIGRATION_REL),
  });
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
