#!/usr/bin/env node
// verify-canonical-table-writes (G4, LINKAGE-LAW enforcement)
// The single most expensive error class is WRITING to (or pointing an FK at) a table the canonical map
// marks RETIRE — invisible until runtime, and it corrupts canonical data. This guard makes it a red CI.
// It WOULD HAVE CAUGHT PR #2314 (SETTLE-FK repointed a FK to payroll.driver_settlements, a RETIRE table).
//
// Scans apps/backend/src/** (non-test) + db/migrations/** for INSERT INTO / UPDATE / REFERENCES against a
// RETIRE table (SELECT-only reads are allowed during the retirement window). COMMENTS ARE STRIPPED before
// matching so a `-- ... REFERENCES settlement.x` doc line is not a false positive (GUARD finding 1).
// Current writes are BASELINED WITH A PER-KEY COUNT in scripts/.canonical-write-exempt.json — a NEW
// write/FK fails CI even when added to an already-baselined file (live count > baseline count; GUARD
// finding 2). Self-test: --selftest.
//
// COVERAGE BOUNDARY (GUARD finding 4): scans only apps/backend/src + db/migrations — where all SQL writers
// live (frontend/driver-pwa call the API, they don't issue SQL). If a worker/packages/ root ever issues
// SQL, extend SCAN_ROOTS below.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXEMPT_REL = "scripts/.canonical-write-exempt.json";

// RETIRE table -> canonical (from FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md §A). Regex fragments.
// payroll.* is retired WHOLESALE (LINKAGE-LAW) — wildcard for parity with the law (GUARD finding 3);
// the two specific rows precede it only for a nicer canonical-name suggestion.
const RETIRE = [
  { pat: "payroll\\.driver_settlement_line_items", canonical: "driver_finance.*" },
  { pat: "payroll\\.driver_settlements", canonical: "driver_finance.driver_settlements" },
  { pat: "payroll\\.\\w+", canonical: "driver_finance.*" },
  { pat: "settlement\\.\\w+", canonical: "driver_finance.*" },
  // plural RETIRE schema (disputes + team-split config) — B-C.P4 G4 harden
  { pat: "settlements\\.settlement_disputes", canonical: "driver_finance.driver_settlement_disputes" },
  { pat: "settlements\\.team_split_configs", canonical: "driver_finance.team_settlement_splits" },
  { pat: "settlements\\.team_split_load_overrides", canonical: "driver_finance.team_settlement_splits" },
  { pat: "accounting\\.qbo_accounts", canonical: "mdata.qbo_accounts" },
  // CORRECTED 2026-07-28 (ACCT-ECON-05 / Rule 14 / Desktop): was INVERTED — treated
  // accounting.qbo_vendors as RETIRE and mdata.qbo_vendors as canonical. Prod + linkage law:
  //   accounting.qbo_vendors — CANONICAL AP QBO vendor masters
  //   mdata.qbo_vendors      — RETIRE mirror (sync may still write mid-flight; shrink-only exempt)
  // Customers/accounts inversion stays a follow-on wave (same defect class; not this FINDING).
  { pat: "mdata\\.qbo_vendors", canonical: "accounting.qbo_vendors" },
  { pat: "accounting\\.qbo_customers", canonical: "mdata.qbo_customers" },
  { pat: "bank\\.\\w+", canonical: "banking.*" },
  { pat: "maint\\.part_position_assignment", canonical: "maintenance.part_position_assignment" },
  { pat: "maint\\.pm_schedule", canonical: "maintenance.pm_schedule" },
  { pat: "maint\\.position_\\w+", canonical: "maintenance.position_*" },
  { pat: "maint\\.part", canonical: "maintenance.part" },
  // CORRECTED 2026-07-25 — this entry was INVERTED. It declared the MODERN per-entity table as
  // RETIRE and the LEGACY global table as canonical, so a regression writing the legacy table passed
  // while every correct write to the canonical table was flagged (6 were baselined as "violations").
  // Prod (br-fancy-credit-akjnd07a) + the migrations agree on the real direction:
  //   catalogs.cancellation_reasons        — legacy global, NO operating_company_id, relrowsecurity=false, 9 rows
  //   catalogs.load_cancellation_reasons   — canonical per-entity, operating_company_id NOT NULL, FORCE RLS, 63 rows
  // db/migrations/202606300130_load_cancellations_per_entity_fk.sql header states verbatim that
  // load_cancellation_reasons is "the go-forward home". Precedence: prod > guard > doc.
  { pat: "catalogs\\.cancellation_reasons", canonical: "catalogs.load_cancellation_reasons" },
];
const RETIRE_ALT = RETIRE.map((r) => r.pat).join("|");
// WRITE = INSERT INTO / UPDATE / REFERENCES (covers FK ... REFERENCES + CREATE ... REFERENCES). NOT SELECT.
const WRITE_RE = new RegExp(`(INSERT\\s+INTO|UPDATE|REFERENCES)\\s+(?:ONLY\\s+)?(${RETIRE_ALT})`, "gi");

