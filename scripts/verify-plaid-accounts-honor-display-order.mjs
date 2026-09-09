#!/usr/bin/env node
// BANK-F30014 (owner mega-report 2026-09-09) — "Banking > Transactions > the bank-accounts row at
// top is missing a reorder control... the way other lists in the app already support reordering
// (e.g. Bank account reorder already shipped elsewhere per BANK-F25142/PR #21368's display_order
// pattern — this is the same capability, missing on THIS surface)."
//
// Root cause was NOT a missing UI control -- the reorder capability (drag-reorder in Manage
// Accounts, PATCH /api/v1/banking/accounts/reorder) already exists and already writes
// banking.bank_accounts.display_order. GET /api/v1/banking/plaid/accounts -- the endpoint that
// feeds the account-selector row at the top of Banking > Transactions
// (BankingTransactionsDesignView.tsx's `accounts.map(...)`) -- simply never read display_order at
// all, sorting instead by institution_name/account_name/created_at. A user's saved reorder was
// therefore invisible on this one surface even though it correctly appeared everywhere else.
//
// Live-proven live on Neon (read-only CTE simulation, no data mutated): with a hypothetical
// display_order applied, the OLD query ignores it entirely
// ([USMCA FREIGHT, Faro Factoring, Petty Cash, Relay Fuel Wallet]) while the NEW query honors it
// ([Petty Cash, Faro Factoring, USMCA FREIGHT, Relay Fuel Wallet]).
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/integrations/plaid/link.routes.ts";

export function auditFile(src) {
  const failures = [];
  const routeMatch = src.match(/app\.get\(\s*"\/api\/v1\/banking\/plaid\/accounts"[\s\S]{0,3000}?ORDER BY ([^\n]*)/);
  if (!routeMatch) {
    failures.push(`${ROUTES_REL}: could not locate the GET /api/v1/banking/plaid/accounts query's ORDER BY clause`);
    return failures;
  }
  const orderByClause = routeMatch[1];
  if (!/^display_order\b/.test(orderByClause.trim())) {
    failures.push(`${ROUTES_REL}: GET /api/v1/banking/plaid/accounts must ORDER BY display_order first, found "${orderByClause.trim()}"`);
  }
  // display_order must also be SELECTed for the fix to be meaningful (a caller can't confirm the
  // ordering source without it, and some frontend callers key off the returned field).
  const selectBlock = src.slice(routeMatch.index, routeMatch.index + routeMatch[0].length);
  if (!/\bdisplay_order\b/.test(selectBlock.slice(0, selectBlock.lastIndexOf("ORDER BY")))) {
    failures.push(`${ROUTES_REL}: GET /api/v1/banking/plaid/accounts must also SELECT display_order`);
  }
  return failures;
}

export function run(root = process.cwd()) {
  let src;
  try {
    src = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }
  return auditFile(src);
}

if (process.argv.includes("--selftest")) {
  const good = `
app.get("/api/v1/banking/plaid/accounts", async () => {
  const res = await client.query(
    \`
      SELECT id, institution_name, account_name, display_order
      FROM banking.bank_accounts
      WHERE operating_company_id = $1::uuid
      ORDER BY display_order, institution_name NULLS LAST, account_name NULLS LAST, created_at DESC
    \`,
  );
});
`;
  const passFailures = auditFile(good);
  if (passFailures.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(passFailures));

  const brokenOrder = good.replace(
    "ORDER BY display_order, institution_name NULLS LAST, account_name NULLS LAST, created_at DESC",
    "ORDER BY institution_name NULLS LAST, account_name NULLS LAST, created_at DESC"
  );
  if (auditFile(brokenOrder).length === 0) throw new Error("SELFTEST FAIL: dropping display_order from ORDER BY went undetected");

  const brokenSelect = good
    .replace("SELECT id, institution_name, account_name, display_order", "SELECT id, institution_name, account_name")
    .replace("ORDER BY display_order,", "ORDER BY display_order,"); // ORDER BY still references it, only SELECT dropped
  if (auditFile(brokenSelect).length === 0) throw new Error("SELFTEST FAIL: dropping display_order from SELECT went undetected");

  console.log("verify-plaid-accounts-honor-display-order: SELFTEST PASS (2/2 mutations caught)");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-plaid-accounts-honor-display-order FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-plaid-accounts-honor-display-order OK — GET /api/v1/banking/plaid/accounts orders by display_order, matching every other account-list surface");
