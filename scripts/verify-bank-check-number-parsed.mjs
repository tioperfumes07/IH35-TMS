#!/usr/bin/env node
// LEAD 443.345 + 10-25 — every bank line that IS a check ("Check Image 1078", "Check 1053") or NAMES one
// ("CASHED CHECK HOLD ON 10/24 FOR CHECK #XXXXX001091", "CHK #191") carries check_number (leading zeros dropped).
// Static: migration 202616290000 defines ONE parser banking.parse_bank_line_check_number used by the trigger and the
// backfill, with the same two patterns as parse() below. Live (DATABASE_URL): 0 USMCA lines the parser reads with a
// NULL check_number.
// --selftest: the parser accepts the live shapes and rejects CHECKCARD / ATM "#XXXXX6869" / RETURN OF POSTED CHECK /
// a hold with no check number; and the guard fails if the migration loses either pattern or the trigger stops
// calling the shared parser.
import { existsSync, readFileSync } from "node:fs";
const LABEL = "verify-bank-check-number-parsed";
export const ALLOW_OFFLINE_SKIP = "static half (trigger + parser selftest) always runs; only the live NULL-count half needs DATABASE_URL and CI runs it live";
const MIG = "db/migrations/202616290000_bank_line_check_number_cashed_check_hold.sql";
const IS_CHECK = String.raw`(?i)^\s*(?:check image|check)\s+#?([0-9]{3,8})\s*$`;
const NAMES_CHECK = String.raw`(?i)\m(?:check|chk|ck)\M\s*(?:no\.?\s*)?#\s*X*([0-9]{1,10})`;
export function parse(d) {
  const s = String(d ?? "");
  const m = /^\s*(?:check image|check)\s+#?([0-9]{3,8})\s*$/i.exec(s) ?? /\b(?:check|chk|ck)\b\s*(?:no\.?\s*)?#\s*X*([0-9]{1,10})/i.exec(s);
  if (!m) return null;
  const v = m[1].replace(/^0+/, "");
  return v === "" ? null : v;
}
export function staticFailures(sql) {
  const f = [];
  if (!sql.includes(IS_CHECK)) f.push(`${MIG}: parser lost the "line IS the check" pattern`);
  if (!sql.includes(NAMES_CHECK)) f.push(`${MIG}: parser lost the "line NAMES the check" pattern (FOR CHECK #XXXXX001091)`);
  if (!/NEW\.check_number\s*:=\s*banking\.parse_bank_line_check_number\(NEW\.description\)/.test(sql)) f.push(`${MIG}: trigger does not call the shared parser`);
  if (!/CREATE TRIGGER trg_bank_line_check_number/.test(sql)) f.push(`${MIG}: trigger trg_bank_line_check_number missing`);
  if (!/SET check_number = banking\.parse_bank_line_check_number\(description\)/.test(sql)) f.push(`${MIG}: backfill does not use the shared parser`);
  return f;
}
if (process.argv.includes("--selftest")) {
  const cases = [
    ["Check Image 1078", "1078"], ["Check 1053", "1053"], ["check 0191", "191"],
    ["CASHED CHECK HOLD ON 10/24 FOR CHECK #XXXXX001091", "1091"], ["CHK #191", "191"], ["CK # 0042 payroll", "42"],
    ["CHECKCARD 0821 LOVES", null], ["BKOFAMERICA ATM 09/01 #XXXXX6869 WITHDRWL LAREDO TX CKCD XXXXXX", null],
    ["RETURN OF POSTED CHECK / ITEM 123", null], ["CASHED CHECK HOLD ON 10/05", null], ["CHECK HOLD FOR POSTED DEPOSIT", null],
  ];
  let ok = 0;
  for (const [d, want] of cases) { const got = parse(d); const pass = got === want; if (pass) ok++; else console.error(`  FAIL parse(${JSON.stringify(d)}) = ${got}, want ${want}`); }
  const real = existsSync(MIG) ? readFileSync(MIG, "utf8") : "";
  const plants = [
    ["names-check pattern removed", real.replace(NAMES_CHECK, "(?i)NEVER")],
    ["trigger bypasses the parser", real.replace("NEW.check_number := banking.parse_bank_line_check_number(NEW.description);", "NULL;")],
    ["backfill bypasses the parser", real.replace("SET check_number = banking.parse_bank_line_check_number(description)", "SET check_number = NULL")],
  ];
  const baseline = staticFailures(real).length === 0;
  let caught = 0;
  for (const [name, s] of plants) { if (s !== real && staticFailures(s).length) caught++; else console.error(`  FAIL plant escaped: ${name}`); }
  const pass = ok === cases.length && baseline && caught === plants.length;
  console.log(`${LABEL} --selftest ${pass ? "PASS" : "FAIL"} (parse ${ok}/${cases.length}, plants ${caught}/${plants.length})`);
  process.exit(pass ? 0 : 1);
}
const fails = existsSync(MIG) ? staticFailures(readFileSync(MIG, "utf8")) : [`${MIG} missing`];
let live = "live half skipped (no DATABASE_URL)";
if (!fails.length && process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY"); await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const n = Number((await c.query(`SELECT count(*) n FROM banking.bank_transactions
      WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid AND voided_at IS NULL AND check_number IS NULL
        AND banking.parse_bank_line_check_number(description) IS NOT NULL`)).rows[0].n);
    await c.query("ROLLBACK");
    if (n) fails.push(`${n} USMCA check line(s) without check_number`);
    live = `live: ${n} USMCA check line(s) without check_number`;
  } finally { await c.end(); }
}
if (fails.length) { console.error(`${LABEL} FAIL`); for (const f of fails) console.error(`  - ${f}`); process.exit(1); }
console.log(`${LABEL} PASS — ${live}`);
