#!/usr/bin/env node
/**
 * ACCT-ECON-05 — lock G4 canonical-write RETIRE map direction for QBO vendors.
 *
 * Root cause: verify-canonical-table-writes treated mdata.qbo_vendors as RETIRE and
 * accounting.qbo_vendors as canonical — inverted vs Rule 14 / Desktop ACCT-ECON-05. That made
 * correct writes to accounting look like violations and left RETIRE sync writers unguarded
 * as "canonical".
 *
 * Asserts the RETIRE array in scripts/verify-canonical-table-writes.mjs:
 *   - accounting.qbo_vendors is RETIRE → mdata.qbo_vendors
 *   - mdata.qbo_vendors is NOT listed as RETIRE
 * Plus selftest planted shapes in that guard (11 checks).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = "scripts/verify-canonical-table-writes.mjs";
const LABEL = "verify-acct-econ-05-canonical-qbo-vendors-map";

export function assertMapDirection(src) {
  const problems = [];
  if (!/pat:\s*"accounting\\\\\.qbo_vendors"\s*,\s*canonical:\s*"mdata\.qbo_vendors"/.test(src)) {
    problems.push(`${GUARD} must list RETIRE accounting.qbo_vendors → canonical mdata.qbo_vendors`);
  }
  if (/pat:\s*"mdata\\\\\.qbo_vendors"\s*,\s*canonical:\s*"accounting\.qbo_vendors"/.test(src)) {
    problems.push(`${GUARD} must NOT list inverted RETIRE mdata.qbo_vendors → accounting.qbo_vendors`);
  }
  return problems;
}

function main() {
  const src = fs.readFileSync(path.join(ROOT, GUARD), "utf8");
  const problems = assertMapDirection(src);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  ✗", p);
    process.exit(1);
  }

  const st = spawnSync(process.execPath, [path.join(ROOT, GUARD), "--selftest"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (st.status !== 0) {
    console.error(`${LABEL} FAIL — ${GUARD} --selftest exited ${st.status}`);
    console.error(st.stdout || "");
    console.error(st.stderr || "");
    process.exit(1);
  }

  const live = spawnSync(process.execPath, [path.join(ROOT, GUARD)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (live.status !== 0) {
    console.error(`${LABEL} FAIL — ${GUARD} live exited ${live.status}`);
    console.error(live.stdout || "");
    console.error(live.stderr || "");
    process.exit(1);
  }

  console.log(
    `${LABEL} OK — RETIRE map: accounting.qbo_vendors → mdata.qbo_vendors; canonical-write selftest+live PASS`
  );
}

if (process.argv.includes("--selftest")) {
  const good = `  { pat: "accounting\\\\.qbo_vendors", canonical: "mdata.qbo_vendors" },`;
  const bad = `  { pat: "mdata\\\\.qbo_vendors", canonical: "accounting.qbo_vendors" },`;
  const g = assertMapDirection(good);
  const b = assertMapDirection(bad + "\n" + good);
  if (g.length !== 0 || b.length < 1) {
    console.error(`${LABEL} --selftest FAIL`, { g, b });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
