import fs from "node:fs";
import path from "node:path";

// Tenant-isolation guard (USMCA Plaid-connect bug class): banking.bank_accounts has an RLS WITH CHECK
// of `is_lucia_bypass() OR operating_company_id = app.operating_company_id`. A write running under
// withCurrentUser() sets app.current_user_id but NOT the opco GUC, so the write is RLS-rejected and the
// whole transaction rolls back (this is exactly what silently broke the USMCA Plaid connect — 0 rows
// persisted). FAIL the build if any backend file writes banking.bank_accounts under withCurrentUser
// without supplying app.operating_company_id in scope. (withLuciaBypass writes are exempt — bypass does
// not need the opco GUC.) The fix is to SUPPLY the scope, never to loosen the policy or use bypass.

const SRC = path.resolve("apps/backend/src");
const WRITE_RE = /(INSERT\s+INTO|UPDATE)\s+banking\.bank_accounts\b/i;
const OPCO_SET_RE = /set_config\(\s*['"]app\.operating_company_id['"]/;
const HAS_CURRENT_USER = /\bwithCurrentUser\b/;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) acc.push(full);
  }
  return acc;
}

const offenders = [];
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  if (!WRITE_RE.test(src)) continue;
  if (!HAS_CURRENT_USER.test(src)) continue; // only the withCurrentUser write-path is at risk
  if (!OPCO_SET_RE.test(src)) {
    offenders.push(path.relative(process.cwd(), file));
  }
}

export default {
  name: "verify-banking-bank-accounts-opco-scope",
  run: async () => {
    if (offenders.length) {
      console.error(
        "verify-banking-bank-accounts-opco-scope FAILED — these files write banking.bank_accounts under\n" +
          "withCurrentUser() but never set app.operating_company_id, so the RLS WITH CHECK will reject the\n" +
          "write and roll back the transaction (the USMCA Plaid-connect bug class):\n  " +
          offenders.join("\n  ") +
          "\nFix: add `await client.query(\"SELECT set_config('app.operating_company_id', $1, true)\", [opco])`\n" +
          "as the first statement in the withCurrentUser block. Do NOT use withLuciaBypass or weaken RLS."
      );
      process.exit(1);
    }
    console.log("verify-banking-bank-accounts-opco-scope PASS — all bank_accounts writes carry opco scope");
  },
};
