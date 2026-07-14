#!/usr/bin/env node
// verify-no-qbo-write-path (QBO-WRITE-KILL — reconcile-only architecture lock)
//
// TMS is RECONCILE-ONLY: no backend code path may CREATE or UPDATE a QuickBooks object. QBO is the
// system of record through 12/31/2025; the books are kept in parallel and reconciled, never written
// back (docs/specs/ACCOUNTING-ARCHITECTURE.md). This guard FAILS the build if any backend source
// issues an outbound entity write to QuickBooks — i.e. an HTTP POST/PATCH whose URL targets a QBO
// company entity endpoint (a re-introduced push service, a re-armed qboPostMasterJson, etc.).
//
// Detection: a `method: "POST"|"PATCH"` (in a fetch/request init) that appears within a short window
// AFTER a line that builds a QBO company URL (`${qboApiBase()}/…` or a literal
// `quickbooks.api.intuit.com/v3/company/…`). READS are unaffected: QBO reads use GET (query, cdc,
// companyinfo, reports, entity GETs), and a POST to a NON-QBO host (e.g. the Plaid sandbox) has no
// QBO URL above it, so neither is flagged.
//
// LINKAGE: N/A (external-vendor architecture lock). Additive-only, read-only static scan.
// Self-test: node scripts/verify-no-qbo-write-path.mjs --selftest

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "apps/backend/src");

// A line that constructs a QBO *company* URL (the base every entity write hangs off).
const QBO_URL_RE = /\$\{\s*qboApiBase\(\)\s*\}\/|(?:sandbox-)?quickbooks\.api\.intuit\.com\/v3\/company/;
// A fetch/request init selecting an entity-mutating verb.
const WRITE_METHOD_RE = /method:\s*["'`](POST|PATCH)["'`]/;
// How many lines a write-method may sit below the URL line and still belong to that request.
const WINDOW = 15;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(p, acc);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      acc.push(p);
    }
  }
  return acc;
}

// Pure scanner over one file's text. Exported for the self-test.
export function scan(text, file) {
  const lines = text.split("\n");
  const offenders = [];
  const qboUrlLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (QBO_URL_RE.test(lines[i])) qboUrlLines.push(i);
  }
  for (let i = 0; i < lines.length; i++) {
    if (!WRITE_METHOD_RE.test(lines[i])) continue;
    // Is there a QBO company URL within WINDOW lines above this write-method?
    const anchored = qboUrlLines.some((u) => i - u >= 0 && i - u <= WINDOW);
    if (anchored) {
      offenders.push(`${file}:${i + 1}: outbound QBO entity write (${lines[i].trim()}) — reconcile-only lock forbids POST/PATCH to a QuickBooks entity endpoint`);
    }
  }
  return offenders;
}

export function run() {
  const offenders = [];
  for (const file of walk(SRC)) {
    offenders.push(...scan(fs.readFileSync(file, "utf8"), path.relative(ROOT, file)));
  }
  return offenders;
}

if (process.argv.includes("--selftest")) {
  // A planted QBO write MUST be caught.
  const planted = [
    'const url = `${qboApiBase()}/${realmId}/journalentry?minorversion=75`;',
    "const response = await fetch(url, {",
    '  method: "POST",',
    "  body: JSON.stringify(payload),",
    "});",
  ].join("\n");
  const plantedLiteral = [
    'const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice`;',
    'await fetch(url, { method: "PATCH", body });',
  ].join("\n");
  // Clean shapes that must NOT be flagged:
  const readGet = [
    'const url = `${qboApiBase()}/${realmId}/query?query=${q}&minorversion=75`;',
    'await fetch(url, { method: "GET" });',
  ].join("\n");
  const plaidPost = [
    'const res = await fetch("https://sandbox.plaid.com/sandbox/public_token/create", {',
    '  method: "POST",',
    "  body: JSON.stringify({}),",
    "});",
  ].join("\n");
  const disabled = 'return qboWriteDisabled("journal_entry");';

  const results = {
    planted: scan(planted, "planted.ts").length,
    plantedLiteral: scan(plantedLiteral, "plantedLiteral.ts").length,
    readGet: scan(readGet, "readGet.ts").length,
    plaidPost: scan(plaidPost, "plaidPost.ts").length,
    disabled: scan(disabled, "disabled.ts").length,
  };
  const problems = [];
  if (results.planted !== 1) problems.push(`planted fetch-POST: expected 1 offender, got ${results.planted}`);
  if (results.plantedLiteral !== 1) problems.push(`planted literal-URL PATCH: expected 1 offender, got ${results.plantedLiteral}`);
  if (results.readGet !== 0) problems.push(`QBO read (GET): expected 0 offenders, got ${results.readGet}`);
  if (results.plaidPost !== 0) problems.push(`non-QBO (Plaid) POST: expected 0 offenders, got ${results.plaidPost}`);
  if (results.disabled !== 0) problems.push(`disabled no-op: expected 0 offenders, got ${results.disabled}`);
  if (problems.length) {
    console.error("verify-no-qbo-write-path selftest FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "));
    process.exit(1);
  }
  console.log("verify-no-qbo-write-path selftest OK (planted writes caught; reads / non-QBO POST / disabled no-op pass clean)");
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const offenders = run();
  if (offenders.length) {
    console.error(
      "verify:no-qbo-write-path FAIL — TMS is reconcile-only and must NEVER write to QuickBooks:\n  " +
        offenders.map((o) => "✗ " + o).join("\n  ")
    );
    process.exit(1);
  }
  console.log("verify:no-qbo-write-path OK — zero outbound QBO entity writes (reconcile-only lock intact)");
}
