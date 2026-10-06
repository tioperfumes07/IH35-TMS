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

// LST-F418: the load number and its refusal are declared once, near the top of the function (they also feed the
// invoice display id), so they are checked file-wide; the "no id" checks stay on the description expression itself.
// The --selftest used to just run the check (it could never fail); it now plants each defect.
export function check(src) {
  const descMatch = src.match(/const linehaulDescription\s*=\s*([^;]+);/);
  if (!descMatch) return ["could not locate the linehaul description in from-load.ts"];
  const desc = descMatch[1];
  const checks = [
    ["load_number source", /const loadNumber\s*=\s*String\(load\.load_number\b/.test(src)],
    ["throws when load_number missing", /new Error\("load_number_required_for_invoice_line"\)/.test(src)],
    ["description reads loadNumber", /\$\{loadNumber\}/.test(desc)],
    ["no load.id interpolation in description", !/load\.id\b/.test(desc)],
    ["no UUID literal in description expression", !UUID_RE.test(desc)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

function run() {
  const missing = check(fs.readFileSync(FILE, "utf8"));
  if (missing.length > 0) fail(`from-load.ts linehaul description safety incomplete: ${missing.join(", ")}`);
  return { ok: true, message: "from-load.ts builds invoice line description from load_number, never a UUID" };
}

if (SELFTEST) {
  const real = fs.readFileSync(FILE, "utf8");
  if (check(real).length) fail(`selftest: real source rejected: ${check(real).join(", ")}`);
  const plants = [
    ["description interpolates load.id", real.replace("`Linehaul · Load ${loadNumber}`", "`Linehaul · Load ${load.id}`")],
    ["load_number refusal removed", real.replace('new Error("load_number_required_for_invoice_line")', 'new Error("x")')],
    ["load number not from load.load_number", real.replace("const loadNumber = String(load.load_number", "const loadNumber = String(load.id")],
  ];
  for (const [name, mutated] of plants) {
    if (mutated === real) fail(`selftest: plant "${name}" did not change the source (inert)`);
    if (check(mutated).length === 0) fail(`selftest: plant "${name}" NOT caught`);
  }
  console.log(`verify-invoice-line-no-uuid-description --selftest PASS: ${plants.length}/${plants.length} plants caught; real source clean`);
  process.exit(0);
}

const { message } = run();
console.log(`verify-invoice-line-no-uuid-description OK — ${message}`);
