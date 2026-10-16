#!/usr/bin/env node
/**
 * LEAD 443.168 M — Engine Registry E-50: ONE match writer, ONE unmatch writer.
 *
 * Measured on main before this step: banking.reconciliation_matches was written by 6 places (match.service storeMatch,
 * relay-bank-match :563, recon-worklist :235, link-suggestions-actions :252, bank-tx-dedup :50/:70,
 * void-cancel-executors :934/:959).
 *
 *   1. INSERT INTO banking.reconciliation_matches — only accounting/bank-recon/match.service.ts (storeMatch).
 *   2. UPDATE / DELETE banking.reconciliation_matches — only accounting/bank-recon/unmatch-bank-transaction.service.ts
 *      (release / void / plaid-merge move). No DELETE anywhere (VOID = reversal; nothing is deletable).
 *   3. Every write of a banking.bank_transactions matched_*_id pointer (set or clear, incl. a dynamic `${col} =`) is in
 *      the SHRINK-ONLY allowlist 18469-matched-pointer-writers.allowlist.json: a new file, or more sites in a listed
 *      file, fails; the allowlist itself may only shrink against origin/main.
 *
 * --selftest: plants each regression and asserts the guard fails.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOW_REL = "scripts/verify-steps/18469-matched-pointer-writers.allowlist.json";
const MATCH_WRITER = "apps/backend/src/accounting/bank-recon/match.service.ts";
const UNMATCH_WRITER = "apps/backend/src/accounting/bank-recon/unmatch-bank-transaction.service.ts";

function backendFiles(dir = resolve(ROOT, "apps/backend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") backendFiles(abs, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(abs);
  }
  return out;
}

/** Every SQL template in a file, classified. */
export function scan(rel, src) {
  const sites = { insert: 0, update: 0, del: 0, pointer: 0 };
  for (const m of src.matchAll(/`([^`]*)`/g)) {
    const sql = m[1];
    if (/INSERT\s+INTO\s+banking\.reconciliation_matches\b/i.test(sql)) sites.insert += 1;
    if (/UPDATE\s+banking\.reconciliation_matches\b/i.test(sql)) sites.update += 1;
    if (/DELETE\s+FROM\s+banking\.reconciliation_matches\b/i.test(sql)) sites.del += 1;
    if (/UPDATE\s+banking\.bank_transactions\b/i.test(sql) && (/\bmatched_[a-z_]+_id\s*=/.test(sql) || /\$\{[A-Za-z_.]*[Cc]olumn\}\s*=/.test(sql))) sites.pointer += 1;
  }
  return sites;
}

export function check(files, allow, mainAllow) {
  const findings = [];
  const pointerCounts = {};
  for (const [rel, src] of files) {
    const s = scan(rel, src);
    if (s.insert && rel !== MATCH_WRITER) findings.push(`${rel}: writes banking.reconciliation_matches — only storeMatch (${MATCH_WRITER}) may (1)`);
    if (s.update && rel !== UNMATCH_WRITER) findings.push(`${rel}: updates banking.reconciliation_matches — only the unmatch writer (${UNMATCH_WRITER}) may (2)`);
    if (s.del) findings.push(`${rel}: DELETEs a match row — nothing is deletable (2)`);
    if (s.pointer) pointerCounts[rel] = s.pointer;
  }
  if (!files.some(([rel, src]) => rel === MATCH_WRITER && /export async function storeMatch\(/.test(src))) findings.push(`${MATCH_WRITER}: storeMatch (the one match writer) is missing (1)`);
  if (!files.some(([rel, src]) => rel === UNMATCH_WRITER && /export async function unmatchBankTransactionOnClient\(/.test(src))) findings.push(`${UNMATCH_WRITER}: the one unmatch writer is missing (2)`);
  for (const [rel, n] of Object.entries(pointerCounts)) {
    const cap = allow[rel];
    if (cap == null) findings.push(`${rel}: a new matched_* pointer writer (${n}) — route it through the one match / unmatch writer (3)`);
    else if (n > cap) findings.push(`${rel}: ${n} matched_* pointer write sites, allowlist caps it at ${cap} (3)`);
  }
  if (mainAllow) {
    for (const [rel, cap] of Object.entries(allow)) {
      if (mainAllow[rel] == null) findings.push(`${ALLOW_REL}: ${rel} added — the allowlist only shrinks (3)`);
      else if (cap > mainAllow[rel]) findings.push(`${ALLOW_REL}: ${rel} raised ${mainAllow[rel]} → ${cap} — the allowlist only shrinks (3)`);
    }
  }
  return findings;
}

function load() {
  const files = backendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  const allow = JSON.parse(readFileSync(resolve(ROOT, ALLOW_REL), "utf8")).sites;
  let mainAllow = null;
  const r = spawnSync("git", ["show", `origin/main:${ALLOW_REL}`], { cwd: ROOT, encoding: "utf8" });
  if (r.status === 0) mainAllow = JSON.parse(r.stdout).sites;
  return { files, allow, mainAllow };
}

if (process.argv.includes("--selftest")) {
  const { files, allow, mainAllow } = load();
  if (check(files, allow, mainAllow).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(files, allow, mainAllow));
    process.exit(1);
  }
  const plants = [
    ["second match writer", [...files, ["apps/backend/src/x.ts", "q(`INSERT INTO banking.reconciliation_matches (id) VALUES (1)`)"]], allow, mainAllow],
    ["second unmatch writer", [...files, ["apps/backend/src/x.ts", "q(`UPDATE banking.reconciliation_matches SET voided_at = now()`)"]], allow, mainAllow],
    ["delete", [...files, ["apps/backend/src/x.ts", "q(`DELETE FROM banking.reconciliation_matches WHERE true`)"]], allow, mainAllow],
    ["new pointer writer", [...files, ["apps/backend/src/x.ts", "q(`UPDATE banking.bank_transactions SET matched_bill_id = $1`)"]], allow, mainAllow],
    ["dynamic pointer writer", [...files, ["apps/backend/src/x.ts", "q(`UPDATE banking.bank_transactions SET ${matchedColumn} = $1`)"]], allow, mainAllow],
    ["allowlist grows", files, { ...allow, "apps/backend/src/x.ts": 1 }, mainAllow ?? allow],
    ["storeMatch gone", files.map(([r, s]) => [r, r === MATCH_WRITER ? s.replace("export async function storeMatch(", "async function storeMatchX(") : s]), allow, mainAllow],
  ];
  for (const [name, f, a, m] of plants) {
    if (check(f, a, m).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const { files, allow, mainAllow } = load();
const findings = check(files, allow, mainAllow);
if (findings.length) {
  console.error(`verify-one-match-writer-one-unmatch-writer FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify-one-match-writer-one-unmatch-writer PASS: match rows via storeMatch / the unmatch writer only; ${Object.keys(allow).length} allowlisted pointer writers (shrink-only)`);
