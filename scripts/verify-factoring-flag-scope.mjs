#!/usr/bin/env node
/**
 * FACT-01 — FACTORING_GL_POSTING_ENABLED may only be armed for a Faro borrower entity.
 *
 * Owner WO 2026-07-29 widened the allowlist from TRANSP to TRANSP + USMCA (both factor with Faro;
 * USMCA's control accounts are bound by 202610131200). TRK stays forbidden — it is the asset holder
 * and is not a factoring borrower, so arming the flag there would post Faro legs onto the wrong
 * entity's books.
 *
 * Owner ruling 2026-07-29: "trucking does not have factoring only leases equipment."
 * This guard also scans migrations so no future mig binds an active factoring CoA role to TRK
 * or enables FACTORING_GL_POSTING_ENABLED for TRK.
 *
 * This guard pins the allowlist in setOverride so the kill-switch cannot silently widen to TRK (or
 * to "any entity") in a later refactor.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-flag-scope";
const SELFTEST = process.argv.includes("--selftest");
const MIGRATIONS = path.join(ROOT, "db/migrations");

const SERVICE = path.join(ROOT, "apps/backend/src/lib/feature-flags/service.ts");
const MIG = path.join(ROOT, "db/migrations/202609100040_fact_01_factoring_flag_transp_only.sql");

/** Entities allowed to arm the factoring flag. TRK must never appear here. */
const ALLOWED = ["TRANSP", "USMCA"];
const FORBIDDEN = ["TRK"];

const FACTOR_ROLES = [
  "factor_reserve_default",
  "factor_wire_fee",
  "factor_fee_expense",
  "factor_reserve_held",
  "factoring_advance_liability",
  "ar_assigned_to_factor",
  "factoring_recoursed_ar",
  "default_interest_expense",
];

/** @param {string} service @param {string} mig */
export function check(service, mig) {
  const problems = [];
  if (!service) problems.push("missing feature-flags/service.ts");
  if (!mig) problems.push("missing migration 202609100040_fact_01_factoring_flag_transp_only.sql");

  if (service) {
    if (!/FACTORING_GL_POSTING_ENABLED/.test(service)) {
      problems.push("service must mention FACTORING_GL_POSTING_ENABLED");
    }
    if (!/factoring_flag_transp_usmca_only/.test(service)) {
      problems.push(
        "setOverride must throw factoring_flag_transp_usmca_only when enabling for a non-borrower entity"
      );
    }
    for (const code of ALLOWED) {
      if (!new RegExp(`code\\s*!==\\s*["']${code}["']`).test(service)) {
        problems.push(`setOverride allowlist must test code !== "${code}"`);
      }
    }
    for (const code of FORBIDDEN) {
      if (new RegExp(`code\\s*===\\s*["']${code}["']`).test(service)) {
        problems.push(`setOverride must never allowlist ${code} (asset holder, not a Faro borrower)`);
      }
    }
  }
  if (mig) {
    // 202609100040 is APPLIED history and is never edited — these assertions pin it, they do not
    // describe today's allowlist (USMCA is re-enabled forward by 202610131200).
    if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must HOLD-FOR-JORGE");
    if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must DO NOT RUN ON PROD");
    if (!/TRK/.test(mig) || !/USMCA/.test(mig)) {
      problems.push("migration must name TRK and USMCA overrides");
    }
    if (!/enabled\s*=\s*false/i.test(mig)) {
      problems.push("migration must set enabled = false for non-TRANSP");
    }
  }
  return problems;
}

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
 * Scan migrations dated >= FORWARD_CUTOFF: never INSERT an active factoring role bind for TRK,
 * and never enable FACTORING_GL_POSTING_ENABLED for TRK.
 * Deactivate paths (is_active = false / enabled = false) are allowed.
 *
 * Pre-cutoff files are applied history (e.g. FACT-05 looped TRK) — 202610131200 deactivates those
 * bindings; this guard prevents re-introduction going forward (owner ruling 2026-07-29).
 */
const FORWARD_CUTOFF = "202610131200";

export function checkMigrations(migrationsDir) {
  const problems = [];
  if (!fs.existsSync(migrationsDir)) return problems;

  for (const name of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const stamp = name.slice(0, 12);
    if (stamp < FORWARD_CUTOFF) continue;

    const raw = fs.readFileSync(path.join(migrationsDir, name), "utf8");
    const sql = stripSqlComments(raw);
    const flat = sql.replace(/\s+/g, " ");

    const stmts = flat.split(";");
    for (const stmt of stmts) {
      if (
        /FACTORING_GL_POSTING_ENABLED/i.test(stmt) &&
        /\bTRK\b/.test(stmt) &&
        /\benabled\s*=\s*true\b/i.test(stmt) &&
        !/\benabled\s*=\s*false\b/i.test(stmt)
      ) {
        problems.push(`${name}: must never enable FACTORING_GL_POSTING_ENABLED for TRK`);
      }

      // Active INSERT of a factoring CoA role that targets TRK (VALUES or SELECT form).
      if (!/insert\s+into\s+accounting\.chart_of_accounts_roles\b/i.test(stmt)) continue;
      const roleHit = FACTOR_ROLES.find((r) => stmt.includes(`'${r}'`) || stmt.includes(`"${r}"`));
      if (!roleHit) continue;
      // Soft-deactivate / false active — skip
      if (/is_active\s*=\s*false/i.test(stmt) && !/,\s*true\s*[,)]/.test(stmt)) continue;
      const targetsTrk =
        /code\s*=\s*'TRK'/i.test(stmt) ||
        /code\s+in\s*\([^)]*'TRK'[^)]*\)/i.test(stmt);
      if (!targetsTrk) continue;
      // Require evidence of active bind (literal true in VALUES/SELECT list)
      if (!/,\s*true\s*[,)\s]/.test(stmt) && !/\btrue\s*,\s*now\(\)/i.test(stmt)) continue;
      problems.push(`${name}: must never bind active factoring role ${roleHit} to TRK`);
    }
  }
  return [...new Set(problems)];
}

