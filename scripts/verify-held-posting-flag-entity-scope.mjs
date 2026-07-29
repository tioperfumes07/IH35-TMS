#!/usr/bin/env node
/**
 * ACCT-F43 — the held posting flags may only be armed for the entities the owner named, only through
 * a per-entity override, and never on the back of a control account picked by name shape.
 *
 * Owner ruling (Cursor-WORKORDER-Money.md §2):
 *   PREPAID_EXPENSES_POST_ENABLED          TRK + USMCA
 *   FINANCE_HUB_AMORTIZATION_POST_ENABLED  TRK + USMCA
 *   FIXED_ASSET_AUTOPOST_ENABLED           TRK only — TRANSP leases its equipment, it does not own it
 *
 * Three independent failure modes, so three independent checks.
 *
 * (A) ENTITY SCOPE — a migration arms one of them for an entity outside its allowlist. Booking
 *     depreciation for TRANSP posts against a chart of accounts that holds no owned assets at all.
 *
 * (B) PER-ENTITY RESOLUTION — the flag falls through to the GLOBAL default_enabled / rollout_pct
 *     path. None of these three keys matches an isPostingFlag() pattern (`_POST_ENABLED` and
 *     `_AUTOPOST_ENABLED` both miss `_POSTING_ENABLED$`), so without an explicit POSTING_FLAG_KEYS
 *     enrolment ONE global flip arms real GL posting for EVERY entity. Enrolment is what makes the
 *     allowlist in (A) mean anything: unenrolled, a migration scoped to TRK is trivially bypassed.
 *
 * (C) CONTROL ACCOUNT PROVENANCE — a migration binds a chart-of-accounts control role to whatever
 *     account a name pattern happens to match first. TRK carries 186 per-unit Accumulated
 *     Depreciation ledgers ("Accumulated Depreciation TRUCK 170", "Accumulared Depreciation TRUCK
 *     167", "Accumulated Depreciation REEFER #10202") and NO generic one, so
 *     `account_name ~* 'accumulated depreciation'` selects one truck's ledger and makes it the credit
 *     leg for the entire company's depreciation. 202610131200 already set this precedent in prose —
 *     "Pinned to the account NUMBER, not an ILIKE shape. A '%wire%fee%' fallback picks whichever row
 *     happens to sort first, so a rename or a new lookalike account would silently re-point a GL leg."
 *     This makes it mechanical. Pin by account_number, by system_purpose, or INSERT the account.
 *
 * Also a second, independent belt (guard 1723 is the primary) against a migration arming a QBO
 * write-back flag: QuickBooks is the system of record; this system syncs FROM it and never back.
 *
 * Usage: node scripts/verify-held-posting-flag-entity-scope.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-held-posting-flag-entity-scope";
const MIGRATIONS = path.join(ROOT, "db/migrations");
const SERVICE = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");

/** flag -> entity codes allowed to have it armed. */
export const HELD_FLAG_SCOPE = {
  PREPAID_EXPENSES_POST_ENABLED: ["TRK", "USMCA"],
  FINANCE_HUB_AMORTIZATION_POST_ENABLED: ["TRK", "USMCA"],
  FIXED_ASSET_AUTOPOST_ENABLED: ["TRK"],
};

const PUSH_FLAGS = ["QBO_JE_PUSH_ENABLED", "QBO_ENTITY_PUSH_ENABLED"];

/**
 * Control roles whose account must be pinned, not pattern-matched. These are the roles a poster or a
 * picker resolves to a SINGLE company-level account; a fuzzy match on account_name can silently
 * resolve to a per-unit or lookalike ledger.
 */
const PINNED_CONTROL_ROLES = [
  "accum_depr_default",
  "depr_expense_default",
  "fixed_asset_default",
  "prepaid_asset_default",
  "amortization_expense_default",
];

/**
 * Migrations dated before the ACCT-F43 enable sequence are applied history and are never edited.
 * The cutoff exists so this guard governs what lands next, not what already shipped.
 */
