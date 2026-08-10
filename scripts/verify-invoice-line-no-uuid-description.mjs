#!/usr/bin/env node
/**
 * LV-INV-UUID: customer-facing invoice line descriptions must never contain raw UUIDs.
 *
 * Guards the from-load invoice builder so that the linehaul description is built from the load's
 * human display id (`load_number`), not the load UUID. A description that falls back to a UUID
 * leaks into PDFs and customer emails.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/accounting/from-load.ts");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SELFTEST = process.argv.includes("--selftest");

function fail(msg) {
  console.error(`[verify-invoice-line-no-uuid-description] ${msg}`);
  process.exit(1);
}

function run() {
  const src = fs.readFileSync(FILE, "utf8");

  // Find the linehaul description construction block.
  const blockMatch = src.match(/LV-INV-UUID[\s\S]{0,600}?const linehaulDescription\s*=\s*([^;]+);/);
  if (!blockMatch) {
    fail("Could not locate LV-INV-UUID linehaul description construction in from-load.ts");
  }
  const block = blockMatch[0];

  const checks = [
    ["load_number source", /load\.load_number\b/.test(block)],
    ["loadNumber variable", /const loadNumber\s*=/.test(block)],
    ["throws when load_number missing", /throw.*load_number_required_for_invoice_line/.test(block)],
    ["no load.id interpolation in description", !/load\.id/.test(block)],
    ["no UUID literal in description expression", !UUID_RE.test(block)],
  ];

  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    fail(`from-load.ts linehaul description safety incomplete: ${missing.join(", ")}`);
  }
  return { ok: true, message: "from-load.ts builds invoice line description from load_number, never a UUID" };
}

if (SELFTEST) {
  const { ok, message } = run();
  console.log(`verify-invoice-line-no-uuid-description --selftest ${ok ? "PASS" : "FAIL"}: ${message}`);
  process.exit(ok ? 0 : 1);
}

const { ok, message } = run();
console.log(`verify-invoice-line-no-uuid-description OK — ${message}`);
process.exit(ok ? 0 : 1);
