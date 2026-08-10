#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run() {
  const errors = [];
  const modal = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
  const strip = read("apps/frontend/src/pages/dispatch/components/book-load-v4/MilesStrip.tsx");

  assert(
    strip.includes("practicalRequired?: boolean") && strip.includes("practicalRequired = false,") && strip.includes("Practical (long){practicalRequired ? \" *\" : \"\"}"),
    "MilesStrip must support a practicalRequired prop and show an asterisk",
    errors
  );
  assert(
    strip.includes("required={practicalRequired}") && strip.includes("border-slate-400") && strip.includes("text-slate-900"),
    "MilesStrip practical input must use required styling when required",
    errors
  );

  assert(
    modal.includes("if (saveMode === \"book_dispatch\")") && modal.includes("values.miles_practical") && modal.includes("Enter practical miles"),
    "BookLoadModalV4 must refuse booking when practical miles are 0",
    errors
  );
  assert(
    modal.includes("practicalRequired") && modal.includes("Practical must be greater than 0"),
    "BookLoadModalV4 must render MilesStrip with practicalRequired and explain the rule",
    errors
  );
  assert(
    strip.includes("shortestRequired?: boolean") && strip.includes("shortestRequired = false,") && strip.includes("Shortest{shortestRequired ? \" *\" : \"\"}"),
    "MilesStrip must support a shortestRequired prop and show an asterisk",
    errors
  );
  assert(
    strip.includes("required={shortestRequired}") && strip.includes("border-slate-400") && strip.includes("text-slate-900"),
    "MilesStrip shortest input must use required styling when required",
    errors
  );
  assert(
    modal.includes("shortestRequired={Boolean(assignedPrimaryDriverId)}") && modal.includes("Enter shortest miles before booking with a driver"),
    "BookLoadModalV4 must render MilesStrip with shortestRequired tied to seated driver and validate shortest miles > 0",
    errors
  );

  return errors;
}

function selftest() {
  const modalPath = path.join(ROOT, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
  const backup = fs.readFileSync(modalPath, "utf8");
  try {
    const patched = backup.replace(
      /if \(saveMode === "book_dispatch"\) \{\n      if \(\!\(Number\(values\.miles_practical\) > 0\)\) \{[\s\S]*?\n      \}\n    \}/,
      ""
    );
    fs.writeFileSync(modalPath, patched, "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes("practical miles"))) {
      throw new Error("planted practical miles validation removal not detected");
    }
    if (!planted.some((e) => e.includes("shortestRequired") || e.includes("shortest miles"))) {
      throw new Error("planted shortest miles validation removal not detected");
    }
    console.log(`[verify-book-load-miles-required] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(modalPath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-book-load-miles-required] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-book-load-miles-required] All checks passed ✓");
}

main();
