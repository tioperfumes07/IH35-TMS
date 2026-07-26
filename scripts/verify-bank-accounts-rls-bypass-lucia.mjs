#!/usr/bin/env node
/**
 * Guard: banking.bank_accounts RLS policy accepts app.bypass_rls='lucia'
 * (BANK-ECON-04 / BANK-SURF-04 root-cause fix — Rule 10 escape).
 *
 * ROOT CAUSE: policy bank_accounts_company_scope (migration 0072) checks ONLY
 * app.operating_company_id — no bypass_rls escape — so POST /api/v1/banking/reconciliation/start
 * and /upload-statement, which resolve a bare bank_account_id via withLuciaBypass (sentinel
 * operating_company_id) BEFORE the real company is known, 404 bank_account_not_found on every
 * single attempt. This is why banking.reconciliation_sessions has been 0 since table creation —
 * not ops-empty.
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
const MIG = "db/migrations/202608030000_bank_accounts_rls_bypass_lucia.sql";
const HELD = "db/migrations/.held-migrations.json";

const BYPASS_ESCAPE = /current_setting\(\s*'app\.bypass_rls'\s*,\s*true\s*\)\s*=\s*'lucia'/;
const OPCO_CHECK =
  /\(operating_company_id\)::text\s*=\s*current_setting\('app\.operating_company_id',\s*true\)/;

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

  if (!/DROP POLICY IF EXISTS bank_accounts_company_scope ON banking\.bank_accounts/.test(mig)) {
    f.push("must DROP POLICY IF EXISTS bank_accounts_company_scope before recreating (idempotent)");
  }

  const createMatch = mig.match(
    /CREATE POLICY\s+bank_accounts_company_scope[\s\S]*?ON\s+banking\.bank_accounts[\s\S]*?;/,
  );
  if (!createMatch) {
    f.push("must CREATE POLICY bank_accounts_company_scope ON banking.bank_accounts");
  } else {
    const block = createMatch[0];
    const usingMatch = block.match(/USING\s*\(([\s\S]*?)\)\s*WITH CHECK/);
    const checkMatch = block.match(/WITH CHECK\s*\(([\s\S]*?)\)\s*;/);

    if (!usingMatch) {
      f.push("could not isolate USING clause of bank_accounts_company_scope");
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
      f.push("could not isolate WITH CHECK clause of bank_accounts_company_scope");
    } else {
      const checkClause = checkMatch[1];
      if (BYPASS_ESCAPE.test(checkClause)) {
        f.push(
          "WITH CHECK must NOT carry the bypass_rls escape — writes stay strictly entity-scoped (no new write authority)",
        );
      }
      if (!OPCO_CHECK.test(checkClause)) {
        f.push("WITH CHECK must check operating_company_id (unchanged from 0072)");
      }
    }
  }

  if (!/FOR ALL/.test(mig) || !/TO ih35_app/.test(mig)) {
    f.push("policy must be FOR ALL TO ih35_app (matches 0072 grantee)");
  }

  const held = JSON.parse(fs.readFileSync(path.join(root, HELD), "utf8"));
  if (![...(held.held ?? []), ...(held.applied_held ?? [])].some((h) => h.file === path.basename(MIG))) {
    f.push(`must register ${path.basename(MIG)} in .held-migrations.json`);
  }

  return f;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/verify-bank-accounts-rls-bypass-lucia-");
    fs.mkdirSync(path.join(tmp, path.dirname(MIG)), { recursive: true });

    // Bug shape 1: no bypass escape at all (the actual pre-fix defect) — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS bank_accounts_company_scope ON banking.bank_accounts;\nCREATE POLICY bank_accounts_company_scope ON banking.bank_accounts FOR ALL TO ih35_app USING ((operating_company_id)::text = current_setting('app.operating_company_id', true)) WITH CHECK ((operating_company_id)::text = current_setting('app.operating_company_id', true));\nCOMMIT;\n`,
    );
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    if (!run(tmp).length) throw new Error("bug shape (no bypass escape) must FAIL");

    // Bug shape 2: bypass escape leaked into WITH CHECK (grants new write authority) — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS bank_accounts_company_scope ON banking.bank_accounts;\nCREATE POLICY bank_accounts_company_scope ON banking.bank_accounts FOR ALL TO ih35_app USING ((operating_company_id)::text = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia') WITH CHECK ((operating_company_id)::text = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia');\nCOMMIT;\n`,
    );
    if (!run(tmp).length) throw new Error("bug shape (bypass leaked into WITH CHECK) must FAIL");

    // Bug shape 3: not registered in .held-migrations.json — must FAIL.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS bank_accounts_company_scope ON banking.bank_accounts;\nCREATE POLICY bank_accounts_company_scope ON banking.bank_accounts FOR ALL TO ih35_app USING ((operating_company_id)::text = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia') WITH CHECK ((operating_company_id)::text = current_setting('app.operating_company_id', true));\nCOMMIT;\n`,
    );
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [] }));
    if (!run(tmp).length) throw new Error("bug shape (unregistered) must FAIL");

    // Good shape: bypass escape in USING only, WITH CHECK unchanged, registered — must PASS.
    fs.writeFileSync(
      path.join(tmp, MIG),
      `-- DO NOT RUN ON PROD\nBEGIN;\nDROP POLICY IF EXISTS bank_accounts_company_scope ON banking.bank_accounts;\nCREATE POLICY bank_accounts_company_scope ON banking.bank_accounts FOR ALL TO ih35_app USING ((operating_company_id)::text = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia') WITH CHECK ((operating_company_id)::text = current_setting('app.operating_company_id', true));\nCOMMIT;\n`,
    );
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    const good = run(tmp);
    if (good.length) throw new Error("good shape must PASS: " + good.join("; "));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("verify-bank-accounts-rls-bypass-lucia --selftest OK");
  } else {
    const r = run();
    if (r.length) {
      console.error(r.join("\n"));
      process.exit(1);
    }
    console.log("verify-bank-accounts-rls-bypass-lucia — OK");
  }
}
