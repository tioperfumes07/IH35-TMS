#!/usr/bin/env node
/**
 * modsweep-migA2 guard — the migration that prevents the 2026-07-04 bulk-dup recurrence must add a valid-VIN
 * CHECK on mdata.units that rejects the synthetic '-U' suffix on ACTIVE units (a plain UNIQUE(vin) can't —
 * 'original-U' is a distinct value). Locks on the migration:
 *   (1) it carries the DO-NOT-RUN held marker (financial-adjacent mdata schema change, owner-gated).
 *   (2) it ADDs a CHECK constraint on mdata.units referencing vin and the '-U' suffix, scoped to active rows
 *       (deactivated_at) so the already-voided phantoms don't block it.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-units-vin-dup-prevention";
const MIGRATION = "db/migrations/202607400000_units_vin_no_synthetic_dup.sql";

export function assertGuard({ sql }) {
  const errs = [];
  if (!/DO NOT RUN ON PROD/i.test(sql)) errs.push(`${MIGRATION}: missing the DO-NOT-RUN held marker`);
  if (!/ALTER TABLE\s+mdata\.units[\s\S]{0,300}?ADD CONSTRAINT[\s\S]{0,200}?CHECK/i.test(sql))
    errs.push(`${MIGRATION}: does not ADD a CHECK constraint on mdata.units`);
  if (!/vin\s*!~\s*'-U\$'|vin[\s\S]{0,40}?-U\$/i.test(sql))
    errs.push(`${MIGRATION}: CHECK does not reject the synthetic '-U' vin suffix (the 07-04 dup signature)`);
  if (!/deactivated_at/i.test(sql))
    errs.push(`${MIGRATION}: CHECK is not scoped to active units (deactivated_at) — the voided phantoms would block it`);
  return errs;
}

function selftest() {
  const good = `-- DO NOT RUN ON PROD
    ALTER TABLE mdata.units ADD CONSTRAINT units_vin_no_synthetic_dup_suffix
      CHECK (deactivated_at IS NOT NULL OR vin IS NULL OR vin !~ '-U$');`;
  const cases = [
    { n: "well-formed → 0", in: { sql: good }, want: 0 },
    { n: "no held marker", in: { sql: good.replace("-- DO NOT RUN ON PROD", "") }, min: 1 },
    { n: "no CHECK", in: { sql: good.replace(/ADD CONSTRAINT[\s\S]*?;/, "ADD COLUMN foo text;") }, min: 1 },
    { n: "no -U suffix rule", in: { sql: good.replace("vin !~ '-U$'", "vin IS NOT NULL") }, min: 1 },
    { n: "not active-scoped", in: { sql: good.replace("deactivated_at IS NOT NULL OR ", "") }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) { console.error(`\n${LABEL} SELFTEST FAILED: ${f}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const p = path.join(ROOT, MIGRATION);
if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${MIGRATION}`); process.exit(1); }
const errs = assertGuard({ sql: fs.readFileSync(p, "utf8") });
if (errs.length) { console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`); for (const e of errs) console.error(`  ✗ ${e}`); process.exit(1); }
console.log(`[${LABEL}] OK — migA2 adds a CHECK on active mdata.units rejecting the synthetic '-U' vin suffix.`);
