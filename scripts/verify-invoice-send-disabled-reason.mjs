#!/usr/bin/env node
/**
 * LV-SEND-NOREASON: disabled "Send" on invoice detail must expose an accessible reason.
 *
 * A disabled primary action without explanation is indistinguishable from a broken control.
 * This guard checks the InvoiceDetailPage source for the helper, aria attributes, title, and
 * inline helper text that the fix introduced.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx");
const SELFTEST = process.argv.includes("--selftest");

function fail(msg) {
  console.error(`[verify-invoice-send-disabled-reason] ${msg}`);
  process.exit(1);
}

function run() {
  const src = fs.readFileSync(FILE, "utf8");
  const checks = [
    ["sendDisabledReason helper", /sendDisabledReason\s*=/.test(src)],
    ["title prop on Send button", /title=\{sendDisabledReason/.test(src)],
    ["aria-disabled on Send button", /aria-disabled=\{/.test(src)],
    ["aria-describedby on Send button", /aria-describedby=\{sendDisabledReason/.test(src)],
    ["inline helper text", /id=\{sendButtonId\}/.test(src)],
  ];

  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    fail(`InvoiceDetailPage Send button accessibility missing: ${missing.join(", ")}`);
  }
  return { ok: true, message: "InvoiceDetailPage disabled Send exposes an accessible reason" };
}

if (SELFTEST) {
  const { ok, message } = run();
  console.log(`verify-invoice-send-disabled-reason --selftest ${ok ? "PASS" : "FAIL"}: ${message}`);
  process.exit(ok ? 0 : 1);
}

const { ok, message } = run();
console.log(`verify-invoice-send-disabled-reason OK — ${message}`);
process.exit(ok ? 0 : 1);