const FORWARD_CUTOFF = "202610161000";

/**
 * Applied-on-main migrations that this guard would otherwise fail. Never edited (applied-migration
 * law). The defect in 202610161400 (name-pattern accum_depr_default bind) is repaired by
 * 202610181200_repair_per_unit_accum_depr_control_binding.sql — this list is the honesty belt so
 * CI does not demand a rewrite of applied history.
 */
const GRANDFATHERED = new Set([
  "202610161400_trk_accum_depr_default_and_fa_enable.sql",
]);

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/**
 * Split a migration into PL/pgSQL-block-sized chunks.
 *
 * Splitting on ';' is wrong here: a `FOR … IN SELECT id, code FROM org.companies WHERE code IN (…)`
 * loop header and the INSERT it guards are separated by semicolons, so a statement-level scan sees
 * the enable with no entity attached and the entity with no enable. The block is the unit in which an
 * enable and its entity scope actually belong together — likewise a role bind and the SELECT that
 * chose its account.
 */
export function blocksOf(sql) {
  return sql.split(/END\s*\$\$\s*;/i);
}

/** Does this block ARM the flag (write a per-entity override to true)? */
export function blockArmsFlag(block, flag) {
  const flat = block.replace(/\s+/g, " ");
  if (!flat.includes(flag)) return false;
  if (!/\b(insert\s+into|update)\s+lib\.feature_flag_overrides\b/i.test(flat)) return false;
  return /\benabled\s*=\s*true\b/i.test(flat) || /,\s*true\s*[,)]/i.test(flat);
}

/** Entity codes an org.companies predicate in this block resolves to. */
export function entityCodesIn(block) {
  const codes = new Set();
  for (const m of block.matchAll(/code\s*(?:=|<>|!=)\s*'([A-Z0-9_]+)'/gi)) codes.add(m[1].toUpperCase());
  for (const m of block.matchAll(/code\s+IN\s*\(([^)]*)\)/gi)) {
    for (const q of m[1].matchAll(/'([A-Z0-9_]+)'/gi)) codes.add(q[1].toUpperCase());
  }
  return [...codes];
}

/**
 * Does this block ACTIVATE the control role — bind it, or stamp system_purpose onto an account for it?
 *
 * Attribution is per STATEMENT, not per block. A block routinely mentions several roles: the one it
 * binds, plus others it only READS in an `IF NOT EXISTS (SELECT 1 … role = 'depr_expense_default')`
 * precondition. Blaming every role named in the block would report a bind that does not exist, and a
 * guard that cries wolf gets weakened rather than obeyed.
 *
 * Deactivation / repair paths (is_active = false, system_purpose = NULL) are the fix, not the defect.
 */
function blockBindsControlRole(block, role) {
  for (const raw of block.split(";")) {
    const stmt = raw.replace(/\s+/g, " ");
    if (!stmt.includes(`'${role}'`)) continue;

    const writesRole = /\b(insert\s+into|update)\s+accounting\.chart_of_accounts_roles\b/i.test(stmt);
    // A stamp is an ASSIGNMENT (`SET system_purpose = 'role'` / a value in an INSERT column list),
    // never the `system_purpose = 'role'` equality inside the SELECT that looked the account up.
    const stampsPurpose =
      /\bupdate\s+catalogs\.accounts\b[\s\S]*\bset\b[\s\S]*system_purpose\s*=/i.test(stmt) ||
      (/\binsert\s+into\s+catalogs\.accounts\b/i.test(stmt) && /system_purpose/i.test(stmt));
    if (!writesRole && !stampsPurpose) continue;

    const deactivatesOnly =
      /is_active\s*=\s*false/i.test(stmt) && !/is_active\s*=\s*true/i.test(stmt) && !/,\s*true\s*[,)]/.test(stmt);
    if (deactivatesOnly) continue;
    if (/system_purpose\s*=\s*NULL/i.test(stmt) && !writesRole) continue;

    return true;
  }
  return false;
}

