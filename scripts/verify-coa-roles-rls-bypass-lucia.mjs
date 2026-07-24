#!/usr/bin/env node
/**
 * Guard: accounting.chart_of_accounts_roles RLS policy accepts app.bypass_rls='lucia'
 * (false-empty audit landmine — Rule 10).
 *
 * ROOT CAUSE: policy coa_roles_company_scope (0223_block_35_chart_of_accounts_roles.sql) checks
 * ONLY app.operating_company_id — no bypass_rls escape — so a Rule-10-compliant audit read
 * (SET app.bypass_rls='lucia') sees a FALSE 0 even though live rows exist.
 *
 * This is a STATIC guard on the migration file text (no live DB connection required in CI). It
 * asserts the new migration's CREATE POLICY carries the bypass_rls='lucia' escape in USING,
 * leaves WITH CHECK scoped to operating_company_id only (no new write authority), is registered
 * in .held-migrations.json, and still carries the DO-NOT-RUN-ON-PROD marker (financial cluster —
 * never self-merge, never auto-apply to prod).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607900000_coa_roles_rls_bypass_lucia.sql";
const HELD = "db/migrations/.held-migrations.json";

const BYPASS_ESCAPE = /current_setting\(\s*'app\.bypass_rls'\s*,\s*true\s*\)\s*=\s*'lucia'/;
const OPCO_CHECK =
  /operating_company_id\s*=\s*NULLIF\(current_setting\('app\.operating_company_id',\s*true\),\s*''\)::uuid/;

export function run(root = ROOT) {
  const f = [];
  const migPath = path.join(root, MIG);
  if (!fs.existsSync(migPath)) {
    f.push(`missing migration ${MIG}`);
    return f;
  }
  const mig = fs.readFileSync(migPath, "utf8");

  if (!/DO NOT RUN ON PROD/i.test(mig.slice(0, 1200))) {
    f.push("migration missing 'DO NOT RUN ON PROD' marker in the first 1200 chars (Rule 16/financial-cluster)");
  }

  if (!/DROP POLICY IF EXISTS coa_roles_company_scope ON accounting\.chart_of_accounts_roles/.test(mig)) {
    f.push("must DROP POLICY IF EXISTS coa_roles_company_scope before recreating (idempotent)");
  }

  // Isolate the CREATE POLICY block so USING/WITH CHECK are checked in the right clause.
  const createMatch = mig.match(
    /CREATE POLICY\s+coa_roles_company_scope[\s\S]*?ON\s+accounting\.chart_of_accounts_roles[\s\S]*?;/,
  );
  if (!createMatch) {
    f.push("must CREATE POLICY coa_roles_company_scope ON accounting.chart_of_accounts_roles");
  } else {
    const block = createMatch[0];
    const usingMatch = block.match(/USING\s*\(([\s\S]*?)\)\s*WITH CHECK/);
    const checkMatch = block.match(/WITH CHECK\s*\(([\s\S]*?)\)\s*;/);

    if (!usingMatch) {
      f.push("could not isolate USING clause of coa_roles_company_scope");
    } else {
      const usingClause = usingMatch[1];
      if (!BYPASS_ESCAPE.test(usingClause)) {
        f.push("USING clause must accept current_setting('app.bypass_rls', true) = 'lucia' (Rule 10 escape)");
      }
      if (!OPCO_CHECK.test(usingClause)) {
        f.push("USING clause must still check operating_company_id (bypass is OR, not a replacement)");
      }
    }

    if (!checkMatch) {
      f.push("could not isolate WITH CHECK clause of coa_roles_company_scope");
    } else {
      const checkClause = checkMatch[1];
      if (BYPASS_ESCAPE.test(checkClause)) {
        f.push(
          "WITH CHECK must NOT carry the bypass_rls escape — writes stay strictly entity-scoped (no new write authority)",
        );
      }
      if (!OPCO_CHECK.test(checkClause)) {
        f.push("WITH CHECK must check operating_company_id (unchanged from 0223)");
      }
    }
  }

  if (!/FOR ALL/.test(mig) || !/TO ih35_app/.test(mig)) {
    f.push("policy must be FOR ALL TO ih35_app (matches 0223 grantee)");
  }

  const held = JSON.parse(fs.readFileSync(path.join(root, HELD), "utf8"));
  if (!(held.held || []).some((h) => h.file === path.basename(MIG))) {
    f.push(`must register ${path.basename(MIG)} in .held-migrations.json`);
  }

  return f;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/verify-coa-roles-rls-bypass-lucia-");
    fs.mkdirSync(path.join(tmp, path.dirname(MIG)), { recursive: true });

    // Bug shape 1: no bypass escape at all (the actual pre-fix defect) — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS coa_roles_company_scope ON accounting.chart_of_accounts_roles;\nCREATE POLICY coa_roles_company_scope ON accounting.chart_of_accounts_roles FOR ALL TO ih35_app USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid) WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);\nCOMMIT;\n`,
    );
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    if (!run(tmp).length) throw new Error("bug shape (no bypass escape) must FAIL");

    // Bug shape 2: bypass escape leaked into WITH CHECK (grants new write authority) — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS coa_roles_company_scope ON accounting.chart_of_accounts_roles;\nCREATE POLICY coa_roles_company_scope ON accounting.chart_of_accounts_roles FOR ALL TO ih35_app USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid OR current_setting('app.bypass_rls', true) = 'lucia') WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid OR current_setting('app.bypass_rls', true) = 'lucia');\nCOMMIT;\n`,
    );
    if (!run(tmp).length) throw new Error("bug shape (bypass leaked into WITH CHECK) must FAIL");

    // Bug shape 3: not registered in .held-migrations.json — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS coa_roles_company_scope ON accounting.chart_of_accounts_roles;\nCREATE POLICY coa_roles_company_scope ON accounting.chart_of_accounts_roles FOR ALL TO ih35_app USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid OR current_setting('app.bypass_rls', true) = 'lucia') WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);\nCOMMIT;\n`,
    );
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [] }));
    if (!run(tmp).length) throw new Error("bug shape (unregistered) must FAIL");

    // Good shape: bypass escape in USING only, WITH CHECK unchanged, registered — must PASS.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS coa_roles_company_scope ON accounting.chart_of_accounts_roles;\nCREATE POLICY coa_roles_company_scope ON accounting.chart_of_accounts_roles FOR ALL TO ih35_app USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid OR current_setting('app.bypass_rls', true) = 'lucia') WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);\nCOMMIT;\n`,
    );
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    const good = run(tmp);
    if (good.length) throw new Error("good shape must PASS: " + good.join("; "));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("verify-coa-roles-rls-bypass-lucia --selftest OK");
  } else {
    const r = run();
    if (r.length) {
      console.error(r.join("\n"));
      process.exit(1);
    }
    console.log("verify-coa-roles-rls-bypass-lucia — OK");
  }
}
