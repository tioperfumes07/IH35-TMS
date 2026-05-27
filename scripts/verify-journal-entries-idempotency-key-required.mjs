#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const defaultTarget = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");
const targetPath = process.env.VERIFY_JE_IDEMPOTENCY_TARGET || defaultTarget;

if (!fs.existsSync(targetPath)) {
  console.error(`verify:journal-entries-idempotency-key-required failed: target not found (${path.relative(ROOT, targetPath)})`);
  process.exit(1);
}

const source = fs.readFileSync(targetPath, "utf8");
const insertMatch = source.match(/INSERT INTO accounting\.journal_entries[\s\S]*?RETURNING id::text/m);

if (!insertMatch) {
  console.error("verify:journal-entries-idempotency-key-required failed");
  console.error("journal_entries insert statement not found");
  process.exit(1);
}

const insertSql = insertMatch[0];
const hasColumn = /\bidempotency_key\b/m.test(insertSql);
const hasConflict = /ON CONFLICT \(operating_company_id, idempotency_key\)/m.test(insertSql);

if (!hasColumn || !hasConflict) {
  console.error("verify:journal-entries-idempotency-key-required failed");
  if (!hasColumn) console.error("idempotency_key column missing from journal_entries insert");
  if (!hasConflict) console.error("idempotency conflict guard missing on journal_entries insert");
  process.exit(1);
}

console.log("verify:journal-entries-idempotency-key-required: ok");
