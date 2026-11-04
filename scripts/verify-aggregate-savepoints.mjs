#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = [
  "apps/backend/src/mdata",
  "apps/backend/src/maintenance",
  "apps/backend/src/accounting",
  "apps/backend/src/banking",
  "apps/backend/src/telematics",
  "apps/backend/src/driver-finance",
].map((p) => path.join(ROOT, p));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

// A `.catch()` that ONLY rethrows (converts the error type/message and immediately throws again)
// never continues querying the same client — the exception propagates straight out of the
// function, and whatever wraps the transaction (withCurrentUser) rolls the whole thing back. The
// poisoned-transaction risk this guard exists to catch is a catch body that SWALLOWS the error
// (logs it, returns a fallback, or otherwise lets execution fall through to another `.query()` on
// the now-aborted transaction) without a savepoint to recover to. Live-caught in
// owned-asset-disposal.service.ts:185 — its .catch() body is exactly one `throw new
// OwnedAssetDisposalError(...)` statement wrapping ensureOpenPeriod()'s error, nothing else; it
// cannot run another query afterward. Narrowly excluding pure-rethrow bodies (no further
// `.query(`/`await` inside them) leaves every real swallow-and-continue pattern still flagged.
function catchBodyIsPureRethrow(lines, catchLineIndex) {
  const CLOSE_RE = /^\s*}\s*\)\s*;?\s*$/;
  const bodyLines = [];
  for (let j = catchLineIndex + 1; j < Math.min(lines.length, catchLineIndex + 20); j++) {
    if (CLOSE_RE.test(lines[j])) {
      const body = bodyLines.join("\n").trim();
      return /^throw\b[\s\S]*;$/.test(body) && !/\.query\s*\(|await\b/.test(body);
    }
    bodyLines.push(lines[j]);
  }
  return false;
}

// A `.catch()` chained directly onto connection teardown — `client.release()`, `pool.end()`,
// `db.end()` — is never a statement inside the transaction: it runs after the work is over and
// cannot leave an aborted transaction behind for a later `.query()`. The 8-line look-back window
// below used to flag it whenever a `ROLLBACK` query sat on the line above (live false positive:
// ar-readers-payment-less-application.db.test.ts:82 `await db.end().catch(() => {})`, red on main
// d0d20344ae). Only teardown on its OWN line is excluded; a `.query(...).catch(` is still flagged.
const TEARDOWN_CATCH_RE = /\.(?:end|release)\s*\(\s*\)\s*\.catch\s*\(/;

/** Pure scan over { rel -> source } so --selftest can plant defects without touching the tree. */
export function scanSources(sources) {
  const offenders = [];
  for (const [rel, src] of sources) {
    if (!src.includes("withCurrentUser")) continue;
    if (!/\.query\s*\([\s\S]{0,800}?\)\s*\.catch\s*\(/.test(src)) continue;
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(".catch(")) continue;
      if (/ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT/.test(line)) continue;
      if (TEARDOWN_CATCH_RE.test(line)) continue;
      if (catchBodyIsPureRethrow(lines, i)) continue;
      const window = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
      if (/\.query\s*\(/.test(window) && !/withSavepoint\s*\(/.test(window)) {
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    }
  }
  return offenders;
}

if (process.argv.includes("--selftest")) {
  const HDR = 'import { withCurrentUser } from "../db";\n';
  const cases = [
    { name: "swallowed query catch", expect: 1,
      src: HDR + "await client.query(`UPDATE x SET y = 1`).catch(() => {});\nawait client.query(`SELECT 1`);\n" },
    { name: "multi-line query swallowed", expect: 1,
      src: HDR + "await client\n  .query(\n    `INSERT INTO t VALUES (1)`\n  )\n  .catch((e) => log(e));\n" },
    { name: "teardown after ROLLBACK (the d0d20344ae false positive)", expect: 0,
      src: HDR + 'await db.query("ROLLBACK").catch(() => {});\nawait db.end().catch(() => {});\n' },
    { name: "client.release teardown", expect: 0,
      src: HDR + "await client.query(`SELECT 1`);\nclient.release().catch(() => {});\n" },
    { name: "inside withSavepoint", expect: 0,
      src: HDR + "await withSavepoint(client, () => client.query(`SELECT 1`).catch(() => null));\n" },
    { name: "pure rethrow", expect: 0,
      src: HDR + "await client.query(`SELECT 1`).catch((e) => {\n  throw new Error(String(e));\n});\n" },
  ];
  const bad = [];
  for (const c of cases) {
    const got = scanSources([[`selftest/${c.name}.ts`, c.src]]).length;
    if (got !== c.expect) bad.push(`${c.name}: expected ${c.expect} offender(s), got ${got}`);
  }
  // The real false-positive file must stay clean (read from the tree, not a literal).
  const real = "apps/backend/src/accounting/__tests__/ar-readers-payment-less-application.db.test.ts";
  if (fs.existsSync(path.join(ROOT, real))) {
    const got = scanSources([[real, fs.readFileSync(path.join(ROOT, real), "utf8")]]);
    if (got.length) bad.push(`real file ${real} flagged: ${got.join(" | ")}`);
  }
  const planted = cases.filter((c) => c.expect > 0).length;
  if (bad.length) {
    console.error(`verify:aggregate-savepoints SELFTEST FAILED:\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`verify:aggregate-savepoints SELFTEST PASS — ${planted}/${planted} planted swallow defects caught; ${cases.length - planted} safe shapes not flagged`);
  process.exit(0);
}

const files = SCAN_ROOTS.flatMap((dir) => walk(dir));
const offenders = scanSources(files.map((f) => [path.relative(ROOT, f), fs.readFileSync(f, "utf8")]));

if (offenders.length > 0) {
  console.error("verify:aggregate-savepoints FAIL — client.query().catch() inside withCurrentUser files without withSavepoint:");
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}

console.log("verify:aggregate-savepoints PASS");
