#!/usr/bin/env node
/**
 * GUARD — BANK-F14. `banking.bank_accounts` carries TWO flags for one idea (`is_active`,
 * `deactivated_at`). Queries used them interchangeably and they drifted.
 *
 * THE DEFECT (prod, 2026-07-30): four rows were is_active = true AND deactivated_at IS NOT NULL. The
 * cash total (internal-wallet-balance.ts) filtered on is_active ALONE, so three of Transportation's
 * Wells Fargo accounts — ••6103, ••6129, ••6137, visible under Trucking because one Plaid login covers
 * both companies — were counted as Trucking cash. Trucking reported $2,009.05 when its own Wells Fargo
 * cash was $5.38. Silent: nothing errored.
 *
 * Two things must hold, and this guard pins both:
 *   1. The invariant is enforced in the DATABASE (CHECK), so a query reading either flag alone is
 *      correct by construction. That is the root fix.
 *   2. The money query still names BOTH flags — defence in depth if the constraint is ever dropped.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG = "db/migrations/202610280000_bankf14_bank_account_liveness_contradiction.sql";
const CASH = "apps/backend/src/banking/internal-wallet-balance.ts";

let failures = 0;
const check = (n, c, d = "") => { if (c) console.log(`  PASS  ${n}`); else { console.error(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); failures++; } };

console.log("verify:bank-account-liveness-single-truth");

const mig = readFileSync(join(ROOT, MIG), "utf8");
check("migration repairs the contradictory rows", /UPDATE banking\.bank_accounts[\s\S]{0,200}SET is_active = false/.test(mig));
check("repair is guarded (idempotent)", mig.includes("WHERE is_active = true") && mig.includes("deactivated_at IS NOT NULL"));
check("migration adds the CHECK constraint", mig.includes("ck_bank_accounts_deactivated_implies_inactive"));
check("constraint says deactivated implies NOT active", mig.includes("CHECK (deactivated_at IS NULL OR is_active = false)"));
check("constraint add is idempotent", mig.includes("IF NOT EXISTS") && mig.includes("pg_constraint"));
check("migration fails closed if a contradiction survives", mig.includes("RAISE EXCEPTION") && mig.includes("still active-and-deactivated"));

const cash = readFileSync(join(ROOT, CASH), "utf8");
const plaidBlock = cash.slice(cash.indexOf("plaid_item_id IS NOT NULL") - 900, cash.indexOf("plaid_item_id IS NOT NULL"));
check("cash total (plaid arm) filters BOTH flags", plaidBlock.includes("is_active = true") && plaidBlock.includes("deactivated_at IS NULL"),
  "is_active alone is what counted another entity's accounts as Trucking cash");
const walletIdx = cash.indexOf("ba.plaid_item_id IS NULL");
const walletBlock = cash.slice(Math.max(0, walletIdx - 900), walletIdx);
check("cash total (internal-wallet arm) filters BOTH flags", walletBlock.includes("ba.is_active = true") && walletBlock.includes("ba.deactivated_at IS NULL"));

// Mutation arm: prove the money-query assertion can fail.
check("mutation: dropping deactivated_at from the cash filter would fail the check above",
  !plaidBlock.replace("AND deactivated_at IS NULL", "").includes("deactivated_at IS NULL"));

if (failures > 0) { console.error(`\nverify:bank-account-liveness-single-truth FAILED (${failures})`); process.exit(1); }
console.log("verify:bank-account-liveness-single-truth PASS");
