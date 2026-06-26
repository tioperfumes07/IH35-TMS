#!/usr/bin/env node
/**
 * verify-posting-idempotency.mjs  —  BLOCK-RELIABILITY-04 Part B
 *
 * Asserts the posting-ledger idempotency UNIQUE guards still exist in db/migrations, so they can
 * never be silently dropped. A missing dedupe guarantee on the money ledger = the same source event
 * posting twice. GUARD-verified these exist on prod; this static guard locks them in CI.
 *
 * Required UNIQUE guards (defined in 0195_accounting_posting_backbone_schema.sql):
 *   - uq_posting_batches_company_idempotency_key   (one posting batch per company+idempotency_key)
 *   - uq_jep_source_posting_batch                  (one posting per source line within a batch)
 *
 * BLOCKING: exit 1 if any required guard is absent from the migration set. Pure static analysis, no DB.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

const REQUIRED = [
  "uq_posting_batches_company_idempotency_key",
  "uq_jep_source_posting_batch",
];

function main() {
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))
    : [];
  const corpus = files.map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")).join("\n");

  const missing = REQUIRED.filter((name) => {
    // require it to be created as a UNIQUE index (not merely mentioned in a comment/DROP).
    const re = new RegExp(`CREATE\\s+UNIQUE\\s+INDEX[\\s\\S]{0,80}?\\b${name}\\b`, "i");
    return !re.test(corpus);
  });

  if (missing.length === 0) {
    console.log(`[posting-idempotency] PASS — all ${REQUIRED.length} posting-ledger UNIQUE guards present.`);
    process.exit(0);
  }

  console.error("\nPOSTING-IDEMPOTENCY GUARD FAILED");
  console.error("=".repeat(60));
  console.error("Required UNIQUE dedupe guard(s) missing from db/migrations — the money ledger could double-post:");
  for (const m of missing) console.error(`  - ${m}`);
  console.error("=".repeat(60));
  console.error("Do NOT drop these. If intentionally renamed, update REQUIRED in this guard in the same PR.");
  process.exit(1);
}

main();
