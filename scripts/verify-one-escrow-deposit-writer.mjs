#!/usr/bin/env node
/**
 * verify-one-escrow-deposit-writer — BCF-11 (Codex deep-wiring audit 2026-10-12), LEAD 443.120 C.
 *
 * THE DEFECT: a second, incomplete escrow writer (historical-escrow-backfill.service.ts,
 * createHistoricalEscrowHold) appended a driver escrow HOLD to driver_finance.escrow_ledger and an
 * accounting.escrow_postings 'deposit' with NO source id and NO journal entry. It was mounted through
 * POST /api/v1/driver-finance/feed-day/run. Retired: escrow withheld from a driver is written by ONE
 * engine — the settlement close (closeSettlementPayRun), which the Settlement Creator posts through.
 *
 * RULES (runtime code, apps/backend/src, tests excluded):
 *   1. No file defines, imports or calls createHistoricalEscrowHold, and
 *      apps/backend/src/driver-finance/historical-escrow-backfill.service.ts does not exist
 *      (also enforced for scripts/: a one-off script must not resurrect it).
 *   2. A driver escrow HOLD row (INSERT INTO driver_finance.escrow_ledger ... 'hold') is written ONLY by
 *      the settlement close.
 *   3. Every recordEscrowPostingOnly(... posting_type: "deposit" ...) call outside the escrow engine
 *      itself is in an allowed file — the settlement close (driver's own escrow contribution) or the
 *      driver-merge transfer (moves an existing balance) — and passes BOTH linked_journal_entry_id and a
 *      source_id that is not null. A deposit with no JE or no source is the BCF-11 shape.
 *
 * Run: node scripts/verify-one-escrow-deposit-writer.mjs [--selftest]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-one-escrow-deposit-writer";
const RETIRED_FILE = "apps/backend/src/driver-finance/historical-escrow-backfill.service.ts";
const CLOSE_FILE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const ESCROW_ENGINE = "apps/backend/src/accounting/escrow/service.ts";
const DEPOSIT_ALLOWED = new Set([CLOSE_FILE, "apps/backend/src/mdata/driver-merge.service.ts"]);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Balanced-paren call bodies for `name(` occurrences. */
function callBodies(src, name) {
  const out = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    out.push(src.slice(start, i + 1));
  }
  return out;
}

/** files: Array<{ rel, src }> (runtime code); scriptFiles: same for scripts/. */
export function checkEscrowWriters(files, scriptFiles, retiredFileExists) {
  const problems = [];
  if (retiredFileExists) problems.push(`${RETIRED_FILE} exists — the retired second escrow writer is back (BCF-11).`);
  for (const { rel, src } of [...files, ...scriptFiles]) {
    if (rel === "scripts/verify-one-escrow-deposit-writer.mjs") continue;
    const code = stripComments(src);
    if (/\bcreateHistoricalEscrowHold\b/.test(code)) problems.push(`${rel}: references createHistoricalEscrowHold — escrow is written only by the settlement close (BCF-11).`);
  }
  for (const { rel, src } of files) {
    const code = stripComments(src);
    if (rel !== CLOSE_FILE && /INSERT\s+INTO\s+driver_finance\.escrow_ledger[\s\S]{0,400}?'hold'/.test(code)) {
      problems.push(`${rel}: writes a driver escrow HOLD — only the settlement close may (BCF-11).`);
    }
    if (rel === ESCROW_ENGINE) continue;
    for (const body of callBodies(code, "recordEscrowPostingOnly")) {
      if (!/posting_type:\s*["']deposit["']/.test(body)) continue;
      if (!DEPOSIT_ALLOWED.has(rel)) {
        problems.push(`${rel}: posts an escrow deposit outside the settlement close / driver-merge transfer (BCF-11).`);
        continue;
      }
      if (!/linked_journal_entry_id\s*:/.test(body)) problems.push(`${rel}: escrow deposit without linked_journal_entry_id (BCF-11 shape).`);
      if (!/source_id\s*:/.test(body) || /source_id\s*:\s*null\b/.test(body)) problems.push(`${rel}: escrow deposit without a source_id (BCF-11 shape).`);
    }
  }
  return problems;
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name) && !/\.test\.|\.spec\./.test(name)) acc.push(p);
  }
  return acc;
}
const load = (paths) => paths.map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, "utf8") }));

if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  const real = load(walk(join(ROOT, "apps/backend/src")));
  ex("real repo is clean", checkEscrowWriters(real, [], existsSync(join(ROOT, RETIRED_FILE))).length === 0);
  ex("retired file back is caught", checkEscrowWriters([], [], true).length === 1);
  ex("a script calling createHistoricalEscrowHold is caught",
    checkEscrowWriters([], [{ rel: "scripts/feed/x.mts", src: "await createHistoricalEscrowHold(c, {})" }], false).length === 1);
  ex("a hold written outside the close is caught",
    checkEscrowWriters([{ rel: "apps/backend/src/x.ts", src: "q(`INSERT INTO driver_finance.escrow_ledger (a) VALUES ($1, 'hold')`)" }], [], false).length === 1);
  ex("a deposit from a non-allowed file is caught",
    checkEscrowWriters([{ rel: "apps/backend/src/y.ts", src: 'recordEscrowPostingOnly(c, { posting_type: "deposit", source_id: s, linked_journal_entry_id: j })' }], [], false).length === 1);
  ex("the close's deposit with no JE is caught",
    checkEscrowWriters([{ rel: CLOSE_FILE, src: 'recordEscrowPostingOnly(c, { posting_type: "deposit", source_id: s })' }], [], false).some((p) => /linked_journal_entry_id/.test(p)));
  ex("a deposit with source_id null is caught",
    checkEscrowWriters([{ rel: CLOSE_FILE, src: 'recordEscrowPostingOnly(c, { posting_type: "deposit", source_id: null, linked_journal_entry_id: j })' }], [], false).some((p) => /source_id/.test(p)));
  ex("a release (not a deposit) is not this guard's concern",
    checkEscrowWriters([{ rel: "apps/backend/src/z.ts", src: 'recordEscrowPostingOnly(c, { posting_type: "release" })' }], [], false).length === 0);
  ex("a comment naming the retired writer is not a hit",
    checkEscrowWriters([{ rel: "apps/backend/src/w.ts", src: "// the former createHistoricalEscrowHold call" }], [], false).length === 0);
  console.log(ok ? `${LABEL} --selftest PASS (9/9)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const problems = checkEscrowWriters(load(walk(join(ROOT, "apps/backend/src"))), load(walk(join(ROOT, "scripts/feed"))), existsSync(join(ROOT, RETIRED_FILE)));
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — escrow holds are written only by the settlement close; every escrow deposit carries its JE + source; the retired historical writer is gone (BCF-11).`);
