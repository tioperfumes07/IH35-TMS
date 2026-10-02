#!/usr/bin/env node
/**
 * ROUND 297 (owner): "Petty Cash is bank account GL 1005. A bank account is not a vendor." The recon service-charge
 * payee resolver matched a vendor by the reconciled GL account's NAME, so reconciling GL 1005 "Petty Cash" posted a
 * $5.00 charge to vendor "Petty Cash". FAILS IF the resolver again derives a payee from a ledger account name, stops
 * using the bank's institution, or stops refusing a vendor named like one of the company's own ledger accounts.
 * Run: node scripts/verify-recon-payee-never-ledger-account.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/banking/recon-adjustments.service.ts";

export function audit(src) {
  const fn = src.match(/async function resolveBankVendorId\([\s\S]*?\n}\n/)?.[0] ?? "";
  const f = [];
  if (!fn) f.push("resolveBankVendorId is gone");
  if (!/NULLIF\(TRIM\(institution_name\), ''\) AS institution/.test(fn)) f.push("payee must come from the bank's institution_name");
  if (/display_name|account_name\)?, ''\)/.test(fn.replace(/lower\(a\.account_name\)/g, ""))) f.push("payee must not come from a bank account display / account name");
  if (/FROM catalogs\.accounts\s+WHERE id = \$1/.test(fn)) f.push("payee must not be looked up by the reconciled GL account's name");
  if (!/AND NOT EXISTS \(SELECT 1 FROM catalogs\.accounts a/.test(fn)) f.push("a vendor named like a company ledger account must be refused");
  return f;
}

const src = readFileSync(FILE, "utf8");
const fails = audit(src);
if (fails.length) { console.error(`verify-recon-payee-never-ledger-account: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const m = [
    ["GL-name fallback back", src.replace("  if (!bankAccountId) return null;", "  await client.query(`SELECT account_name\n       FROM catalogs.accounts\n      WHERE id = $1::uuid`, []);\n  if (!bankAccountId) return null;")],
    ["account-like vendor allowed", src.replace("AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a", "AND TRUE /* (SELECT 1 FROM catalogs.accounts a")],
    ["display name as payee", src.replace("NULLIF(TRIM(institution_name), '') AS institution", "COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(institution_name), '')) AS institution")],
  ];
  for (const [n, s] of m) if (audit(s).length === 0) { console.error(`selftest FAIL: ${n}`); process.exit(1); }
  console.log(`verify-recon-payee-never-ledger-account selftest ${m.length}/${m.length} caught`);
}
console.log("verify-recon-payee-never-ledger-account: OK — service-charge payee is the bank institution, never a ledger account");