/** A name-shape match that can silently pick the wrong ledger. */
function fuzzyAccountNameMatch(block) {
  const flat = block.replace(/\s+/g, " ");
  const hits = [
    /account_name\s+I?LIKE\s+'[^']*%/i,
    /account_name\s*!?~\*?\s*'/i,
    /lower\s*\(\s*a?\.?account_name\s*\)\s+I?LIKE\s+'[^']*%/i,
  ];
  return hits.some((re) => re.test(flat));
}

/** @param {Array<{name: string, sql: string}>} sources */
export function checkMigrationSources(sources) {
  const problems = [];
  for (const { name, sql: raw } of sources) {
    if (name.slice(0, 12) < FORWARD_CUTOFF) continue;
    if (GRANDFATHERED.has(name)) continue;
    const sql = stripSqlComments(raw);

    for (const block of blocksOf(sql)) {
      for (const [flag, allowed] of Object.entries(HELD_FLAG_SCOPE)) {
        if (!blockArmsFlag(block, flag)) continue;
        const codes = entityCodesIn(block);
        if (codes.length === 0) {
          problems.push(`${name}: arms ${flag} without scoping it to an entity code`);
          continue;
        }
        for (const code of codes) {
          if (!allowed.includes(code)) {
            problems.push(`${name}: must never arm ${flag} for ${code} (allowed: ${allowed.join(", ")})`);
          }
        }
      }

      for (const push of PUSH_FLAGS) {
        if (blockArmsFlag(block, push)) problems.push(`${name}: FORBIDDEN enable of ${push}`);
      }

      if (fuzzyAccountNameMatch(block)) {
        for (const role of PINNED_CONTROL_ROLES) {
          if (blockBindsControlRole(block, role)) {
            problems.push(
              `${name}: binds control role ${role} to an account chosen by an account_name pattern — ` +
                "pin the account by account_number or system_purpose, or INSERT it"
            );
          }
        }
      }
    }
  }
  return [...new Set(problems)];
}

/**
 * Every held flag must be enrolled in POSTING_FLAG_KEYS so it resolves per-entity ONLY.
 * The set literal is read directly — a mention anywhere else in the file (a comment, a switch, the
 * PER_ENTITY_ONLY set) must not count as enrolment.
 */
export function checkService(service) {
  const problems = [];
  if (!service) return ["missing apps/backend/src/lib/feature-flags/service.ts"];

  const m = /POSTING_FLAG_KEYS[^=]*=\s*new Set\(\[([\s\S]*?)\n\]\);/.exec(service);
  if (!m) return ["service.ts: POSTING_FLAG_KEYS set literal not found"];
  const body = stripTsComments(m[1]);

  for (const flag of Object.keys(HELD_FLAG_SCOPE)) {
    if (!new RegExp(`["']${flag}["']`).test(body)) {
      problems.push(
        `service.ts: ${flag} is not enrolled in POSTING_FLAG_KEYS — its key matches no isPostingFlag() ` +
          "pattern, so a global default_enabled/rollout_pct flip would arm GL posting for EVERY entity"
      );
    }
  }
  return problems;
}

function stripTsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function migrationSources() {
  if (!fs.existsSync(MIGRATIONS)) return [];
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(MIGRATIONS, f), "utf8") }));
}

function main() {
  const problems = [
    ...checkMigrationSources(migrationSources()),
    ...checkService(fs.existsSync(SERVICE) ? fs.readFileSync(SERVICE, "utf8") : ""),
  ];
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} defect(s)`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — held posting flags are per-entity-only, armed for their allowed entities only, ` +
      "and no control role is bound by account-name shape"
  );
}

const GOOD_MIGRATION = `
DO $$
DECLARE v_co uuid; v_code text;
BEGIN
  FOR v_co, v_code IN SELECT id, code FROM org.companies WHERE code IN ('TRK', 'USMCA')
  LOOP
    INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled)
    VALUES ('PREPAID_EXPENSES_POST_ENABLED', v_co, true);
  END LOOP;
END $$;

DO $$
DECLARE v_trk uuid;
BEGIN
  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' LIMIT 1;
  INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled)
  VALUES ('FIXED_ASSET_AUTOPOST_ENABLED', v_trk, true);
END $$;
`;

