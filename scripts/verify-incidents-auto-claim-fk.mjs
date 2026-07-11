#!/usr/bin/env node
// verify-incidents-auto-claim-fk (P4-05) — asserts migration 202607240000 adds safety.incidents
// .auto_created_claim_id -> insurance.claim(id) FK (NOT VALID, idempotent). Self-test: --selftest.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607240000_incidents_auto_claim_fk.sql";
export function check(sql) {
  const f = [];
  if (!/FOREIGN\s+KEY\s*\(\s*auto_created_claim_id\s*\)\s*REFERENCES\s+insurance\.claim\s*\(\s*id\s*\)/i.test(sql)) f.push("must add FK auto_created_claim_id -> insurance.claim(id)");
  if (!/NOT\s+VALID/i.test(sql)) f.push("FK must be NOT VALID (safe against orphans; GUARD VALIDATEs on Neon)");
  if (!/pg_constraint/i.test(sql)) f.push("must be idempotent (pg_constraint guard)");
  return f;
}
export function run() { try { return check(fs.readFileSync(path.join(ROOT, MIG), "utf8")); } catch { return [`${MIG} not found`]; } }
if (process.argv.includes("--selftest")) {
  const good = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='a') THEN ALTER TABLE safety.incidents ADD CONSTRAINT a FOREIGN KEY (auto_created_claim_id) REFERENCES insurance.claim(id) ON DELETE SET NULL NOT VALID; END IF; END $$;`;
  const checks = [["FK+NOTVALID+idempotent passes", check(good).length === 0], ["missing NOT VALID caught", check(good.replace(/NOT VALID/g,"")).some((x)=>/NOT VALID/.test(x))]];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("FAIL"); for (const [n] of failed) console.error("  ✗ "+n); process.exit(1); }
  console.log(`verify:incidents-auto-claim-fk --selftest PASS (${checks.length} checks)`); process.exit(0);
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { const f = run(); if (f.length) { console.error("verify:incidents-auto-claim-fk FAIL:"); for (const x of f) console.error("  ✗ "+x); process.exit(1); } console.log("verify:incidents-auto-claim-fk PASS"); }
