#!/usr/bin/env node
/**
 * USMCA permanent flag law — posting ON, QBO OFF (owner 2026-08-12).
 * Static ratchet: migration must exist and must force QBO_* false + posting enable loop for USMCA.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "db/migrations/202608121800_usmca_posting_on_qbo_off.sql");

function analyze(sql) {
  const failures = [];
  if (!/code = 'USMCA'/.test(sql)) failures.push("must resolve USMCA by org.companies.code");
  if (!/enabled = false/.test(sql) || !/QBO/.test(sql)) failures.push("must force QBO-class flags OFF for USMCA");
  if (!/enabled = true/.test(sql)) failures.push("must enable posting-class flags for USMCA");
  for (const stmt of sql.split(";")) {
    const flat = stmt.replace(/\s+/g, " ");
    if (!flat.includes("QBO_JE_PUSH_ENABLED")) continue;
    if (/\benabled\s*=\s*true\b/i.test(flat)) {
      failures.push("must never set QBO_JE_PUSH_ENABLED true for USMCA");
    }
  }
  if (/RAISE\s+EXCEPTION/i.test(sql)) failures.push("fresh-DB safe: no RAISE EXCEPTION");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
    SELECT id FROM org.companies WHERE code = 'USMCA';
    enabled = false; QBO_JE_PUSH_ENABLED;
    enabled = true; GL_POSTING_ENABLED;
    RAISE NOTICE 'ok';
  `;
  const bad = `
    RAISE EXCEPTION 'nope';
    INSERT INTO lib.feature_flag_overrides VALUES (gen_random_uuid(), 'QBO_JE_PUSH_ENABLED', v_usmca, NULL, true, v_setter, now(), NULL);
  `;
  if (analyze(good).length === 0 && analyze(bad).length > 0) {
    console.log("verify-usmca-posting-on-qbo-off --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-usmca-posting-on-qbo-off --selftest: FAIL");
  process.exit(1);
}

if (!fs.existsSync(MIG)) {
  console.error("FAIL: missing", MIG);
  process.exit(1);
}
const failures = analyze(fs.readFileSync(MIG, "utf8"));
if (failures.length) {
  console.error("verify-usmca-posting-on-qbo-off — FAILED");
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log("verify-usmca-posting-on-qbo-off — OK");
