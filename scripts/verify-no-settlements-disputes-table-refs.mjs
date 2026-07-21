#!/usr/bin/env node
// verify-no-settlements-disputes-table-refs.mjs (P2e — settlement engine collapse)
//
// P2e converged the CLOSURE-5 plural dispute routes (settlements/disputes/disputes.routes.ts) onto
// the canonical driver_finance.driver_settlement_disputes table. The RETIRE table
// settlements.settlement_disputes must have ZERO live readers or writers afterward: the plural API
// endpoints stay (never-delete law) but their storage is canonical.
//
// FAILS if any live (non-test, non-.deprecated, non-migration) source under apps/ references
// settlements.settlement_disputes in a SQL verb position (FROM / JOIN / INSERT INTO / UPDATE /
// DELETE FROM) or probes its availability (has_table_privilege / to_regclass). Comments are fine;
// queries are not.
//
// --selftest proves both directions on fixtures.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-settlements-disputes-table-refs";
const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];

// Any SQL-verb reference to the RETIRE plural dispute table (reads AND writes).
const SQL_RE =
  /\b(FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+settlements\.settlement_disputes\b/gi;
// Availability probe pattern against the RETIRE table.
const PROBE_RE =
  /(has_table_privilege|to_regclass)\s*\([^)]{0,120}settlements\.settlement_disputes/gi;

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
    for (const re of [SQL_RE, PROBE_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        findings.push(`${rel}:${line} — RETIRE settlements.settlement_disputes reference: ${m[0].slice(0, 80)}`);
      }
    }
  }
  return findings;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "disputes-refs-"));
  try {
    const src = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(path.join(src, "__tests__"), { recursive: true });
    fs.writeFileSync(
      path.join(src, "clean.ts"),
      "await q(`SELECT id FROM driver_finance.driver_settlement_disputes WHERE id = $1`);\n// comment about settlements.settlement_disputes is fine\n"
    );
    fs.writeFileSync(
      path.join(src, "bad-reader.ts"),
      "await q(`SELECT d.* FROM settlements.settlement_disputes d WHERE d.id = $1`);\n"
    );
    fs.writeFileSync(
      path.join(src, "bad-writer.ts"),
      "await q(`INSERT INTO settlements.settlement_disputes (settlement_id) VALUES ($1)`);\n"
    );
    fs.writeFileSync(
      path.join(src, "bad-update.ts"),
      "await q(`UPDATE settlements.settlement_disputes SET status = $2 WHERE id = $1`);\n"
    );
    fs.writeFileSync(
      path.join(src, "bad-probe.ts"),
      "await q(`SELECT to_regclass('settlements.settlement_disputes') IS NOT NULL AS ok`);\n"
    );
    fs.writeFileSync(
      path.join(src, "old-routes.deprecated.ts"),
      "await q(`SELECT id FROM settlements.settlement_disputes`);\n"
    );
    fs.writeFileSync(
      path.join(src, "__tests__/mock.test.ts"),
      "if (sql.includes('FROM settlements.settlement_disputes')) {}\n"
    );

    const findings = scan({ roots: [path.join(tmp, "apps/backend/src")], relFrom: tmp });
    const checks = [
      ["catches live reader", findings.some((f) => f.includes("bad-reader.ts"))],
      ["catches live insert", findings.some((f) => f.includes("bad-writer.ts"))],
      ["catches live update", findings.some((f) => f.includes("bad-update.ts"))],
      ["catches availability probe", findings.some((f) => f.includes("bad-probe.ts"))],
      ["clean file passes (comments ok)", !findings.some((f) => f.includes("clean.ts"))],
      ["deprecated archive exempt", !findings.some((f) => f.includes("old-routes.deprecated.ts"))],
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
      console.error(`[${LABEL}] FAILED — ${findings.length} live reference(s) to the RETIRE settlements.settlement_disputes table:`);
      for (const f of findings) console.error("  ✗ " + f);
      console.error("Converge onto driver_finance.driver_settlement_disputes (plural API contract stays; storage is canonical).");
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — zero live references to settlements.settlement_disputes.`);
  }
}
