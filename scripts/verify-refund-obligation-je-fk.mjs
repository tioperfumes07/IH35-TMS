#!/usr/bin/env node
/**
 * INS-03 — insurance.refund_obligation.journal_entry_id must FK accounting.journal_entries.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-refund-obligation-je-fk";
const SELFTEST = process.argv.includes("--selftest");
const MIG = path.join(ROOT, "db/migrations/202609010080_ins_03_refund_obligation_je_fk.sql");

/** @param {string} mig */
export function check(mig) {
  const problems = [];
  if (!mig) {
    problems.push("missing migration 202609010080_ins_03_refund_obligation_je_fk.sql");
    return problems;
  }
  if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must carry HOLD-FOR-JORGE");
  if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must carry DO NOT RUN ON PROD");
  if (!/refund_obligation_journal_entry_id_fkey/.test(mig)) {
    problems.push("must ADD CONSTRAINT refund_obligation_journal_entry_id_fkey");
  }
  if (!/REFERENCES\s+accounting\.journal_entries\s*\(\s*id\s*\)/i.test(mig)) {
    problems.push("FK must REFERENCES accounting.journal_entries(id)");
  }
  if (!/ON DELETE RESTRICT/i.test(mig)) problems.push("FK must ON DELETE RESTRICT (void-not-delete)");
  if (!/dangling/i.test(mig) || !/ABORT/i.test(mig)) {
    problems.push("must abort when dangling journal_entry_id rows exist");
  }
  return problems;
}

function selftest() {
  const good = `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nABORT dangling\nADD CONSTRAINT refund_obligation_journal_entry_id_fkey\nFOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries(id)\nON DELETE RESTRICT`;
  const bad = `ADD CONSTRAINT foo FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries(id) ON DELETE CASCADE`;
  if (check(good).length) throw new Error("compliant flagged");
  if (!check(bad).length) throw new Error("CASCADE / missing name not caught");
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const mig = fs.existsSync(MIG) ? fs.readFileSync(MIG, "utf8") : "";
const problems = check(mig);
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — refund_obligation.journal_entry_id FK to journal_entries (RESTRICT)`);