function canonicalFor(table) {
  for (const r of RETIRE) if (new RegExp(`^${r.pat}$`, "i").test(table)) return r.canonical;
  return "the canonical table";
}

// Blank out comment CONTENT (keep newlines so line numbers stay accurate) so commented-out or descriptive
// SQL/TS is not matched. Handles /* block */ (both), -- line (.sql), // line (.ts).
export function blankComments(src, isSql) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  let out = src.replace(/\/\*[\s\S]*?\*\//g, blank); // block comments (both)
  if (isSql) out = out.replace(/--[^\n]*/g, blank); // SQL line comments
  else out = out.replace(/\/\/[^\n]*/g, blank); // TS line comments (our matches live in backtick SQL, not //)
  return out;
}

const SCAN_ROOTS = [
  { dir: "apps/backend/src", filter: (n) => /\.ts$/.test(n) && !/\.(test|spec)\.ts$/.test(n) && !/__tests__/.test(n), sql: false },
  { dir: "db/migrations", filter: (n) => /\.sql$/.test(n), sql: true },
];

function listFiles() {
  const out = [];
  const walk = (dir, filter, sql) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name === "node_modules") continue; walk(abs, filter, sql); }
      else if (filter(e.name)) out.push({ abs, sql });
    }
  };
  for (const r of SCAN_ROOTS) walk(path.join(ROOT, r.dir), r.filter, r.sql);
  return out;
}

