#!/usr/bin/env node
/**
 * verify-single-dispute-subledger.mjs (SET-03)
 *
 * FAIL if any live (non-test / non-migration) source under apps/ writes or probes
 * the stranded parallel ledger driver_finance.settlement_disputes.
 * Canonical = driver_finance.driver_settlement_disputes.
 *
 * --selftest proves RED on a planted writer and GREEN on a clean tree.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-single-dispute-subledger";
const SCAN_ROOTS = ["apps/backend/src", "apps/frontend/src"];

const WRITE_RE =
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+driver_finance\.settlement_disputes\b/gi;
const FROM_RE = /\b(FROM|JOIN)\s+driver_finance\.settlement_disputes\b/gi;
const PROBE_RE =
  /(has_table_privilege|to_regclass)\s*\([^)]{0,120}driver_finance\.settlement_disputes/gi;

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
    /\.deprecated\.ts$/.test(rel)
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
    for (const re of [WRITE_RE, FROM_RE, PROBE_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        findings.push(
          `${rel}:${line} — stranded driver_finance.settlement_disputes reference: ${m[0].slice(0, 100)}`
        );
      }
    }
  }
  return findings;
}

function assertClean(findings) {
  if (findings.length) {
    console.error(`[${LABEL}] FAIL — ${findings.length} stranded-ledger reference(s):`);
    for (const f of findings) console.error(`  ${f}`);
    process.exit(1);
  }
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "set03-dispute-"));
  const bad = path.join(tmp, "bad.ts");
  const good = path.join(tmp, "good.ts");
  fs.writeFileSync(
    bad,
    `await client.query(\`INSERT INTO driver_finance.settlement_disputes (id) VALUES ($1)\`, [id]);\n`
  );
  fs.writeFileSync(
    good,
    `await client.query(\`INSERT INTO driver_finance.driver_settlement_disputes (id) VALUES ($1)\`, [id]);\n`
  );
  const planted = scan({ roots: [tmp], relFrom: tmp });
  if (!planted.some((f) => f.includes("settlement_disputes"))) {
    console.error(`[${LABEL}] SELFTEST FAIL — planted writer not detected`);
    process.exit(1);
  }
  const clean = scan({ roots: [path.dirname(good)], relFrom: tmp }).filter((f) =>
    f.includes("good.ts")
  );
  // scan walks dir — only good.ts in a subdir: re-scan just good parent with only good file
  const onlyGoodDir = path.join(tmp, "ok");
  fs.mkdirSync(onlyGoodDir);
  fs.writeFileSync(path.join(onlyGoodDir, "good.ts"), fs.readFileSync(good));
  const green = scan({ roots: [onlyGoodDir], relFrom: onlyGoodDir });
  if (green.length) {
    console.error(`[${LABEL}] SELFTEST FAIL — canonical writer flagged:`, green);
    process.exit(1);
  }
  console.log(`[${LABEL}] SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const findings = scan();
  assertClean(findings);
  console.log(
    `[${LABEL}] OK — no live writers/readers of stranded driver_finance.settlement_disputes`
  );
}

main();
