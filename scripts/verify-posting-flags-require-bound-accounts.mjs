#!/usr/bin/env node
/**
 * MONEY GATE — every ENABLED posting flag must have its control accounts bound.
 *
 * Extends the #3733 "refuse to arm unbound" idea into a durable CI check: a migration may not
 * switch a posting flag ON for an entity unless the SAME migration names every CoA role that the
 * poster behind that flag resolves. Naming the role is what forces the author to bind or NOTICE+skip
 * it; a flag armed without its control accounts posts a one-sided or failed JE on the first real
 * money event.
 *
 * Required-role sets are read off the posters, not invented:
 *   FACTORING_GL_POSTING_ENABLED   → factoring-posting/poster.service.ts leg roles
 *   FIXED_ASSET_AUTOPOST_ENABLED   → fixed-assets.routes.ts depreciation_je_template (BOTH legs)
 *   QBO_*_PROJECTION_ENABLED       → 202610110000 v_required
 *
 * QBO push flags are never required ON — they are forbidden ON (guard 1723 is the primary; this is
 * a second, independent belt).
 *
 * Usage: node scripts/verify-posting-flags-require-bound-accounts.mjs [--selftest]
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "db/migrations");
const LABEL = "verify-posting-flags-require-bound-accounts";

/** Posting flags that move money / project ledger. Push flags are excluded (must stay OFF). */
export const POSTING_FLAG_REQUIREMENTS = {
  QBO_AR_PAYMENTS_PROJECTION_ENABLED: ["ar_control"],
  QBO_EXPENSES_PROJECTION_ENABLED: ["ap_control", "expense_default"],
  PREPAID_EXPENSES_POST_ENABLED: ["prepaid_asset_default"],
  FINANCE_HUB_AMORTIZATION_POST_ENABLED: ["amortization_expense_default"],
  // Depreciation JE has two legs: expense DEBIT + accumulated-depreciation CREDIT.
  // Arming autopost with only the expense side bound yields an unbalanced/blocked JE.
  FIXED_ASSET_AUTOPOST_ENABLED: ["depr_expense_default", "accum_depr_default"],
  // Every role the factoring poster puts on a leg (advance, reserve release, chargeback, interest).
  FACTORING_GL_POSTING_ENABLED: [
    "factoring_advance_liability",
    "factoring_recoursed_ar",
    "factor_reserve_held",
    "factor_fee_expense",
    "factor_wire_fee",
    "default_interest_expense",
    "ar_control",
    "cash_clearing",
  ],
};

const PUSH_FLAGS = new Set(["QBO_JE_PUSH_ENABLED", "QBO_ENTITY_PUSH_ENABLED"]);

/**
 * Migrations that pre-date this gate and are ALREADY APPLIED on prod. Applied migrations are never
 * edited (per-PR checklist §7), so they cannot be brought up to the naming standard retroactively.
 * This list is a fixed literal: a new migration cannot become exempt without an explicit, reviewed
 * edit here. Push-flag enforcement below is NOT grandfathered — it applies to every file.
 */
const GRANDFATHERED = new Set([
  "202607052300_per_entity_posting_flag_golive.sql",
  "202607890000_qbo_expenses_projection_key_and_flags.sql",
  "202607930000_qbo_ar_payments_projection_flags.sql",
  "202609100040_fact_01_factoring_flag_transp_only.sql",
]);

function stripComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/**
 * A migration that widens accounting.chart_of_accounts_roles_role_check enumerates EVERY role name
 * in one CHECK (role IN (…)) list. Counting that as "the migration names the role" makes this gate
 * vacuous — any migration carrying the widen block would satisfy every requirement for free. Drop
 * the enumeration so a role only counts when it appears in a real binding or precondition.
 */
function stripRoleCheckEnumerations(sql) {
  return sql.replace(/CHECK\s*\(\s*role\s+IN\s*\([^()]*\)\s*\)/gi, "CHECK (role IN (/*enum*/))");
}

function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MIGRATIONS, f));
}

/**
 * Does this statement ARM a per-entity override to true?
 * Ignore: feature_flags registration (default_enabled), SELECT counters, explicit enabled=false.
 */
function statementEnablesFlag(flat, flag) {
  if (!flat.includes(flag)) return false;
  if (PUSH_FLAGS.has(flag)) return false;
  // Must be a write into feature_flag_overrides (INSERT/UPDATE), not a SELECT counter.
  if (!/\b(insert\s+into|update)\s+lib\.feature_flag_overrides\b/i.test(flat)) return false;
  if (/\benabled\s*=\s*false\b/i.test(flat) && !/\benabled\s*=\s*true\b/i.test(flat)) return false;
  // VALUES (…, true, …) or SET enabled = true / DO UPDATE SET enabled = true
  return (
    /\benabled\s*=\s*true\b/i.test(flat) ||
    (/insert\s+into\s+lib\.feature_flag_overrides/i.test(flat) && /\btrue\b/i.test(flat))
  );
}

