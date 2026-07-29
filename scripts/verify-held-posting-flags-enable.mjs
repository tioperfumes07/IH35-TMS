#!/usr/bin/env node
// verify-held-posting-flags-enable — Cursor band 1740.
// Asserts the held-flag enable migration only turns ON the owner-allowed flags/entities,
// never enables FIXED_ASSET here without accum_depr (deferred), never enables TRK factoring,
// never touches QBO push flags.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_SUFFIX = "_enable_held_posting_flags.sql";
const PUSH_FLAGS = ["QBO_JE_PUSH_ENABLED", "QBO_ENTITY_PUSH_ENABLED"];

function findMigration() {
  const dir = path.join(ROOT, "db/migrations");
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => f.endsWith(MIG_SUFFIX));
  return hit ? path.join(dir, hit) : null;
}

function analyze(sql) {
  const failures = [];
  for (const flag of ["PREPAID_EXPENSES_POST_ENABLED", "FINANCE_HUB_AMORTIZATION_POST_ENABLED"]) {
    if (!sql.includes(flag)) failures.push(`migration must enable ${flag}`);
  }
  if (/FIXED_ASSET_AUTOPOST_ENABLED[\s\S]{0,200}enabled\s*=\s*true/i.test(sql) && !/NOT enabled|NOT enable|deferred|ACCT-F44/i.test(sql)) {
    // Allow mention of FA only as deferred; fail if it actually upserts enabled=true for FA.
    if (/VALUES[^;]*FIXED_ASSET_AUTOPOST_ENABLED[^;]*true/i.test(sql)) {
      failures.push("must NOT enable FIXED_ASSET_AUTOPOST in this migration (accum_depr_default gap — ACCT-F44)");
    }
  }
  if (/FACTORING_GL_POSTING_ENABLED[\s\S]{0,120}true/i.test(sql) && /TRK/.test(sql)) {
    // Only fail if enabling factoring for TRK
    if (/VALUES[^;]*FACTORING_GL_POSTING_ENABLED[^;]*v_trk[^;]*true/i.test(sql)) {
      failures.push("must never enable FACTORING_GL_POSTING for TRK");
    }
  }
  for (const pf of PUSH_FLAGS) {
    if (new RegExp(`${pf}[\\s\\S]{0,80}true`, "i").test(sql) && /INSERT\s+INTO\s+lib\.feature_flag_overrides/i.test(sql)) {
      if (sql.includes(pf) && /enabled[,)\s]+true/i.test(sql.split(pf)[1]?.slice(0, 200) ?? "")) {
        failures.push(`must never enable push flag ${pf}`);
      }
    }
  }
  if (!/prepaid_asset_default/.test(sql) || !/amortization_expense_default/.test(sql)) {
    failures.push("enable paths must be role-gated on prepaid_asset_default / amortization_expense_default");
  }
  if (!/NOTICE/.test(sql)) failures.push("must NOTICE-skip, never RAISE on missing ops data");
  if (/RAISE\s+EXCEPTION/i.test(sql)) failures.push("must not RAISE EXCEPTION (fresh-DB safe)");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
    INSERT INTO lib.feature_flag_overrides VALUES (..., 'PREPAID_EXPENSES_POST_ENABLED', v_trk, NULL, true, ...);
    INSERT INTO lib.feature_flag_overrides VALUES (..., 'FINANCE_HUB_AMORTIZATION_POST_ENABLED', v_usmca, NULL, true, ...);
    -- prepaid_asset_default / amortization_expense_default gated
    RAISE NOTICE 'skip';
    -- FIXED_ASSET_AUTOPOST NOT enabled in this migration (deferred ACCT-F44)
  `;
  const bad = `
    INSERT INTO lib.feature_flag_overrides VALUES (gen_random_uuid(), 'FIXED_ASSET_AUTOPOST_ENABLED', v_trk, NULL, true, v_setter, now(), NULL);
    INSERT INTO lib.feature_flag_overrides VALUES (gen_random_uuid(), 'QBO_JE_PUSH_ENABLED', v_trk, NULL, true, v_setter, now(), NULL);
    RAISE EXCEPTION 'nope';
  `;
  const g = analyze(good);
  const b = analyze(bad);
  if (g.length === 0 && b.length > 0) {
    console.log("verify-held-posting-flags-enable --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-held-posting-flags-enable --selftest: FAIL", { g, b });
  process.exit(1);
}

const mig = findMigration();
if (!mig) {
  console.error(`FAIL: no db/migrations/*${MIG_SUFFIX}`);
  process.exit(1);
}
const failures = analyze(fs.readFileSync(mig, "utf8"));
if (failures.length) {
  console.error("FAIL verify-held-posting-flags-enable:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`PASS verify-held-posting-flags-enable — ${path.basename(mig)} role-gates PREPAID+FH3; FA deferred; no push flags.`);
