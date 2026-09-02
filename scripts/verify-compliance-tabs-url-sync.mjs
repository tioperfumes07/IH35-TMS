#!/usr/bin/env node
/**
 * verify-compliance-tabs-url-sync.mjs — Ops F: Compliance in-page tabs use ?tab= URL sync.
 *
 * Locks:
 * - ComplianceDashboardPage reads/writes useSearchParams `tab`
 * - Unknown/missing tab defaults to filings (parseComplianceTab)
 *
 * Usage:
 *   node scripts/verify-compliance-tabs-url-sync.mjs
 *   node scripts/verify-compliance-tabs-url-sync.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-compliance-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertContains(source, needle) {
  if (!source.includes(needle)) {
    throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${PAGE}`);
  }
}

function assertNotContains(source, needle) {
  if (source.includes(needle)) {
    throw new Error(`${LABEL}: forbidden ${JSON.stringify(needle)} still present in ${PAGE}`);
  }
}

function run() {
  const source = read(PAGE);
  assertContains(source, "useSearchParams");
  assertContains(source, 'searchParams.get("tab")');
  assertContains(source, "parseComplianceTab");
  assertContains(source, 'params.set("tab", next)');
  // Local-only tab state must not return (URL is source of truth).
  assertNotContains(source, 'useState<ComplianceTab>("filings")');
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const forbidden = 'useState<ComplianceTab>("filings")';
  let caught = false;
  try {
    assertNotContains(`const [tab, setTab] = ${forbidden};`, forbidden);
  } catch (error) {
    caught = error instanceof Error && error.message.includes("forbidden");
  }
  if (!caught) throw new Error(`${LABEL}: planted local-only tab state escaped assertNotContains`);

  assertContains('searchParams.get("tab")', 'searchParams.get("tab")');
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
