#!/usr/bin/env node
/**
 * SETTLE-PDF-500 (Lead, 2026-09-30) — a DB read inside a transaction must never be wrapped in a
 * catch that neither logs, rethrows, replies, nor rolls back to a SAVEPOINT.
 *
 * ROOT CAUSE this guard exists for: settlement-render.routes.ts ran an OPTIONAL driver-bills read
 * inside the withCompanyScope transaction under `catch { billRowsCache = null }`. When that query
 * failed, the error was discarded but the TRANSACTION STAYED POISONED, so the next statement —
 * appendCrudAudit, ~90 lines later — died with 25P02 "current transaction is aborted". Every driver
 * settlement PDF 500'd, and production reported the audit write, not the query that actually failed.
 * Measured live 2026-09-30T10:37:55Z on srv-d7rpem7avr4c73fhp4n0.
 *
 * Postgres gives exactly one correct shape for an optional read inside a transaction:
 *   SAVEPOINT x  ->  try { ...; RELEASE SAVEPOINT x } catch { ROLLBACK TO SAVEPOINT x; log }
 * Rolling back to the savepoint clears the aborted state so the fallback can actually be taken.
 *
 * SHRINK-ONLY: this is a systemic class (222 sites when first measured), not a one-off. The
 * baseline locks today's count; it may only go DOWN. Adding a new swallow fails the build.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-no-swallowed-db-error-in-transaction";
const BASELINE = join(ROOT, "scripts/verify-no-swallowed-db-error-in-transaction.baseline.json");

const TRY_CATCH = /try\s*\{([\s\S]*?)\}\s*catch\s*(?:\(\s*\w*\s*(?::\s*\w+)?\s*\))?\s*\{([\s\S]*?)\}/g;
const TOUCHES_DB = /client\.query|\(\s*client\s*,|\(client as never/;
/** Any ONE of these makes the catch honest: it recovers the transaction, or it surfaces the error. */
const HANDLED = /\blog\b|logger|console\.|throw\b|reply\./;

// ROUND 381.5 (Lead, 2026-10-03) — the handler capture must BALANCE BRACES.
// TRY_CATCH is non-greedy, so `catch (e) { ... { nested } ... }` captured only up to the FIRST closing
// brace. Any handler containing a nested block — an arrow callback, an if, a nested try — had its tail
// truncated, and a `console.error`, `throw` or `req.log.error` living past that point was invisible.
// Measured: that read as 10 NEW swallows across 13 files, 222 -> 232, when the handlers were honest.
// CC-1 reported this guard as misreading correct code and was right about the pattern. Fixing the regex
// rather than the baseline: no entry is added, nothing is widened, and a genuinely bare catch still fails.
function handlerFrom(source, catchBraceIndex) {
  let depth = 0;
  for (let i = catchBraceIndex; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(catchBraceIndex + 1, i);
    }
  }
  return source.slice(catchBraceIndex + 1);
}

export function offendingSites(source) {
  const out = [];
  for (const m of source.matchAll(TRY_CATCH)) {
    const body = m[1];
    // Re-read the handler from the real opening brace so nested blocks are included.
    const handlerOpen = source.indexOf("{", m.index + m[0].indexOf("catch"));
    const handler = handlerOpen === -1 ? m[2] : handlerFrom(source, handlerOpen);
    if (body.length > 4000) continue; // a whole route body, not an isolated read
    if (!TOUCHES_DB.test(body)) continue;
    if (body.includes("SAVEPOINT") || handler.includes("SAVEPOINT")) continue;
    if (HANDLED.test(handler)) continue;
    out.push(source.slice(0, m.index).split("\n").length);
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__") walk(abs, acc);
    } else if (abs.endsWith(".ts") && !abs.endsWith(".test.ts")) acc.push(abs);
  }
  return acc;
}

function measure() {
  const byFile = {};
  let total = 0;
  for (const abs of walk(join(ROOT, "apps/backend/src"))) {
    const lines = offendingSites(readFileSync(abs, "utf8"));
    if (lines.length) {
      byFile[abs.slice(ROOT.length)] = lines.length;
      total += lines.length;
    }
  }
  return { total, files: Object.keys(byFile).length, byFile };
}

if (process.argv[2] === "--selftest") {
  const cases = [
    ["const a = async () => { try { await client.query('x'); } catch { v = null; } }", 1],
    ["const a = async () => { try { await client.query('x'); } catch (err) { req.log.error(err); } }", 0],
    ["const a = async () => { try { await client.query('x'); } catch { throw new Error('x'); } }", 0],
    ["const a = async () => { await client.query('SAVEPOINT s'); try { await client.query('x'); } catch { await client.query('ROLLBACK TO SAVEPOINT s'); } }", 0],
    ["const a = async () => { try { notADbCall(); } catch { v = null; } }", 0],
    ["const a = async () => { try { await listThings(client, {}); } catch { v = null; } }", 1],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const got = offendingSites(src).length;
    if (got !== want) {
      console.error(`${LABEL} SELFTEST FAIL: want ${want} got ${got} for: ${src}`);
      bad += 1;
    }
  }
  console.log(`${LABEL} selftest ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

const now = measure();
if (process.argv[2] === "--write-baseline") {
  writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
  console.log(`${LABEL} baseline written: ${now.total} sites in ${now.files} files`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
if (now.total > baseline.total) {
  const grew = Object.entries(now.byFile)
    .filter(([f, n]) => n > (baseline.byFile[f] ?? 0))
    .map(([f, n]) => `${f}: ${baseline.byFile[f] ?? 0} -> ${n}`);
  console.error(
    `${LABEL} FAIL: swallowed DB errors grew ${baseline.total} -> ${now.total}. ` +
      `An optional read inside a transaction needs its own SAVEPOINT and must log its error — a bare ` +
      `catch leaves the transaction poisoned and the next statement dies with an opaque 25P02.\n  ${grew.join("\n  ")}`
  );
  process.exit(1);
}
console.log(
  `${LABEL} OK — ${now.total} site(s), baseline ${baseline.total}${now.total < baseline.total ? " (shrank — run --write-baseline)" : ""}`
);