/**
 * Split on ';' finds most statements, but a ';' inside a DO $$ … $$ body splits PL/pgSQL mid-block
 * and can hide an enable behind the fragment boundary. Scan the whole (comment-stripped) file as an
 * extra candidate so an enable cannot escape detection by living inside a procedural block.
 */
function enablesFlag(sql, flag) {
  const flatWhole = sql.replace(/\s+/g, " ").trim();
  if (statementEnablesFlag(flatWhole, flag)) return true;
  return sql
    .split(";")
    .some((stmt) => statementEnablesFlag(stmt.replace(/\s+/g, " ").trim(), flag));
}

/** @param {Array<{name: string, sql: string}>} sources */
export function analyseSources(sources) {
  const problems = [];
  for (const { name, sql: raw } of sources) {
    const sql = stripComments(raw);

    if (!GRANDFATHERED.has(name)) {
      const roleText = stripRoleCheckEnumerations(sql);
      for (const [flag, roles] of Object.entries(POSTING_FLAG_REQUIREMENTS)) {
        if (!enablesFlag(sql, flag)) continue;
        const missing = roles.filter((r) => !roleText.includes(r));
        if (missing.length) {
          problems.push(`${name}: enables ${flag} without naming role(s): ${missing.join(", ")}`);
        }
      }
    }

    // Push flags must never be armed anywhere — no grandfathering (belt to guard 1723).
    for (const push of PUSH_FLAGS) {
      if (!sql.includes(push)) continue;
      const armed = [sql.replace(/\s+/g, " ").trim(), ...sql.split(";")].some((chunk) => {
        const flat = chunk.replace(/\s+/g, " ").trim();
        return (
          flat.includes(push) &&
          /\b(insert\s+into|update)\s+lib\.feature_flag_overrides\b/i.test(flat) &&
          /\benabled\s*=\s*true\b/i.test(flat)
        );
      });
      if (armed) problems.push(`${name}: FORBIDDEN enable of ${push}`);
    }
  }
  return [...new Set(problems)];
}

export function analyseMigrations(files = migrationFiles()) {
  return analyseSources(
    files.map((file) => ({
      name: file.split(/[/\\]/).pop(),
      sql: readFileSync(file, "utf8"),
    }))
  );
}

function main() {
  const problems = analyseMigrations();
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} defect(s)`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — 0 defects; posting-flag enables name every required CoA role`);
}

const UNBOUND_ENABLE = `
INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled)
VALUES ('PREPAID_EXPENSES_POST_ENABLED', '00000000-0000-0000-0000-000000000001', true);
`;

const PARTIAL_ENABLE = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE role = 'factor_wire_fee') THEN
    INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled)
    VALUES ('FACTORING_GL_POSTING_ENABLED', '00000000-0000-0000-0000-000000000001', true);
  END IF;
END $$;
`;

const PUSH_ENABLE = `
UPDATE lib.feature_flag_overrides SET enabled = true WHERE flag_key = 'QBO_JE_PUSH_ENABLED';
`;

function selftest() {
  // Plant into a TEMP dir, never db/migrations: a killed process must not be able to leave a stray
  // .sql behind that db:migrate would then apply to prod.
  const dir = mkdtempSync(join(tmpdir(), "ih35-posting-flag-gate-"));
  try {
    const cases = [
      ["9999_unbound.sql", UNBOUND_ENABLE, "PREPAID_EXPENSES_POST_ENABLED", "bare enable"],
      ["9999_partial.sql", PARTIAL_ENABLE, "factoring_advance_liability", "partially-bound enable"],
      ["9999_push.sql", PUSH_ENABLE, "FORBIDDEN enable of QBO_JE_PUSH_ENABLED", "push-flag enable"],
    ];
    for (const [name, sql, needle, label] of cases) {
      writeFileSync(join(dir, name), sql);
      const problems = analyseSources([{ name, sql }]);
      if (!problems.some((p) => p.includes(needle))) {
        console.error(`SELFTEST FAIL: ${label} not detected (needle: ${needle})`);
        console.error(`  got: ${JSON.stringify(problems)}`);
        process.exit(1);
      }
      console.log(`SELFTEST: ${label} detected`);
    }
    // Negative control — a fully-named enable must NOT be flagged.
    const goodRoles = POSTING_FLAG_REQUIREMENTS.FACTORING_GL_POSTING_ENABLED.join(" ");
    const good = `${PARTIAL_ENABLE}\n-- roles handled elsewhere\nSELECT '${goodRoles}';`;
    if (analyseSources([{ name: "9999_good.sql", sql: good }]).length) {
      console.error("SELFTEST FAIL: fully-named enable was flagged (false positive)");
      process.exit(1);
    }
    console.log("SELFTEST: fully-named enable passes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
