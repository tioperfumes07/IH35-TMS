#!/usr/bin/env node
// verify:qbo-money-parse — permanent guard (per the bug-fix-gets-a-guard rule).
//
// QBO report money MUST be parsed with exact integer-cents string math (amountToCents), never with
// parseFloat()/Number() on a money-shaped variable — float parsing silently loses precision on values
// like 1234.56 and accumulates error across a ledger, which would corrupt every downstream trial
// balance, tieout, and opening JE. This guard greps apps/backend/src/integrations/qbo/** for
// parseFloat(...) or Number(...) applied to a variable whose name looks like money
// (amount|cents|balance|debit|credit) and fails the build if any is found.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCAN_DIR = path.join(ROOT, "apps", "backend", "src", "integrations", "qbo");

// A money-shaped identifier used DIRECTLY as the argument — e.g. Number(amount), parseFloat(balance).
// The trailing negative lookahead `(?![A-Za-z0-9_(])` ensures the token is a complete identifier and is
// NOT a function call: it deliberately does NOT flag the safe wrapper Number(amountToCents(...)) (which
// converts an already-exact BigInt) nor dotted reads like Number(tms.total_cents ?? 0) (cents-integer
// columns). It flags the real hazard: float-parsing a raw money value.
const MONEY = "[A-Za-z0-9_]*(amount|cents|balance|debit|credit)[A-Za-z0-9_]*(?![A-Za-z0-9_(])";
const BANNED = [
  new RegExp(`parseFloat\\s*\\(\\s*${MONEY}`, "i"),
  new RegExp(`\\bNumber\\s*\\(\\s*${MONEY}`, "i"),
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
    } else if (/\.(ts|mts|cts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

let scanned = 0;
const violations = [];
if (statSyncSafe(SCAN_DIR)) {
  for (const file of walk(SCAN_DIR)) {
    scanned += 1;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, ""); // ignore line comments
      for (const re of BANNED) {
        if (re.test(code)) {
          violations.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      }
    });
  }
}

function statSyncSafe(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

if (violations.length > 0) {
  console.error("verify:qbo-money-parse — FAILED");
  console.error("  Money must be parsed with amountToCents (exact BigInt string math), not parseFloat/Number:");
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}

console.log(`verify:qbo-money-parse — OK (${scanned} file(s) scanned, no float money parsing)`);
