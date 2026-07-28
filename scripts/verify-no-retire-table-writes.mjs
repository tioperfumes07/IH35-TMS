#!/usr/bin/env node
// verify-no-retire-table-writes.mjs (FOUNDATION-FIRST Priority 4 — absolute RETIRE-class guard, G4)
//
// The settlement canonicalization (P2a #3084, P2b #3085, P2c #3075, P2e #3077) drove the RETIRE
// settlement tables to ZERO live references, each protected by a table-specific guard. This guard is
// the ABSOLUTE layer on top: the entire enforceable RETIRE class (LINKAGE-LAW rule 14 +
// docs/specs/SETTLEMENT-ENGINE-PHASE0-REVERIFY-2026-07-21.md §6.1) can never regain a live reference
// — reads, writes, deletes, joins, or availability probes — in app code.
//
// Two tiers (verified against origin/main @ 9b3cbab7a, 2026-07-21):
//   ENFORCED      — zero live refs today; ANY new reference fails CI.
//   KNOWN_LEGACY  — rule-14 RETIRE names that still have live references on main (bank.*, maint.*,
//                   catalogs.load_cancellation_reasons). Printed as warnings, never fail. Each needs
//                   its own repoint block before it can be promoted to ENFORCED. Promotion = move the
//                   entry up; the guard then locks it forever.
//
// NOT in either list (deliberately — rule 14 marks these CANONICAL, not RETIRE):
//   driver_finance.* · banking.* · maintenance.* · mdata.vendors · mdata.loads ·
//   catalogs.cancellation_reasons · accounting.qbo_vendors (Desktop ACCT-ECON-05 2026-07-28 —
//   CANONICAL AP QBO vendor masters; mdata.qbo_vendors is RETIRE → KNOWN_LEGACY below).
//   Older "WO picker writing mdata.qbo_vendors" mirror-sync canonical reading is SUPERSEDED for
//   vendor masters. Other accounting.qbo_* (accounts/customers) remain ENFORCED until their
//   Desktop leaves flip. A table-level static scan cannot enforce every context without false
//   positives for remaining mdata.qbo_* sync writers — those stay KNOWN_LEGACY warnings.
//
// Scan: apps/backend/src + apps/frontend/src, .ts/.tsx, comments stripped before matching
// (a doc comment quoting removed SQL must not fail the build). Exempt: __tests__/, *.test.*,
// *.spec.*, *.deprecated.ts (void-not-delete archives). Historical migrations (.sql) are the
// existing verify-canonical-table-writes baseline's jurisdiction, not this guard's.
//
// --selftest plants a violation for every detection class and proves the legacy tier warns
// without failing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-retire-table-writes";
const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];

// Regex fragments. Wildcards only where the WHOLE namespace is retired AND live-ref-free on main.
export const ENFORCED = [
  // Settlement RETIRE set — ABSOLUTE (owner order, FOUNDATION-FIRST P4)
  { pat: "payroll\\.driver_settlements", canonical: "driver_finance.driver_settlements" },
  { pat: "payroll\\.driver_settlement_line_items", canonical: "driver_finance.settlement_lines" },
  { pat: "payroll\\.\\w+", canonical: "driver_finance.*" }, // payroll.* retired WHOLESALE (LINKAGE-LAW)
  { pat: "settlement\\.\\w+", canonical: "driver_finance.*" }, // singular RETIRE schema
  { pat: "settlements\\.settlement_disputes", canonical: "driver_finance.driver_settlement_disputes" },
  { pat: "settlements\\.team_split_configs", canonical: "driver_finance.team_settlement_splits" },
  { pat: "settlements\\.team_split_load_overrides", canonical: "driver_finance.team_settlement_splits" },
  // QBO mirror RETIRE (exact names) — accounting.* was the wrong schema for accounts/customers;
  // vendors FLIPPED 2026-07-28: accounting.qbo_vendors is CANONICAL (removed from ENFORCED).
  { pat: "accounting\\.qbo_accounts", canonical: "mdata.qbo_accounts" },
  { pat: "accounting\\.qbo_customers", canonical: "mdata.qbo_customers" },
  // Phantom/island load table (rule 14: canonical is mdata.loads)
  { pat: "dispatch\\.loads", canonical: "mdata.loads" },
];

// Rule-14 RETIRE names with live references on main TODAY — report-only until their repoint block ships.
export const KNOWN_LEGACY = [
  // bank.reconciliation_matches: 13 live refs / 7 backend files @ 9b3cbab7a
  { pat: "bank\\.\\w+", canonical: "banking.*" },
  // maint.part / pm_schedule / position_history / position_set: ~20 live refs / 5 backend files
  { pat: "maint\\.\\w+", canonical: "maintenance.*" },
  // 10 live refs / 3 backend files; NOTE governance/void-cancel-executors.ts records an explicit
  // design decision keeping the dispatch cancel domain on this table — owner ruling needed before
  // any repoint block (drift flagged in the PR that added this guard).
  { pat: "catalogs\\.load_cancellation_reasons", canonical: "catalogs.cancellation_reasons" },
  // ACCT-ECON-05: RETIRE mirror still has sync/push readers; warn until all writers use accounting.*
  { pat: "mdata\\.qbo_vendors", canonical: "accounting.qbo_vendors" },
];

