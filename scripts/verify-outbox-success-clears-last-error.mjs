#!/usr/bin/env node
/**
 * LV-OUTBOX-ERRCOL — success delivery must clear last_error (never write success text into it).
 * --selftest plants the pre-fix CASE WHEN $2 pattern and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROC = path.join(ROOT, "apps/backend/src/outbox/processor.ts");

function check(src) {
  const errors = [];
  // Delivered UPDATE must null last_error unconditionally.
  if (!/SET delivered_at = now\(\,[\s\S]*?last_error = NULL/m.test(src) && !/delivered_at = now\(\),\s*[\s\S]*?last_error = NULL/.test(src)) {
    // simpler: delivered block must contain last_error = NULL and must NOT assign CASE WHEN $2 for last_error on success
    errors.push("delivered UPDATE must set last_error = NULL");
  }
  if (!/last_error = NULL/.test(src)) {
    errors.push("processor must clear last_error on success");
  }
  if (/last_error = CASE WHEN \$2::text = '' THEN NULL ELSE left\(\$2, 2000\) END/.test(src)) {
    errors.push("success path still writes result.message into last_error (LV-OUTBOX-ERRCOL)");
  }
  // Failure paths may still write last_error = left($N
  if (!/last_error = left\(/.test(src)) {
    errors.push("expected failure/retry paths to still write last_error = left(...)");
  }
  return errors;
}

function selftest() {
  const orig = fs.readFileSync(PROC, "utf8");
  const planted = orig.replace(
    /last_error = NULL,\n(\s*)updated_at = now\(\)/,
    `last_error = CASE WHEN $2::text = '' THEN NULL ELSE left($2, 2000) END,\n$1updated_at = now()`
  );
  if (planted === orig) throw new Error("selftest: could not plant pre-fix last_error write");
  fs.writeFileSync(PROC, planted);
  try {
    const errors = check(fs.readFileSync(PROC, "utf8"));
    if (!errors.some((e) => e.includes("LV-OUTBOX-ERRCOL") || e.includes("last_error"))) {
      throw new Error("selftest: planted defect did not fail: " + JSON.stringify(errors));
    }
    console.log("selftest PASS — planted success→last_error write fails:", errors.find((e) => e.includes("LV-OUTBOX")));
  } finally {
    fs.writeFileSync(PROC, orig);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check(fs.readFileSync(PROC, "utf8"));
if (errors.length) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: outbox success clears last_error (failure-only diagnosis column)");
process.exit(0);
