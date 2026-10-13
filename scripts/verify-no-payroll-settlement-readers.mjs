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
// RULE 2 (ACCT-F4431379, Lead 443.137 9d — added; old: rule 1 only; why: driver pay comes ONLY from
// driver_finance): FAILS if any live source reads, probes, or writes a QBO payroll mirror
// (`*.qbo_payroll_links` — integrations.* is the migrated mirror, accounting.* never existed).
// payroll/aggregated.routes.ts and payroll-integration/aggregate.routes.ts added QBO W-2 runs into
// the labor totals; QBO is out of scope for USMCA and there is no explicit payroll reconciliation
// screen, so there is no legitimate live reader. A future reconciliation screen must be ruled by the
// owner and carved out here by name, never by loosening the pattern.
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

// Rule 2: any SQL touch of a QBO payroll mirror (read, join, update, insert, availability probe).
const QBO_PAYROLL_RE =
  /\b(?:FROM|JOIN|UPDATE|INTO)\s+[a-z_]+\.qbo_payroll_links\b|(?:has_table_privilege|to_regclass)\s*\([^)]{0,120}qbo_payroll_links/gi;

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
    for (const [re, what] of [
      [READ_RE, "RETIRE payroll settlement ledger read"],
      [PROBE_RE, "RETIRE payroll settlement ledger read"],
      [QBO_PAYROLL_RE, "QBO payroll mirror read (driver pay comes ONLY from driver_finance)"],
    ]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        findings.push(`${rel}:${line} — ${what}: ${m[0].slice(0, 80)}`);
      }
    }
  }
  return findings;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "payroll-readers-"));
  try {
    const tmpSrc = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(path.join(tmpSrc, "__tests__"), { recursive: true });
    fs.writeFileSync(path.join(tmpSrc, "clean.ts"), "await q(`SELECT gross_pay FROM driver_finance.driver_settlements`);\n// comment about payroll.driver_settlements is fine\n");
    fs.writeFileSync(path.join(tmpSrc, "bad-reader.ts"), "await q(`SELECT gross_cents FROM payroll.driver_settlements WHERE id = $1`);\n");
    fs.writeFileSync(path.join(tmpSrc, "bad-probe.ts"), "await q(`SELECT has_table_privilege(current_user, 'payroll.driver_settlements', 'SELECT') AS ok`);\n");
    fs.writeFileSync(path.join(tmpSrc, "old-engine.deprecated.ts"), "await q(`SELECT id FROM payroll.driver_settlements`);\n");
    fs.writeFileSync(path.join(tmpSrc, "__tests__/mock.test.ts"), "if (sql.includes('FROM payroll.driver_settlements')) {}\n");
    // Rule 2 plants (ACCT-F4431379)
    fs.writeFileSync(path.join(tmpSrc, "qbo-w2-read.ts"), "await q(`SELECT gross_cents FROM integrations.qbo_payroll_links WHERE operating_company_id = $1`);\n");
    fs.writeFileSync(path.join(tmpSrc, "qbo-phantom-read.ts"), "await q(`SELECT 1\n    FROM accounting.qbo_payroll_links qpl`);\n");
    fs.writeFileSync(path.join(tmpSrc, "qbo-probe.ts"), "if (await relationExists(client, 'x')) {}\nawait q(`SELECT to_regclass('integrations.qbo_payroll_links') IS NOT NULL AS ok`);\n");
    fs.writeFileSync(path.join(tmpSrc, "qbo-sync-write.ts"), "await q(`UPDATE integrations.qbo_payroll_links SET sync_state = 'polled'`);\n");
    fs.writeFileSync(path.join(tmpSrc, "qbo-comment-only.ts"), "// used to read integrations.qbo_payroll_links; removed (ACCT-F4431379)\nawait q(`SELECT ROUND(gross_pay * 100) FROM driver_finance.driver_settlements`);\n");
    fs.writeFileSync(path.join(tmpSrc, "__tests__/qbo-mock.test.ts"), "if (sql.includes('FROM integrations.qbo_payroll_links')) {}\n");

    const findings = scan({ roots: [path.join(tmp, "apps/backend/src")], relFrom: tmp });
    const checks = [
      ["catches live reader", findings.some((f) => f.includes("bad-reader.ts"))],
      ["catches availability probe", findings.some((f) => f.includes("bad-probe.ts"))],
      ["clean file passes (comments ok)", !findings.some((f) => f.includes("clean.ts"))],
      ["deprecated archive exempt", !findings.some((f) => f.includes("old-engine.deprecated.ts"))],
      ["tests exempt", !findings.some((f) => f.includes("mock.test.ts"))],
      ["rule 2: catches QBO W-2 mirror read", findings.some((f) => f.includes("qbo-w2-read.ts"))],
      ["rule 2: catches phantom accounting.* QBO payroll read (multi-line)", findings.some((f) => f.includes("qbo-phantom-read.ts"))],
      ["rule 2: catches to_regclass probe of the QBO mirror", findings.some((f) => f.includes("qbo-probe.ts"))],
      ["rule 2: catches QBO mirror sync-state write", findings.some((f) => f.includes("qbo-sync-write.ts"))],
      ["rule 2: comment-only mention passes", !findings.some((f) => f.includes("qbo-comment-only.ts"))],
      ["rule 2: tests exempt", !findings.some((f) => f.includes("qbo-mock.test.ts"))],
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
      console.error(`[${LABEL}] FAILED — ${findings.length} live reader(s) of the RETIRE payroll settlement ledger or a QBO payroll mirror:`);
      for (const f of findings) console.error("  ✗ " + f);
      console.error("Repoint reads onto driver_finance.driver_settlements / settlement_lines (dollars → cents via ROUND(x*100)). QBO payroll is never a source of driver pay.");
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — zero live readers of payroll.driver_settlements / driver_settlement_line_items / *.qbo_payroll_links.`);
  }
}
