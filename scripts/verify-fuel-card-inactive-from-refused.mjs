#!/usr/bin/env node
// ACCT-F11112 — a closed fuel card takes no new fuel row (owner 2026-11-09: Dreamline "account canceled"; WEX from 10-09).
//
// RULE 1 — migration 202616430100 defines fuel.refuse_fuel_on_inactive_card() reading
//          catalogs.fuel_card_types.metadata->>'inactive_from', comparing the fill's America/Chicago date, raising
//          'fuel_card_inactive', and lets a voided row through.
// RULE 2 — the trigger fires BEFORE INSERT OR UPDATE OF fuel_card_id, transaction_at, voided_at ON fuel.fuel_transactions.
// RULE 3 — the statement engine reads inactive_from and lists a line dated on/after it for review (nothing written).
import fs from "node:fs";

const MIG = "db/migrations/202616430100_acct_f11112_fuel_card_inactive_from.sql";
const ENGINE = "apps/backend/src/fuel/dreamline-statement-import.service.ts";

export function audit(files) {
  const out = [];
  const mig = files[MIG];
  const eng = files[ENGINE];
  if (mig == null) return [`RULE 1: ${MIG} is missing`];
  if (eng == null) return [`RULE 3: ${ENGINE} is missing`];
  if (!/CREATE OR REPLACE FUNCTION fuel\.refuse_fuel_on_inactive_card\(\)/.test(mig)) out.push("RULE 1: fuel.refuse_fuel_on_inactive_card() is not defined");
  if (!/metadata ->> 'inactive_from'/.test(mig)) out.push("RULE 1: the trigger no longer reads fuel_card_types.metadata.inactive_from");
  if (!/AT TIME ZONE 'America\/Chicago'\)::date/.test(mig)) out.push("RULE 1: the fill date is not the company (Central) date");
  if (!/IF v_fill_date >= v_inactive_from THEN\s*\n\s*RAISE EXCEPTION 'fuel_card_inactive/.test(mig)) out.push("RULE 1: a fill on/after the inactive date is not refused");
  if (!/IF NEW\.voided_at IS NOT NULL OR NEW\.fuel_card_id IS NULL THEN\s*\n\s*RETURN NEW;/.test(mig)) out.push("RULE 1: a void of a closed card's row would be refused (history must stay voidable)");
  if (!/CREATE TRIGGER trg_refuse_fuel_on_inactive_card\s*\n\s*BEFORE INSERT OR UPDATE OF fuel_card_id, transaction_at, voided_at ON fuel\.fuel_transactions/.test(mig)) out.push("RULE 2: the trigger is not BEFORE INSERT OR UPDATE OF fuel_card_id, transaction_at, voided_at on fuel.fuel_transactions");
  if (/DELETE\s+FROM/i.test(mig)) out.push("RULE 1: the migration deletes rows (history stays)");
  if (!/NULLIF\(metadata ->> 'inactive_from', ''\) AS inactive_from/.test(eng)) out.push("RULE 3: the statement engine does not read the card's inactive_from");
  if (!/if \(cardType\.inactive_from && line\.local_date >= cardType\.inactive_from\) \{\s*\n\s*record\(line, "unresolved"/.test(eng)) out.push("RULE 3: a statement line on a closed card is not listed for review");
  return out;
}

function load(root) {
  const files = {};
  for (const f of [MIG, ENGINE]) {
    try { files[f] = fs.readFileSync(`${root}/${f}`, "utf8"); } catch { files[f] = null; }
  }
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const cases = [
    ["no refusal", plant(MIG, "IF v_fill_date >= v_inactive_from THEN", "IF false THEN")],
    ["UTC date", plant(MIG, "AT TIME ZONE 'America/Chicago')::date", "AT TIME ZONE 'UTC')::date")],
    ["insert only", plant(MIG, "BEFORE INSERT OR UPDATE OF fuel_card_id, transaction_at, voided_at ON", "BEFORE INSERT ON")],
    ["void refused", plant(MIG, "IF NEW.voided_at IS NOT NULL OR NEW.fuel_card_id IS NULL THEN", "IF NEW.fuel_card_id IS NULL THEN")],
    ["engine writes on closed card", plant(ENGINE, "if (cardType.inactive_from && line.local_date >= cardType.inactive_from) {", "if (false) {")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-fuel-card-inactive-from-refused: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-fuel-card-inactive-from-refused FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-fuel-card-inactive-from-refused: PASS — closed card rail refuses new live fuel rows on/after inactive_from; statement lines listed for review");