const GOOD_SERVICE = `
export const POSTING_FLAG_KEYS: ReadonlySet<string> = new Set([
  "GL_POSTING_ENABLED",
  "PREPAID_EXPENSES_POST_ENABLED",
  "FINANCE_HUB_AMORTIZATION_POST_ENABLED",
  "FIXED_ASSET_AUTOPOST_ENABLED",
]);
`;

function selftest() {
  const fail = (msg) => {
    console.error(`SELFTEST FAIL: ${msg}`);
    process.exit(1);
  };
  const scan = (sql, name = "202610999999_plant.sql") => checkMigrationSources([{ name, sql }]);

  // A negative control only means something if the fixture is actually IN scope. Prove the arm
  // detector fires on it first, otherwise "compliant migration passes" would also pass for a file
  // this guard cannot see at all.
  const armedFlags = Object.keys(HELD_FLAG_SCOPE).filter((flag) =>
    blocksOf(GOOD_MIGRATION).some((b) => blockArmsFlag(b, flag))
  );
  if (!armedFlags.includes("PREPAID_EXPENSES_POST_ENABLED") || !armedFlags.includes("FIXED_ASSET_AUTOPOST_ENABLED")) {
    fail(`arm detector missed the fixture's own enables (saw: ${armedFlags.join(", ") || "none"})`);
  }
  // Negative control — the compliant shape must pass both halves.
  if (scan(GOOD_MIGRATION, "202610161200_good.sql").length) fail("compliant migration was flagged");
  if (checkService(GOOD_SERVICE).length) fail("compliant service.ts was flagged");
  console.log("SELFTEST: compliant migration is in scope, and passes with the compliant service");

  // Plant 1 — depreciation autopost armed for TRANSP (leases, owns nothing).
  const transpFa = GOOD_MIGRATION.replace("WHERE code = 'TRK' LIMIT 1", "WHERE code = 'TRANSP' LIMIT 1");
  if (!scan(transpFa).some((p) => /FIXED_ASSET_AUTOPOST_ENABLED for TRANSP/.test(p))) {
    fail("TRANSP fixed-asset autopost enable not detected");
  }
  console.log("SELFTEST: TRANSP depreciation-autopost enable detected");

  // Plant 2 — prepaid posting armed for TRANSP by widening the loop.
  const transpPrepaid = GOOD_MIGRATION.replace("IN ('TRK', 'USMCA')", "IN ('TRK', 'USMCA', 'TRANSP')");
  if (!scan(transpPrepaid).some((p) => /PREPAID_EXPENSES_POST_ENABLED for TRANSP/.test(p))) {
    fail("TRANSP prepaid enable not detected");
  }
  console.log("SELFTEST: widened prepaid allowlist detected");

  // Plant 3 — an enable with no entity scope at all (global arm).
  const unscoped = `
DO $$
BEGIN
  UPDATE lib.feature_flag_overrides SET enabled = true
   WHERE flag_key = 'FINANCE_HUB_AMORTIZATION_POST_ENABLED';
END $$;
`;
  if (!scan(unscoped).some((p) => /without scoping it to an entity code/.test(p))) {
    fail("unscoped enable not detected");
  }
  console.log("SELFTEST: unscoped enable detected");

  // Plant 4 — QBO write-back flag armed.
  const push = `
DO $$
BEGIN
  UPDATE lib.feature_flag_overrides SET enabled = true WHERE flag_key = 'QBO_JE_PUSH_ENABLED';
END $$;
`;
  if (!scan(push).some((p) => /FORBIDDEN enable of QBO_JE_PUSH_ENABLED/.test(p))) {
    fail("QBO push-flag enable not detected");
  }
  console.log("SELFTEST: QBO push-flag enable detected");

  // Plant 5 — the real defect: accum_depr_default bound to whatever '~* accumulated depreciation'
  // matches first, which on TRK is one truck's per-unit ledger.
  const fuzzyBind = `
DO $$
DECLARE v_trk uuid; v_acct uuid;
BEGIN
  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' LIMIT 1;
  SELECT a.id INTO v_acct FROM catalogs.accounts a
   WHERE a.operating_company_id = v_trk
     AND a.account_subtype = 'AccumulatedDepreciation'
     AND a.account_name ~* 'accumulated depreciation'
   LIMIT 1;
  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  VALUES (v_trk, 'accum_depr_default', v_acct, true);
END $$;
`;
  if (!scan(fuzzyBind).some((p) => /binds control role accum_depr_default/.test(p))) {
    fail("fuzzy accum_depr_default bind not detected");
  }
  console.log("SELFTEST: name-shape control-account bind detected");

  // Plant 5b — same defect expressed as an ILIKE '%…%' fallback on a different control role.
  const fuzzyLike = fuzzyBind
    .replace("~* 'accumulated depreciation'", "ILIKE '%prepaid%'")
    .replace("'accum_depr_default'", "'prepaid_asset_default'");
  if (!scan(fuzzyLike).some((p) => /binds control role prepaid_asset_default/.test(p))) {
    fail("ILIKE control-account bind not detected");
  }
  console.log("SELFTEST: ILIKE control-account bind detected");

  // Negative control for (C) — pinning by account_number is the correct shape and must pass.
  const pinned = fuzzyBind.replace("a.account_name ~* 'accumulated depreciation'", "a.account_number = '1500'");
  if (scan(pinned, "202610161300_pinned.sql").length) fail("account_number-pinned bind was flagged");
  // …and so must the repair path that deactivates a bad binding.
  const repair = `
DO $$
BEGIN
  UPDATE accounting.chart_of_accounts_roles r SET is_active = false
    FROM catalogs.accounts a
   WHERE a.id = r.account_id AND r.role = 'accum_depr_default' AND a.account_name ~ '[0-9]';
END $$;
`;
  if (scan(repair, "202610181200_repair.sql").length) fail("deactivation repair path was flagged");
  console.log("SELFTEST: pinned bind and repair path pass");

  // Plant 6 — enrolment dropped, so the flag falls back to the global rollout path.
  const dropped = GOOD_SERVICE.replace('  "FIXED_ASSET_AUTOPOST_ENABLED",\n', "");
  if (!checkService(dropped).some((p) => /FIXED_ASSET_AUTOPOST_ENABLED is not enrolled/.test(p))) {
    fail("dropped POSTING_FLAG_KEYS enrolment not detected");
  }
  // Plant 6b — enrolment "present" only as a comment must not count.
  const commented = GOOD_SERVICE.replace(
    '  "PREPAID_EXPENSES_POST_ENABLED",',
    '  // "PREPAID_EXPENSES_POST_ENABLED",'
  );
  if (!checkService(commented).some((p) => /PREPAID_EXPENSES_POST_ENABLED is not enrolled/.test(p))) {
    fail("commented-out enrolment was accepted");
  }
  console.log("SELFTEST: dropped and commented-out per-entity enrolment detected");

  // Plant 7 — a real file on disk, to prove the reader path works and not just the pure functions.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-held-flag-scope-"));
  try {
    fs.writeFileSync(
      path.join(dir, "202610999995_bad_usmca_fa.sql"),
      GOOD_MIGRATION.replace("WHERE code = 'TRK' LIMIT 1", "WHERE code = 'USMCA' LIMIT 1")
    );
    const sources = fs
      .readdirSync(dir)
      .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), "utf8") }));
    if (!checkMigrationSources(sources).some((p) => /FIXED_ASSET_AUTOPOST_ENABLED for USMCA/.test(p))) {
      fail("USMCA fixed-asset autopost enable not detected from disk");
    }
    console.log("SELFTEST: USMCA depreciation-autopost enable detected from disk");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
