#!/usr/bin/env node
// verify-no-settlements-team-split-refs.mjs (P2b/P2f — team-splits convergence, owner ruling
// DECISION 2 Option A, 2026-07-21)
//
// Team-split config/override truth converged on canonical System A: mdata.driver_teams
// (+ additive per-load override columns on mdata.loads, migration 202607660000). The RETIRE
// settlements-namespace config tables (settlements.team_split_configs and
// settlements.team_split_load_overrides) must reach ZERO live readers AND writers. The plural
// /api/v1/team-splits/* endpoints stay (never-delete law) as a facade over mdata.driver_teams.
//
// FAILS if any live (non-test, non-.deprecated) source under apps/ contains SQL (SELECT FROM /
// JOIN / INSERT INTO / UPDATE / DELETE FROM) against either RETIRE table, or reintroduces a
// schema-availability probe (to_regclass / has_table_privilege) against them. Comments that
// merely mention the table names are fine; queries and probes are not.
//
// --selftest proves both directions on fixtures.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-settlements-team-split-refs";
const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];

const TABLES = "team_split_(?:configs|load_overrides)";
// Any live SQL against the RETIRE tables — reads AND writes (the ruling retires both directions).
const SQL_RE = new RegExp(
  String.raw`\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+settlements\.${TABLES}\b`,
  "gi"
);
// Availability probe pattern (the prefer-RETIRE-table fallback shape).
const PROBE_RE = new RegExp(
  String.raw`(?:has_table_privilege|to_regclass)\s*\([^)]{0,120}settlements\.${TABLES}`,
  "gi"
);

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
  const roots = opts.roots ?? SCAN_ROOTS.map((r) => path.join(ROOT, r));
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
        findings.push(`${rel}:${line} — RETIRE settlements team-split table reference: ${m[0].slice(0, 80)}`);
      }
    }
  }
  return findings;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "team-split-refs-"));
  try {
    const src = path.join(tmp, "apps/backend/src");
    fs.mkdirSync(path.join(src, "__tests__"), { recursive: true });
    fs.writeFileSync(
      path.join(src, "clean.ts"),
      "await q(`SELECT split_method FROM mdata.driver_teams WHERE is_active = true`);\n" +
        "// comment mentioning settlements.team_split_configs is fine\n"
    );
    fs.writeFileSync(
      path.join(src, "bad-reader.ts"),
      "await q(`SELECT primary_ratio FROM settlements.team_split_configs WHERE status = 'active'`);\n"
    );
    fs.writeFileSync(
      path.join(src, "bad-writer.ts"),
      "await q(`INSERT INTO settlements.team_split_load_overrides (load_id) VALUES ($1)`);\n"
    );
    fs.writeFileSync(
      path.join(src, "bad-probe.ts"),
      "await q(`SELECT to_regclass('settlements.team_split_configs') IS NOT NULL AS ok`);\n"
    );
    fs.writeFileSync(
      path.join(src, "old-engine.deprecated.ts"),
      "await q(`SELECT id FROM settlements.team_split_configs`);\n"
    );
    fs.writeFileSync(
      path.join(src, "__tests__/mock.test.ts"),
      "if (sql.includes('FROM settlements.team_split_configs')) {}\n"
    );
    fs.writeFileSync(
      path.join(src, "fixture.test.ts"),
      "await q(`UPDATE settlements.team_split_configs SET status = 'ended'`);\n"
    );

    const findings = scan({ roots: [path.join(tmp, "apps/backend/src")], relFrom: tmp });
    const checks = [
      ["catches live reader", findings.some((f) => f.includes("bad-reader.ts"))],
      ["catches live writer", findings.some((f) => f.includes("bad-writer.ts"))],
      ["catches availability probe", findings.some((f) => f.includes("bad-probe.ts"))],
      ["clean file passes (comments ok)", !findings.some((f) => f.includes("clean.ts"))],
      ["deprecated archive exempt", !findings.some((f) => f.includes("old-engine.deprecated.ts"))],
      ["__tests__ exempt", !findings.some((f) => f.includes("mock.test.ts"))],
      ["*.test.ts exempt", !findings.some((f) => f.includes("fixture.test.ts"))],
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
      console.error(`[${LABEL}] FAILED — ${findings.length} live reference(s) to RETIRE settlements team-split tables:`);
      for (const f of findings) console.error("  ✗ " + f);
      console.error(
        "Converge on mdata.driver_teams (+ mdata.loads team_split_override_* columns) per owner ruling DECISION 2 (2026-07-21)."
      );
      process.exit(1);
    }
    console.log(`[${LABEL}] OK — zero live references to RETIRE settlements team-split config/override tables.`);
  }
}