/** Return offenders: {key, file, line, verb, table, canonical}. key is line-stable (file::table::verb). */
export function scan(files) {
  const offenders = [];
  for (const f of files) {
    const abs = typeof f === "string" ? f : f.abs;
    const isSql = typeof f === "string" ? /\.sql$/.test(f) : f.sql;
    let raw;
    try { raw = fs.readFileSync(abs, "utf8"); } catch { continue; }
    const src = blankComments(raw, isSql);
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

/** Baseline map: key -> {count, reason}. Back-compat: a string value counts as {count: Infinity-ish}? No —
 *  we require the object form so the ratchet can compare counts. */
function loadExempt() {
  const map = new Map();
  try {
    const obj = JSON.parse(fs.readFileSync(path.join(ROOT, EXEMPT_REL), "utf8"));
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_")) continue;
      map.set(k, typeof v === "object" && v && Number.isFinite(v.count) ? v.count : 0);
    }
  } catch { /* no baseline */ }
  return map;
}

function liveCountsByKey(offenders) {
  const counts = new Map();
  for (const o of offenders) counts.set(o.key, (counts.get(o.key) ?? 0) + 1);
  return counts;
}

function run() {
  const offenders = scan(listFiles());
  const baseline = loadExempt();
  const live = liveCountsByKey(offenders);
  const failures = [];
  let baselinedTotal = 0;
  for (const [key, liveN] of live) {
    const baseN = baseline.get(key) ?? 0;
    baselinedTotal += Math.min(liveN, baseN);
    if (liveN > baseN) {
      const offs = offenders.filter((o) => o.key === key);
      const first = offs[0];
      failures.push(
        `${first.file}: ${liveN} write(s) to RETIRE '${first.table}' via ${first.verb} (baseline ${baseN}) — a NEW write/FK was added; use canonical ${first.canonical}. Lines: ${offs.map((o) => o.line).join(", ")}`
      );
    }
  }
  console.log(`verify:canonical-table-writes — ${offenders.length} RETIRE-writes across ${live.size} keys (${baselinedTotal} within baseline, ${failures.length} keys over baseline)`);
  return failures;
}

export { run };

if (process.argv.includes("--selftest")) {
  const injectSql = [
    `INSERT INTO payroll.driver_settlements (id) VALUES ($1);`,
    `UPDATE bank.transactions SET x=1;`,
    `CONSTRAINT fk FOREIGN KEY (sid) REFERENCES payroll.driver_settlements(id),`,
    `-- old:  sid UUID REFERENCES settlement.settlement(id),   <- COMMENT, must NOT match`,
    `SELECT * FROM payroll.driver_settlements WHERE id=$1;`, // read — allowed
    `INSERT INTO driver_finance.driver_settlements (id) VALUES ($1);`, // canonical — allowed
    `INSERT INTO payroll.tax_withholding (id) VALUES ($1);`, // wildcard payroll.* must catch (finding 3)
    `INSERT INTO settlements.settlement_disputes (id) VALUES ($1);`, // plural RETIRE — P4
    `INSERT INTO mdata.qbo_vendors (id) VALUES ($1);`, // ACCT-ECON-05 RETIRE
    `INSERT INTO accounting.qbo_vendors (id) VALUES ($1);`, // ACCT-ECON-05 CANONICAL — must NOT flag
  ].join("\n");
  const blanked = blankComments(injectSql, true);
  const found = [];
  WRITE_RE.lastIndex = 0;
  let m;
  while ((m = WRITE_RE.exec(blanked)) !== null) found.push(m[2]);
  // count-ratchet logic check
  const base = new Map([["f::payroll.driver_settlements::INSERT INTO", 1]]);
  const liveA = new Map([["f::payroll.driver_settlements::INSERT INTO", 1]]);
  const liveB = new Map([["f::payroll.driver_settlements::INSERT INTO", 2]]); // a NEW same-file write
  const overBase = (live) => [...live].some(([k, n]) => n > (base.get(k) ?? 0));
  const checks = [
    ["INSERT INTO a RETIRE table is flagged", found.includes("payroll.driver_settlements")],
    ["UPDATE a RETIRE table is flagged", found.includes("bank.transactions")],
    ["a new FK REFERENCES a RETIRE table is flagged (#2314 class)", found.filter((t) => t === "payroll.driver_settlements").length >= 2],
    ["a COMMENTED REFERENCES is NOT flagged (finding 1)", !found.includes("settlement.settlement")],
    ["payroll.* wildcard catches a non-enumerated payroll table (finding 3)", found.includes("payroll.tax_withholding")],
    ["INSERT INTO the CANONICAL table is NOT flagged", !found.includes("driver_finance.driver_settlements")],
    ["settlements.* plural RETIRE INSERT is flagged (P4)", found.includes("settlements.settlement_disputes")],
    ["ACCT-ECON-05: INSERT mdata.qbo_vendors (RETIRE) is flagged", found.includes("mdata.qbo_vendors")],
    ["ACCT-ECON-05: INSERT accounting.qbo_vendors (CANONICAL) is NOT flagged", !found.includes("accounting.qbo_vendors")],
    ["count-ratchet: live==baseline passes (finding 2)", !overBase(liveA)],
    ["count-ratchet: a NEW same-file write (live>baseline) FAILS (finding 2)", overBase(liveB)],
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
    console.error(`retirement/backfill, bump the key's count in ${EXEMPT_REL} with a reason.`);
    process.exit(1);
  }
  console.log("verify:canonical-table-writes PASS (no write/FK to a RETIRE table above its baseline count)");
}
