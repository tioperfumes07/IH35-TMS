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

// LST sweepA (2026-11-10) — the class is a read INSIDE a transaction whose error is discarded, so the NEXT statement on
// that same transaction dies with 25P02. A try whose every DB touch is inside the callback of a transaction OPENER
// (withLuciaBypass / withCompanyScope / withCurrentUser / a `scope` runner) is the opposite shape: the opener rolls its own
// transaction back and releases the connection before the error reaches the catch, so nothing is left poisoned. Measured:
// #28444 fuel-follows-truck-sweep, #28695 alwaystrack-load-history-import and #28722 relay-fuel-ingest.cron each catch
// around one whole per-item transaction and record the failure (summary.failures / a refused row / the failures[] the
// cron throws). Only those callbacks are cut out of the body; any client.query left outside them is still measured.
const TX_OPENER = /\b(?:withLuciaBypass|withCompanyScope|withCurrentUser|scope)\s*\(\s*(?:async\s*)?\(\s*client\b/g;
function stripOpenerCallbacks(body) {
  let out = "";
  let last = 0;
  for (const m of body.matchAll(TX_OPENER)) {
    if (m.index < last) continue;
    const open = body.indexOf("(", m.index);
    let depth = 0;
    let end = body.length;
    for (let i = open; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")" && --depth === 0) { end = i + 1; break; }
    }
    out += body.slice(last, m.index);
    last = end;
  }
  return out + body.slice(last);
}

export function offendingSites(source) {
  const out = [];
  for (const m of source.matchAll(TRY_CATCH)) {
    const body = m[1];
    // Re-read the handler from the real opening brace so nested blocks are included.
    const handlerOpen = source.indexOf("{", m.index + m[0].indexOf("catch"));
    const handler = handlerOpen === -1 ? m[2] : handlerFrom(source, handlerOpen);
    if (body.length > 4000) continue; // a whole route body, not an isolated read
    if (!TOUCHES_DB.test(stripOpenerCallbacks(body))) continue;
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

if (process.argv.includes("--selftest")) {
  const cases = [
    ["const a = async () => { try { await client.query('x'); } catch { v = null; } }", 1],
    ["const a = async () => { try { await client.query('x'); } catch (err) { req.log.error(err); } }", 0],
    ["const a = async () => { try { await client.query('x'); } catch { throw new Error('x'); } }", 0],
    ["const a = async () => { await client.query('SAVEPOINT s'); try { await client.query('x'); } catch { await client.query('ROLLBACK TO SAVEPOINT s'); } }", 0],
    ["const a = async () => { try { notADbCall(); } catch { v = null; } }", 0],
    ["const a = async () => { try { await listThings(client, {}); } catch { v = null; } }", 1],
    // sweepA — a catch around a whole opener-owned transaction cannot poison it; a read beside the opener still can.
    ["const a = async () => { try { const r = await withLuciaBypass(async (client) => { await client.query('x'); }); } catch (err) { failed += 1; } }", 0],
    ["const a = async () => { try { await scope((client) => processRow(client, row)); } catch (err) { results.push(err); } }", 0],
    ["const a = async () => { try { await withLuciaBypass(async (client) => client.query('x')); await client.query('y'); } catch { v = null; } }", 1],
    ["const a = async () => { try { await withLuciaBypass(async (c2) => c2.query('x')); await listThings(client, {}); } catch { v = null; } }", 1],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const got = offendingSites(src).length;
    if (got !== want) {
      console.error(`${LABEL} SELFTEST FAIL: want ${want} got ${got} for: ${src}`);
      bad += 1;
    }
  }
  console.log(`${LABEL} SELFTEST: ${cases.length - bad}/${cases.length} cases (4 planted swallows caught, 6 honest handlers pass)`);
  process.exit(bad ? 1 : 0);
}

const now = measure();
if (process.argv[2] === "--write-baseline") {
  // LST-F11153: the writer stamps measured_at + _comment itself. #28778 rewrote the baseline with the bare measure()
  // object and dropped both, which reddened verify-no-stale-literals-in-guards (pattern b) on main.
  const stamped = {
    ...now,
    _comment: "verify-no-swallowed-db-error-in-transaction shrink-only ratchet (ENG-05 443.322). Written by --write-baseline; measured_at is the write time.",
    measured_at: new Date().toISOString(),
  };
  writeFileSync(BASELINE, `${JSON.stringify(stamped, null, 2)}\n`);
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
