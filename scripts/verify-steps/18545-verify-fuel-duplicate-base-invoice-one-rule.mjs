#!/usr/bin/env node
/**
 * LEAD 443.185 G12 — ONE fuel duplicate rule: a base invoice is ONE purchase (fuel-provider-reference.ts).
 *
 * Measured on main before this step: the generic fuel import deduped on its own row hash only ("123-13571" and "123"
 * hash apart), so a re-sent receipt reached the INSERT, the base-invoice trigger refused it and the thrown error aborted
 * the WHOLE file. The Settlement Creator preflight already showed the existing load (no "<ticket>-<load>" suggestion).
 *   1. Every writer that INSERTs into fuel.fuel_transactions asks findLiveFuelByProviderTransactionId /
 *      refuseDuplicateProviderTransaction first — except the named exemption (Relay txn ids are not numeric invoices).
 *   2. The generic import counts a hit as rows_duplicate and goes on (no INSERT).
 *   3. No writer suggests a "<ticket>-<load>" reference.
 * --selftest plants each regression.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const IMPORTER = "apps/backend/src/fuel/fuel-transaction-import.ts";
const EXEMPT = {
  "apps/backend/src/integrations/relay-payments/relay-fuel-canonical-bridge.ts":
    "Relay references are txn_… ids, never a numeric base invoice (providerTransactionId → null); one row per Relay txn via source_row_hash = sha256(relay:<txn>)",
};

function backendFiles(dir = resolve(ROOT, "apps/backend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") backendFiles(abs, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(abs);
  }
  return out;
}

export function check(files = backendFiles().map((a) => [relative(ROOT, a), readFileSync(a, "utf8")])) {
  const p = [];
  for (const [rel, src] of files) {
    if (/INSERT INTO fuel\.fuel_transactions/.test(src) && !EXEMPT[rel] && !/findLiveFuelByProviderTransactionId\(|refuseDuplicateProviderTransaction\(/.test(src))
      p.push(`${rel}: writes a fuel purchase without the one base-invoice duplicate rule (1)`);
    // Line-based, linear checks (no backtracking regex — CodeQL js/redos).
    if (/suggest/i.test(src) && src.split("\n").some((l) => l.includes("}-${") && l.includes("load_number") && l.includes("`")))
      p.push(`${rel}: suggests a "<ticket>-<load>" reference (3)`);
  }
  const imp = files.find(([rel]) => rel === IMPORTER)?.[1] ?? "";
  if (!/const alreadyRecorded = await findLiveFuelByProviderTransactionId\(client, \{[\s\S]{0,200}\}\);\s*if \(alreadyRecorded\) \{\s*counts\.rows_duplicate \+= 1;\s*continue;/.test(imp))
    p.push(`${IMPORTER}: a base-invoice duplicate must be a counted duplicate before the INSERT (2)`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const files = backendFiles().map((a) => [relative(ROOT, a), readFileSync(a, "utf8")]);
  if (check(files).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(files));
    process.exit(1);
  }
  const swap = (rel, fn) => files.map(([r, s]) => [r, r === rel ? fn(s) : s]);
  const plants = [
    ["new fuel writer without the rule", [...files, ["apps/backend/src/x.ts", "q(`INSERT INTO fuel.fuel_transactions (id) VALUES ($1)`)"]]],
    ["import pre-check removed", swap(IMPORTER, (s) => s.replace("if (alreadyRecorded) {", "if (false && alreadyRecorded) {"))],
    ["ticket-load suggestion", [...files, ["apps/backend/src/y.ts", "const suggestRef = `${ticket}-${row.load_number}`;"]]],
  ];
  for (const [n, f] of plants) {
    if (!check(f).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-fuel-duplicate-base-invoice-one-rule FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log(`verify-fuel-duplicate-base-invoice-one-rule PASS: every fuel writer asks the one base-invoice rule (${Object.keys(EXEMPT).length} named exemption) (G12)`);
}
