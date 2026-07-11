#!/usr/bin/env node
// verify-canonical-table-writes (G4, LINKAGE-LAW enforcement)
// The single most expensive error class is WRITING to (or pointing an FK at) a table the canonical map
// marks RETIRE — invisible until runtime, and it corrupts canonical data. This guard makes it a red CI.
// It WOULD HAVE CAUGHT PR #2314 (SETTLE-FK repointed a FK to payroll.driver_settlements, a RETIRE table).
//
// Scans apps/backend/src/** (non-test) + db/migrations/** for INSERT INTO / UPDATE / REFERENCES against a
// RETIRE table (SELECT-only reads are allowed during the retirement window). Current offenders (the live
// payroll settlement engine that #07 consolidation retires, etc.) are BASELINED in
// scripts/.canonical-write-exempt.json — any NEW write/FK to a RETIRE table fails. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXEMPT_REL = "scripts/.canonical-write-exempt.json";

// RETIRE table -> canonical (from FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md §A). Regex fragments.
const RETIRE = [
  { pat: "payroll\\.driver_settlement_line_items", canonical: "driver_finance.*" },
  { pat: "payroll\\.driver_settlements", canonical: "driver_finance.driver_settlements" },
  { pat: "settlement\\.\\w+", canonical: "driver_finance.*" },
  { pat: "accounting\\.qbo_accounts", canonical: "mdata.qbo_accounts" },
  { pat: "accounting\\.qbo_vendors", canonical: "mdata.qbo_vendors" },
  { pat: "accounting\\.qbo_customers", canonical: "mdata.qbo_customers" },
  { pat: "bank\\.\\w+", canonical: "banking.*" },
  { pat: "maint\\.part_position_assignment", canonical: "maintenance.part_position_assignment" },
  { pat: "maint\\.pm_schedule", canonical: "maintenance.pm_schedule" },
  { pat: "maint\\.position_\\w+", canonical: "maintenance.position_*" },
  { pat: "maint\\.part", canonical: "maintenance.part" },
  { pat: "catalogs\\.load_cancellation_reasons", canonical: "catalogs.cancellation_reasons" },
];
const RETIRE_ALT = RETIRE.map((r) => r.pat).join("|");
// WRITE = INSERT INTO / UPDATE / REFERENCES (covers FK ... REFERENCES + CREATE ... REFERENCES). NOT SELECT.
const WRITE_RE = new RegExp(`(INSERT\\s+INTO|UPDATE|REFERENCES)\\s+(?:ONLY\\s+)?(${RETIRE_ALT})`, "gi");

function canonicalFor(table) {
  for (const r of RETIRE) if (new RegExp(`^${r.pat}$`).test(table)) return r.canonical;
  return "the canonical table";
}

function listFiles() {
  const out = [];
  const walk = (dir, filter) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name === "node_modules") continue; walk(abs, filter); }
      else if (filter(e.name)) out.push(abs);
    }
  };
  // backend production source (exclude tests — retirement-window test writes are allowed)
  walk(path.join(ROOT, "apps/backend/src"), (n) => /\.ts$/.test(n) && !/\.(test|spec)\.ts$/.test(n) && !/__tests__/.test(n));
  // migrations (this is what would have caught the #2314 FK repoint)
  walk(path.join(ROOT, "db/migrations"), (n) => /\.sql$/.test(n));
  return out;
}

/** Return offenders: {key, file, line, verb, table, canonical}. key is line-stable (file::table::verb). */
export function scan(files) {
  const offenders = [];
  for (const abs of files) {
    let src;
    try { src = fs.readFileSync(abs, "utf8"); } catch { continue; }
    const rel = path.relative(ROOT, abs);
    let m;
    WRITE_RE.lastIndex = 0;
    while ((m = WRITE_RE.exec(src)) !== null) {
      const verb = m[1].replace(/\s+/g, " ").toUpperCase();
      const table = m[2];
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push({ key: `${rel}::${table}::${verb}`, file: rel, line, verb, table, canonical: canonicalFor(table) });
    }
  }
  return offenders;
}

function loadExempt() {
  try {
    const obj = JSON.parse(fs.readFileSync(path.join(ROOT, EXEMPT_REL), "utf8"));
    return new Set(Object.keys(obj).filter((k) => !k.startsWith("_")));
  } catch { return new Set(); }
}

function run() {
  const offenders = scan(listFiles());
  const exempt = loadExempt();
  const unexempted = offenders.filter((o) => !exempt.has(o.key));
  console.log(`verify:canonical-table-writes — ${offenders.length} RETIRE-writes (${exempt.size} baseline-exempt, ${unexempted.length} unaccounted)`);
  return unexempted.map((o) => `${o.file}:${o.line} — ${o.verb} ${o.table} (RETIRE) — write to canonical ${o.canonical} instead`);
}

export { run };

if (process.argv.includes("--selftest")) {
  const inject = [
    `INSERT INTO payroll.driver_settlements (id) VALUES ($1)`,
    `UPDATE bank.transactions SET x=1`,
    `CONSTRAINT fk FOREIGN KEY (sid) REFERENCES payroll.driver_settlements(id)`,
    `SELECT * FROM payroll.driver_settlements WHERE id=$1`, // read — allowed
    `INSERT INTO driver_finance.driver_settlements (id) VALUES ($1)`, // canonical — allowed
  ].join("\n");
  const found = [];
  WRITE_RE.lastIndex = 0;
  let m;
  while ((m = WRITE_RE.exec(inject)) !== null) found.push(m[2]);
  const checks = [
    ["INSERT INTO a RETIRE table is flagged", found.includes("payroll.driver_settlements")],
    ["UPDATE a RETIRE table is flagged", found.includes("bank.transactions")],
    ["a new FK REFERENCES a RETIRE table is flagged (#2314 class)", found.filter((t) => t === "payroll.driver_settlements").length >= 2],
    ["SELECT from a RETIRE table is NOT flagged", !/SELECT\s+\*\s+FROM.*payroll/i.test(found.join(""))],
    ["INSERT INTO the CANONICAL table is NOT flagged", !found.includes("driver_finance.driver_settlements")],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:canonical-table-writes --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:canonical-table-writes --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:canonical-table-writes FAIL — new write/FK to a RETIRE table (map marks it retired):");
    for (const f of failures) console.error("  ✗ " + f);
    console.error(`\nRETIRE writes must target the canonical table (FINAL-TABLES-WIRING §A). If this is a legitimate`);
    console.error(`retirement/backfill, add the key to ${EXEMPT_REL} with a reason.`);
    process.exit(1);
  }
  console.log("verify:canonical-table-writes PASS (no un-baselined write/FK to a RETIRE table)");
}
