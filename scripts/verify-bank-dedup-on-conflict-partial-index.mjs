#!/usr/bin/env node
/**
 * BANK-F11 — bank_transactions dedup upsert must match partial unique
 * uq_bank_transactions_account_dedup (… WHERE dedup_hash IS NOT NULL AND voided_at IS NULL).
 *
 * Without the index predicate, PostgreSQL raises:
 *   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
 * which broke TRANSP Relay daily ingest (wallet feed) from 2026-07-27 onward.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-dedup-on-conflict-partial-index";

const TARGETS = [
  "apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts",
  "apps/backend/src/banking/transaction-ingestion.ts",
  "apps/backend/src/integrations/plaid/plaid.service.ts",
  "apps/backend/src/seed/csv-seed-import.ts",
];

const CONFLICT_RE = /ON CONFLICT\s*\(\s*bank_account_id\s*,\s*dedup_hash\s*\)/g;
const PREDICATE_RE =
  /ON CONFLICT\s*\(\s*bank_account_id\s*,\s*dedup_hash\s*\)\s*WHERE\s+dedup_hash\s+IS\s+NOT\s+NULL\s+AND\s+voided_at\s+IS\s+NULL/g;

/** @param {Record<string, string | null>} files */
export function check(files) {
  const f = [];
  for (const rel of TARGETS) {
    const src = files[rel];
    if (!src) {
      f.push(`${rel}: missing`);
      continue;
    }
    const conflicts = src.match(CONFLICT_RE) ?? [];
    const predicated = src.match(PREDICATE_RE) ?? [];
    if (!conflicts.length) {
      f.push(`${rel}: expected ON CONFLICT (bank_account_id, dedup_hash)`);
      continue;
    }
    if (predicated.length !== conflicts.length) {
      f.push(
        `${rel}: every ON CONFLICT (bank_account_id, dedup_hash) must include WHERE dedup_hash IS NOT NULL AND voided_at IS NULL (found ${predicated.length}/${conflicts.length})`,
      );
    }
  }
  return f;
}

export function run(root = ROOT) {
  /** @type {Record<string, string | null>} */
  const files = {};
  for (const rel of TARGETS) {
    try {
      files[rel] = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      files[rel] = null;
    }
  }
  return check(files);
}

if (process.argv.includes("--selftest")) {
  const good = {
    [TARGETS[0]]: "ON CONFLICT (bank_account_id, dedup_hash) WHERE dedup_hash IS NOT NULL AND voided_at IS NULL DO UPDATE SET x=1",
    [TARGETS[1]]: "ON CONFLICT (bank_account_id, dedup_hash) WHERE dedup_hash IS NOT NULL AND voided_at IS NULL DO NOTHING",
    [TARGETS[2]]: "ON CONFLICT (bank_account_id, dedup_hash) WHERE dedup_hash IS NOT NULL AND voided_at IS NULL DO NOTHING",
    [TARGETS[3]]: "ON CONFLICT (bank_account_id, dedup_hash) WHERE dedup_hash IS NOT NULL AND voided_at IS NULL DO NOTHING",
  };
  if (check(good).length) throw new Error(`${LABEL} PASS fail`);
  const bad = { ...good, [TARGETS[0]]: "ON CONFLICT (bank_account_id, dedup_hash) DO UPDATE SET x=1" };
  if (!check(bad).length) throw new Error(`${LABEL} FAIL fail`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
