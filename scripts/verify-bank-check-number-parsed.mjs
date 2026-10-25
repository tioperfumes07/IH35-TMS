#!/usr/bin/env node
// LEAD 443.345 — every bank line whose text is a check ("Check Image 1078", "Check 1053") carries check_number.
// Static: migration 202616240400 defines the trigger. Live (DATABASE_URL): 0 such lines with a NULL check_number.
// --selftest: the parser accepts the two live shapes and rejects CHECKCARD / RETURN OF POSTED CHECK.
import { existsSync, readFileSync } from "node:fs";
const LABEL = "verify-bank-check-number-parsed";
export const ALLOW_OFFLINE_SKIP = "static half (trigger + parser selftest) always runs; only the live NULL-count half needs DATABASE_URL and CI runs it live";
const MIG = "db/migrations/202616240400_bank_line_check_number_from_description.sql";
export const parse = (d) => (/^\s*(?:check image|check)\s+#?([0-9]{3,8})\s*$/i.exec(d ?? "") ?? [])[1] ?? null;
if (process.argv.includes("--selftest")) {
  const ok = parse("Check Image 1078") === "1078" && parse("Check 1053") === "1053" && parse("CHECKCARD 0821 LOVES") === null
    && parse("RETURN OF POSTED CHECK / ITEM 123") === null && parse("CASHED CHECK HOLD ON 09/12") === null;
  console.log(`${LABEL} --selftest ${ok ? "PASS" : "FAIL"}`); process.exit(ok ? 0 : 1);
}
const fails = [];
if (!existsSync(MIG) || !/trg_bank_line_check_number/.test(readFileSync(MIG, "utf8"))) fails.push(`${MIG}: trigger trg_bank_line_check_number missing`);
let live = "live half skipped (no DATABASE_URL)";
if (!fails.length && process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY"); await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const n = Number((await c.query(`SELECT count(*) n FROM banking.bank_transactions WHERE voided_at IS NULL AND check_number IS NULL
      AND description ~* '^\\s*(check image|check)\\s+#?[0-9]{3,8}\\s*$'`)).rows[0].n);
    await c.query("ROLLBACK");
    if (n) fails.push(`${n} check line(s) without check_number`);
    live = `live: ${n} check line(s) without check_number`;
  } finally { await c.end(); }
}
if (fails.length) { console.error(`${LABEL} FAIL`); for (const f of fails) console.error(`  - ${f}`); process.exit(1); }
console.log(`${LABEL} PASS — ${live}`);