const buildRe = (list) =>
  new RegExp(
    `\\b(FROM|JOIN|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:ONLY\\s+)?(${list.map((r) => r.pat).join("|")})\\b`,
    "gi"
  );
const buildProbeRe = (list) =>
  new RegExp(
    `(to_regclass|has_table_privilege)\\s*\\([^)]{0,160}?(${list.map((r) => r.pat).join("|")})`,
    "gi"
  );

function canonicalFor(list, table) {
  for (const r of list) if (new RegExp(`^${r.pat}$`, "i").test(table)) return r.canonical;
  return "the canonical table";
}

// Blank comment CONTENT (keep newlines → stable line numbers) so quoted/legacy SQL in docs never matches.
export function blankComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(fp, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(fp);
    }
  }
}

function isExempt(rel) {
  return (
    /\/__tests__\//.test(rel) ||
    /\.(test|spec)\.(ts|tsx)$/.test(rel) ||
    /\.deprecated\.ts$/.test(rel) // archived RETIRE code, void-not-delete, unmounted
  );
}

/** Returns { violations: string[], legacy: string[] }. */
export function checkRetireRefs(opts = {}) {
  const roots = opts.roots ?? SCAN_ROOTS.map((r) => path.join(ROOT, r));
  const relFrom = opts.relFrom ?? ROOT;
  const files = [];
  for (const r of roots) walk(r, files);
  const violations = [];
  const legacy = [];
  const enfSql = buildRe(ENFORCED);
  const enfProbe = buildProbeRe(ENFORCED);
  const legSql = buildRe(KNOWN_LEGACY);
  const legProbe = buildProbeRe(KNOWN_LEGACY);
  for (const fp of files) {
    const rel = path.relative(relFrom, fp).replace(/\\/g, "/");
    if (isExempt(rel)) continue;
    let raw;
    try {
      raw = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    const src = blankComments(raw);
    const collect = (re, list, out, tableGroup) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const table = m[tableGroup];
        const line = src.slice(0, m.index).split("\n").length;
        out.push(
          `${rel}:${line} — RETIRE '${table}' reference (use ${canonicalFor(list, table)}): ${m[0].replace(/\s+/g, " ").slice(0, 90)}`
        );
      }
    };
    collect(enfSql, ENFORCED, violations, 2);
    collect(enfProbe, ENFORCED, violations, 2);
    collect(legSql, KNOWN_LEGACY, legacy, 2);
    collect(legProbe, KNOWN_LEGACY, legacy, 2);
  }
  return { violations, legacy };
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retire-refs-"));
  try {
    const src = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(path.join(src, "__tests__"), { recursive: true });
    fs.writeFileSync(
      path.join(src, "clean.ts"),
      [
        "await q(`SELECT id FROM driver_finance.driver_settlements WHERE id = $1`);",
        "// comment about payroll.driver_settlements is fine",
        "/* legacy doc: SELECT * FROM settlement.settlement s JOIN mdata.drivers d ON d.id = s.driver_id */",
        "await q(`INSERT INTO accounting.qbo_vendors (id) VALUES ($1)`);",
        "await q(`SELECT count(*) FROM accounting.qbo_remote_counts`);",
      ].join("\n") + "\n"
    );
    fs.writeFileSync(path.join(src, "bad-select.ts"), "await q(`SELECT gross_cents FROM payroll.driver_settlements WHERE id = $1`);\n");
    fs.writeFileSync(path.join(src, "bad-insert.ts"), "await q(`INSERT INTO settlements.settlement_disputes (settlement_id) VALUES ($1)`);\n");
    fs.writeFileSync(path.join(src, "bad-update.ts"), "await q(`UPDATE settlements.team_split_configs SET status = $2 WHERE id = $1`);\n");
    fs.writeFileSync(path.join(src, "bad-delete.ts"), "await q(`DELETE FROM payroll.driver_settlement_line_items WHERE id = $1`);\n");
    fs.writeFileSync(path.join(src, "bad-join.ts"), "await q(`SELECT 1 FROM x JOIN settlements.team_split_load_overrides o ON o.load_id = x.id`);\n");
    fs.writeFileSync(path.join(src, "bad-wildcard.ts"), "await q(`INSERT INTO payroll.tax_withholding (id) VALUES ($1)`);\n");
    fs.writeFileSync(path.join(src, "bad-singular.ts"), "await q(`SELECT id FROM settlement.settlement_deduction`);\n");
    fs.writeFileSync(path.join(src, "bad-qbo.ts"), "await q(`UPDATE accounting.qbo_accounts SET name = $1`);\n");
    fs.writeFileSync(path.join(src, "bad-island.ts"), "await q(`SELECT id FROM dispatch.loads WHERE status = 'PENDING'`);\n");
    fs.writeFileSync(path.join(src, "bad-probe-regclass.ts"), "await q(`SELECT to_regclass('payroll.driver_settlements') IS NOT NULL AS ok`);\n");
    fs.writeFileSync(path.join(src, "bad-probe-priv.ts"), "await q(`SELECT has_table_privilege(current_user, 'settlements.settlement_disputes', 'SELECT') AS ok`);\n");
    fs.writeFileSync(path.join(src, "legacy-bank.ts"), "await q(`SELECT 1 FROM bank.reconciliation_matches rm WHERE rm.id = $1`);\n");
    fs.writeFileSync(path.join(src, "legacy-maint.ts"), "await q(`INSERT INTO maint.pm_schedule (id) VALUES ($1)`);\n");
    fs.writeFileSync(path.join(src, "legacy-cancel.ts"), "await q(`SELECT id FROM catalogs.load_cancellation_reasons`);\n");
    fs.writeFileSync(path.join(src, "legacy-mdata-vendors.ts"), "await q(`SELECT qbo_id FROM mdata.qbo_vendors WHERE id = $1`);\n");
    fs.writeFileSync(path.join(src, "old-engine.deprecated.ts"), "await q(`SELECT id FROM payroll.driver_settlements`);\n");
    fs.writeFileSync(path.join(src, "__tests__/mock.test.ts"), "if (sql.includes('FROM payroll.driver_settlements')) {}\n");

    const { violations, legacy } = checkRetireRefs({ roots: [path.join(tmp, "apps/backend/src")], relFrom: tmp });
    const hasV = (f) => violations.some((v) => v.includes(f));
    const hasL = (f) => legacy.some((v) => v.includes(f));
    const checks = [
      ["catches SELECT FROM", hasV("bad-select.ts")],
      ["catches INSERT INTO", hasV("bad-insert.ts")],
      ["catches UPDATE", hasV("bad-update.ts")],
      ["catches DELETE FROM", hasV("bad-delete.ts")],
      ["catches JOIN", hasV("bad-join.ts")],
      ["payroll.* wildcard catches non-enumerated table", hasV("bad-wildcard.ts")],
      ["settlement.* singular caught", hasV("bad-singular.ts")],
      ["accounting.qbo_accounts still ENFORCED", hasV("bad-qbo.ts")],
      ["dispatch.loads caught", hasV("bad-island.ts")],
      ["catches to_regclass probe", hasV("bad-probe-regclass.ts")],
      ["catches has_table_privilege probe", hasV("bad-probe-priv.ts")],
      ["clean file passes (comments + canonical accounting.qbo_vendors + non-RETIRE qbo tables ok)", !hasV("clean.ts") && !hasL("clean.ts")],
      ["deprecated archive exempt", !hasV("old-engine.deprecated.ts")],
      ["tests exempt", !hasV("mock.test.ts")],
      ["KNOWN_LEGACY bank.* warns, does not violate", hasL("legacy-bank.ts") && !hasV("legacy-bank.ts")],
      ["KNOWN_LEGACY maint.* warns, does not violate", hasL("legacy-maint.ts") && !hasV("legacy-maint.ts")],
      ["KNOWN_LEGACY load_cancellation_reasons warns, does not violate", hasL("legacy-cancel.ts") && !hasV("legacy-cancel.ts")],
      ["KNOWN_LEGACY mdata.qbo_vendors warns, does not violate", hasL("legacy-mdata-vendors.ts") && !hasV("legacy-mdata-vendors.ts")],
    ];
    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`[${LABEL}] SELFTEST FAIL:`);
      for (const [n] of failed) console.error("  ✗ " + n);
      console.error("violations:", violations);
      console.error("legacy:", legacy);
      process.exit(1);
    }
    console.log(`[${LABEL}] selftest PASS (${checks.length} checks)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const { violations, legacy } = checkRetireRefs();
    if (legacy.length) {
      console.warn(`[${LABEL}] WARN — ${legacy.length} KNOWN_LEGACY RETIRE reference(s) (report-only; each needs its own repoint block):`);
      for (const f of legacy) console.warn("  ⚠ " + f);
    }
    if (violations.length) {
      console.error(`[${LABEL}] FAILED — ${violations.length} live reference(s) to an ENFORCED RETIRE table:`);
      for (const f of violations) console.error("  ✗ " + f);
      console.error("The RETIRE class is closed. Point the code at the canonical table (LINKAGE-LAW rule 14 / FINAL-TABLES-WIRING §A).");
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — zero live references to the enforced RETIRE class (${legacy.length} known-legacy warning(s)).`);
  }
}
