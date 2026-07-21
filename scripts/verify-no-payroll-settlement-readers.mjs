#!/usr/bin/env node
// verify-no-payroll-settlement-readers.mjs (P2c — settlement engine collapse)
//
// The work order's definition of done includes "zero readers left on a RETIRE table". The WRITE side
// is guarded (G4 + verify-no-payroll-settlement-writes); this closes the READ side for the RETIRE
// payroll settlement ledger. P2c repointed the last four live readers (settlement-pdf-renderer
// prefer-payroll fallback, mdata driver-aggregate YTD/lifetime/weeks, payroll aggregated list,
// settlement-shadow header scan) onto canonical driver_finance.driver_settlements.
//
// FAILS if any live (non-test, non-.deprecated) source under apps/ SELECTs FROM
// payroll.driver_settlements / payroll.driver_settlement_line_items, or reintroduces a
// schema-availability probe against them (the prefer-payroll pattern). Comments are fine;
// queries are not.
//
// --selftest proves both directions on fixtures.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-payroll-settlement-readers";
const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];

// FROM payroll.<settlement table> inside any string/template — reads only (writes have their own guard).
const READ_RE = /\bFROM\s+payroll\.(driver_settlements|driver_settlement_line_items)\b/gi;
// The prefer-payroll availability probe pattern (has_table_privilege / to_regclass against the ledger).
const PROBE_RE =
  /(has_table_privilege|to_regclass)\s*\([^)]{0,120}payroll\.(driver_settlements|driver_settlement_line_items)/gi;

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
    /\.deprecated\.ts$/.test(rel) // archived RETIRE engine, void-not-delete, unmounted
  );
}

export function scan(opts = {}) {
  const roots = (opts.roots ?? SCAN_ROOTS.map((r) => path.join(ROOT, r)));
  const relFrom = opts.relFrom ?? ROOT;
  const files = [];
  for (const r of roots) walk(r, files);
  const findings = [];
  for (const fp of files) {
    const rel = path.relative(relFrom, fp).replace(/\\/g, "/");
    if (isExempt(rel)) continue;
    let src;
    try {
      src = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    for (const re of [READ_RE, PROBE_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        findings.push(`${rel}:${line} — RETIRE payroll settlement ledger read: ${m[0].slice(0, 80)}`);
      }
    }
  }
  return findings;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "payroll-readers-"));
  try {
    const src = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(path.join(src, "__tests__"), { recursive: true });
    fs.writeFileSync(path.join(src, "clean.ts"), "await q(`SELECT gross_pay FROM driver_finance.driver_settlements`);\n// comment about payroll.driver_settlements is fine\n");
    fs.writeFileSync(path.join(src, "bad-reader.ts"), "await q(`SELECT gross_cents FROM payroll.driver_settlements WHERE id = $1`);\n");
    fs.writeFileSync(path.join(src, "bad-probe.ts"), "await q(`SELECT has_table_privilege(current_user, 'payroll.driver_settlements', 'SELECT') AS ok`);\n");
    fs.writeFileSync(path.join(src, "old-engine.deprecated.ts"), "await q(`SELECT id FROM payroll.driver_settlements`);\n");
    fs.writeFileSync(path.join(src, "__tests__/mock.test.ts"), "if (sql.includes('FROM payroll.driver_settlements')) {}\n");

    const findings = scan({ roots: [path.join(tmp, "apps/backend/src")], relFrom: tmp });
    const checks = [
      ["catches live reader", findings.some((f) => f.includes("bad-reader.ts"))],
      ["catches availability probe", findings.some((f) => f.includes("bad-probe.ts"))],
      ["clean file passes (comments ok)", !findings.some((f) => f.includes("clean.ts"))],
      ["deprecated archive exempt", !findings.some((f) => f.includes("old-engine.deprecated.ts"))],
      ["tests exempt", !findings.some((f) => f.includes("mock.test.ts"))],
    ];
    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length) {
      console.error(`[${LABEL}] SELFTEST FAIL:`);
      for (const [n] of failed) console.error("  ✗ " + n);
      console.error("findings:", findings);
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
    const findings = scan();
    if (findings.length) {
      console.error(`[${LABEL}] FAILED — ${findings.length} live reader(s) of the RETIRE payroll settlement ledger:`);
      for (const f of findings) console.error("  ✗ " + f);
      console.error("Repoint reads onto driver_finance.driver_settlements / settlement_lines (dollars → cents via ROUND(x*100)).");
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — zero live readers of payroll.driver_settlements / driver_settlement_line_items.`);
  }
}