function selftest() {
  const goodService = `
    if (input.flag_key === "FACTORING_GL_POSTING_ENABLED" && input.enabled) {
      if (code !== "TRANSP" && code !== "USMCA") throw new Error("factoring_flag_transp_usmca_only");
    }
  `;
  const goodMig = `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nTRK USMCA\nenabled = false`;
  if (check(goodService, goodMig).length) throw new Error("compliant flagged");

  // Plant 1 — no throw at all.
  if (!check("FACTORING_GL_POSTING_ENABLED only", goodMig).length) {
    throw new Error("missing throw not caught");
  }
  // Plant 2 — allowlist silently widened to TRK.
  const trkWidened = `
    if (input.flag_key === "FACTORING_GL_POSTING_ENABLED" && input.enabled) {
      if (code === "TRK") { /* allowed */ }
      if (code !== "TRANSP" && code !== "USMCA") throw new Error("factoring_flag_transp_usmca_only");
    }
  `;
  if (!check(trkWidened, goodMig).some((p) => p.includes("TRK"))) {
    throw new Error("TRK widening not caught");
  }
  // Plant 3 — USMCA dropped from the allowlist.
  const usmcaDropped = goodService.replace(' && code !== "USMCA"', "");
  if (!check(usmcaDropped, goodMig).some((p) => p.includes("USMCA"))) {
    throw new Error("USMCA removal not caught");
  }

  // Migration plants use stamps >= FORWARD_CUTOFF so they are in-scope.
  const tmpDir = fs.mkdtempSync(path.join(ROOT, "tmp-fact-scope-"));
  try {
    // Plant 4 — migration enables FACTORING for TRK → RED
    const badEnable = `
      DO $$ BEGIN
        UPDATE lib.feature_flag_overrides SET enabled = true
         WHERE flag_key = 'FACTORING_GL_POSTING_ENABLED'
           AND operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRK');
      END $$;
    `;
    fs.writeFileSync(path.join(tmpDir, "202610999999_bad_trk_factor_enable.sql"), badEnable);
    if (!checkMigrations(tmpDir).some((p) => /enable FACTORING/i.test(p))) {
      throw new Error("TRK FACTORING enable plant not caught");
    }

    // Plant 5 — active INSERT…SELECT bind of factor_wire_fee for TRK → RED
    const badBind = `
      INSERT INTO accounting.chart_of_accounts_roles
        (operating_company_id, role, account_id, is_active)
      SELECT c.id, 'factor_wire_fee', a.id, true
      FROM org.companies c
      JOIN catalogs.accounts a ON a.operating_company_id = c.id
      WHERE c.code = 'TRK';
    `;
    fs.writeFileSync(path.join(tmpDir, "202610999998_bad_trk_factor_bind.sql"), badBind);
    if (!checkMigrations(tmpDir).some((p) => /factor_wire_fee/.test(p) && /999998/.test(p))) {
      throw new Error("TRK factoring role bind plant not caught");
    }

    // Plant 5b — VALUES form with TRK subquery → RED
    const badValues = `
      INSERT INTO accounting.chart_of_accounts_roles
        (uuid, operating_company_id, role, account_id, is_active)
      VALUES (
        gen_random_uuid(),
        (SELECT id FROM org.companies WHERE code = 'TRK'),
        'factor_wire_fee',
        '00000000-0000-0000-0000-000000000001'::uuid,
        true
      );
    `;
    fs.writeFileSync(path.join(tmpDir, "202610999996_bad_trk_values.sql"), badValues);
    if (!checkMigrations(tmpDir).some((p) => /999996/.test(p))) {
      throw new Error("TRK VALUES bind plant not caught");
    }

    // Plant 6 — deactivate path → GREEN
    const goodDeact = `
      UPDATE accounting.chart_of_accounts_roles
         SET is_active = false
       WHERE operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRK')
         AND role IN ('factor_reserve_default', 'factor_wire_fee');
      UPDATE lib.feature_flag_overrides
         SET enabled = false
       WHERE flag_key = 'FACTORING_GL_POSTING_ENABLED'
         AND operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRK');
    `;
    const onlyGood = path.join(tmpDir, "only-good");
    fs.mkdirSync(onlyGood);
    fs.writeFileSync(path.join(onlyGood, "202610999997_good_trk_deact.sql"), goodDeact);
    if (checkMigrations(onlyGood).length) {
      throw new Error("TRK deactivate path falsely flagged");
    }

    // Plant 7 — USMCA-only factor_wire_fee bind (same shape as 202610131200) → GREEN
    const usmcaOnly = `
      INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
      SELECT c.id, 'factor_wire_fee', a.id, true
      FROM org.companies c
      JOIN catalogs.accounts a ON a.operating_company_id = c.id
      WHERE c.code = 'USMCA';
    `;
    const onlyUsmca = path.join(tmpDir, "only-usmca");
    fs.mkdirSync(onlyUsmca);
    fs.writeFileSync(path.join(onlyUsmca, "202610999995_usmca_wire.sql"), usmcaOnly);
    if (checkMigrations(onlyUsmca).length) {
      throw new Error("USMCA-only factor_wire_fee falsely flagged");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const problems = [...check(read(SERVICE), read(MIG)), ...checkMigrations(MIGRATIONS)];
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — FACTORING_GL_POSTING_ENABLED enable gated to ${ALLOWED.join("+")}; TRK forbidden (runtime + migrations)`
);
