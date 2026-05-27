#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const defaultTarget = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");
const targetPath = process.env.VERIFY_POSTING_SKIP_LOCKED_TARGET || defaultTarget;

if (!fs.existsSync(targetPath)) {
  console.error(`verify:posting-uses-skip-locked failed: target not found (${path.relative(ROOT, targetPath)})`);
  process.exit(1);
}

const source = fs.readFileSync(targetPath, "utf8");
const hasPostingBatchIdempotencyConflict = /INSERT INTO accounting\.posting_batches[\s\S]*ON CONFLICT \(operating_company_id, idempotency_key\)/m.test(
  source
);
const hasSkipLocked = /FOR UPDATE SKIP LOCKED/m.test(source);

if (!hasPostingBatchIdempotencyConflict || !hasSkipLocked) {
  console.error("verify:posting-uses-skip-locked failed");
  if (!hasPostingBatchIdempotencyConflict) console.error("missing posting_batches idempotency conflict handling");
  if (!hasSkipLocked) console.error("missing FOR UPDATE SKIP LOCKED");
  process.exit(1);
}

console.log("verify:posting-uses-skip-locked: ok");
