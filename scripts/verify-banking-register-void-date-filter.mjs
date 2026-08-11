#!/usr/bin/env node
/**
 * Ratchet: Plaid company/account transaction lists must exclude voided rows and
 * future-dated rows (ops register clean for USMCA banking).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "apps/backend/src/integrations/plaid/link.routes.ts");
const src = readFileSync(target, "utf8");

const need = [
  "bt.voided_at IS NULL",
  "bt.transaction_date <= (CURRENT_DATE + INTERVAL '1 day')",
];
const missing = need.filter((s) => !src.includes(s));
if (process.argv.includes("--selftest")) {
  const bad = "bt.voided_at IS NULL /* selftest removed */";
  if (src.includes(bad)) {
    console.error("verify-banking-register-void-date-filter --selftest INERT");
    process.exit(1);
  }
  const probe = src.replace("bt.voided_at IS NULL", bad);
  const probeMissing = need.filter((s) => !probe.includes(s));
  if (probeMissing.length !== need.length) {
    console.error("verify-banking-register-void-date-filter --selftest INERT");
    process.exit(1);
  }
  console.log("verify-banking-register-void-date-filter --selftest PASS");
  process.exit(0);
}
if (missing.length) {
  console.error("verify-banking-register-void-date-filter FAIL missing:", missing.join(", "));
  process.exit(1);
}
console.log("verify-banking-register-void-date-filter PASS");
process.exit(0);
