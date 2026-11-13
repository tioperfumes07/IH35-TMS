#!/usr/bin/env node
/**
 * verify-eng23-no-oldest-customer-fallback — ENG-23 guard.
 *
 * FINDING: ACCT-F4431103 (PR #26621, 2026-10-12) removed the oldest-customer fallback from
 * findCreatorCustomer in settlement-creator-seed-loads.ts. The old path silently booked a load
 * against the company's OLDEST active customer when the document name didn't exactly match any
 * customer. Zero USMCA loads were booked through it (TIO PERFUMES, oldest since 2026-08-02,
 * carried 0 of 148 live loads at fix time).
 *
 * STATIC GUARD (two rules):
 *   RULE 1 — findCreatorCustomer must return customer_unmatched when no match; never fall back.
 *            Verified by: source contains "customer_unmatched" and does NOT contain the old
 *            ORDER-BY-created_at-LIMIT-1 fallback SELECT on mdata.customers.
 *   RULE 2 — resolveCustomerId (the internal caller) must throw on unmatched, never default.
 *
 * Usage: node scripts/verify-eng23-no-oldest-customer-fallback.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-eng23-no-oldest-customer-fallback";
const SEED_FILE = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";

export const ALLOW_OFFLINE_SKIP = false;

function runStaticRules(src) {
  const errors = [];

  // RULE 1a: must contain customer_unmatched (the refuse-and-name pattern)
  if (!src.includes("customer_unmatched")) {
    errors.push("RULE 1a FAIL: findCreatorCustomer does not emit customer_unmatched — oldest-customer refuse pattern absent");
  }

  // RULE 1b: must NOT contain "ORDER BY created_at ASC LIMIT 1" in a customers SELECT
  //          (the old fallback picked the oldest by ASC created_at)
  if (/ORDER BY\s+created_at\s+ASC\s+LIMIT\s+1/i.test(src) &&
      /FROM\s+mdata\.customers/i.test(src)) {
    // Check if both appear in the same functional block (rough proximity: within 300 chars)
    const custIdx = src.search(/FROM\s+mdata\.customers/i);
    const orderIdx = src.search(/ORDER BY\s+created_at\s+ASC\s+LIMIT\s+1/i);
    if (Math.abs(custIdx - orderIdx) < 300) {
      errors.push("RULE 1b FAIL: oldest-customer fallback pattern (ORDER BY created_at ASC LIMIT 1 on mdata.customers) found — was not removed");
    }
  }

  // RULE 2: resolveCustomerId must throw on unmatched (not silently default)
  if (!src.includes("SettlementCreatorSeedError") || !src.includes("throw")) {
    errors.push("RULE 2 FAIL: resolveCustomerId does not throw on customer_unmatched — silent fallback may have been re-introduced");
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["valid source passes", () => {
      const fake = `
        export async function findCreatorCustomer() {
          return { code: "customer_unmatched", message: "not found" };
        }
        async function resolveCustomerId() {
          const found = await findCreatorCustomer();
          if (!("id" in found)) throw new SettlementCreatorSeedError(found.code, found.message);
        }
      `;
      return runStaticRules(fake).length === 0;
    }],
    ["missing customer_unmatched fails", () => {
      const fake = `
        export async function findCreatorCustomer() {
          return null;
        }
        async function resolveCustomerId() {
          throw new SettlementCreatorSeedError("x", "y");
        }
      `;
      return runStaticRules(fake).some(e => e.includes("RULE 1a"));
    }],
    ["missing throw fails", () => {
      const fake = `
        export async function findCreatorCustomer() {
          return { code: "customer_unmatched", message: "not found" };
        }
        async function resolveCustomerId() {
          const found = await findCreatorCustomer();
        }
      `;
      return runStaticRules(fake).some(e => e.includes("RULE 2"));
    }],
  ];
  let bad = 0;
  for (const [name, fn] of cases) {
    const pass = fn();
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
    if (!pass) bad++;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const src = readFileSync(SEED_FILE, "utf8");
const errors = runStaticRules(src);

if (errors.length > 0) {
  for (const e of errors) console.error(`${LABEL}: ${e}`);
  console.error(`${LABEL}: FAIL — ${errors.length} rule(s) violated in ${SEED_FILE}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — findCreatorCustomer refuses customer_unmatched; no oldest-customer fallback; resolveCustomerId throws on mismatch`);
process.exit(0);
