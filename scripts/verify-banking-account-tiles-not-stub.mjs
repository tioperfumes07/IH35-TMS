#!/usr/bin/env node
/**
 * BANK-F604 — no migration may (re)define views.banking_account_tiles as an empty WHERE false stub.
 *
 * Migration 0044 created this view inside a DO block with an $EMPTY$ fallback taken when phantom
 * preconditions (bank_accounts.visible, bank_account_balances, etc.) did not exist. On prod that
 * branch fired — pg_get_viewdef returned "SELECT NULL::uuid ... WHERE false;" — so every Banking
 * Home tile and DIP/Factoring/Escrow KPI sourced from the view read $0 forever.
 *
 * 202608041400 restores the real definition against canonical prod schema. This guard stops the stub
 * from coming back: any LATER migration that defines this view with a WHERE false body fails. 0044
 * itself is grandfathered by exact filename.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = "db/migrations";
const VIEW = "banking_account_tiles";
const FROZEN = new Set(["0044_p3_t11_9_banking_rebuild.sql"]);
const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const RESTORE = "db/migrations/202608041400_restore_banking_account_tiles_view.sql";
const LABEL = "verify-banking-account-tiles-not-stub";

export function auditMigration(name, src) {
  if (FROZEN.has(name)) return [];
  if (!src.includes(VIEW)) return [];
  const stubbed = /CREATE\s+OR\s+REPLACE\s+VIEW\s+views\.banking_account_tiles[\s\S]{0,1200}?WHERE\s+false/i.test(
    src
  );
  return stubbed
    ? [
        `${DIR}/${name}: defines views.${VIEW} with a WHERE false body. That is the BANK-F604 stub — ` +
          `it returns zero tiles and makes DIP / Factoring / Escrow KPIs read $0 forever while real ` +
          `bank_accounts and virtual pools exist. A banking tile view that is empty is worse than missing.`,
      ]
    : [];
}

function auditTree() {
  return readdirSync(join(ROOT, DIR))
    .filter((f) => f.endsWith(".sql"))
    .flatMap((f) => auditMigration(f, readFileSync(join(ROOT, DIR, f), "utf8")));
}

/** @param {string} home @param {string} restore */
export function checkFrontendHonesty(home, restore) {
  const f = [];
  if (!restore.includes("BANK-F604") || !restore.includes("banking_account_tiles"))
    f.push(`${RESTORE}: must restore views.banking_account_tiles (BANK-F604)`);
  if (!/data-testid="banking-virtual-tiles-empty-honesty-banner"/.test(home))
    f.push(`${HOME}: accounts tab must render banking-virtual-tiles-empty-honesty-banner when tile feed is empty`);
  if (!/tilesQuery\.isSuccess/.test(home) || !/sortedBankTiles\.length/.test(home))
    f.push(`${HOME}: honesty banner must gate on tilesQuery success + sortedBankTiles length`);
  return f;
}

function auditFrontend() {
  try {
    return checkFrontendHonesty(
      readFileSync(join(ROOT, HOME), "utf8"),
      readFileSync(join(ROOT, RESTORE), "utf8")
    );
  } catch (e) {
    return [`frontend/restore audit: ${e.message}`];
  }
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real migrations flagged: ${auditTree().join(" | ")}`);
  const stub = `CREATE OR REPLACE VIEW views.banking_account_tiles WITH (security_invoker = true) AS SELECT NULL::uuid AS id WHERE false;`;
  if (!auditMigration("209901010000_x.sql", stub).some((p) => p.includes("WHERE false")))
    failures.push("case1 FAIL — a reintroduced stub was NOT caught");
  if (auditMigration("0044_p3_t11_9_banking_rebuild.sql", stub).length !== 0)
    failures.push("case2 FAIL — the checksum-frozen 0044 was not grandfathered");
  const real = `CREATE OR REPLACE VIEW views.banking_account_tiles WITH (security_invoker = true) AS SELECT a.id FROM banking.bank_accounts a WHERE a.is_active = true;`;
  if (auditMigration("209901010000_x.sql", real).length !== 0)
    failures.push("case3 FAIL — the real definition was wrongly flagged");
  const goodHome = `<div data-testid="banking-virtual-tiles-empty-honesty-banner" /> tilesQuery.isSuccess sortedBankTiles.length`;
  if (checkFrontendHonesty(goodHome, "BANK-F604 banking_account_tiles").length !== 0)
    failures.push("case4 FAIL — healthy frontend honesty wiring rejected");
  if (checkFrontendHonesty("", "BANK-F604").length === 0)
    failures.push("case5 FAIL — missing honesty banner should fail");
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — stub caught, frozen 0044 grandfathered, real definition passes`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = [...auditTree(), ...auditFrontend()];
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no migration re-stubs views.${VIEW}`);
}
main();
