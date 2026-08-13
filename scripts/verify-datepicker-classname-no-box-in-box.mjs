#!/usr/bin/env node
/**
 * CLS-QBO-DATEPICKER-BOX-IN-BOX — DatePicker className must not paint a second box.
 *
 * Root cause: callers passed `border` / `rounded` / `px-*` onto DatePicker's outer
 * wrapper while the button already has QBO border chrome → nested boxes (Assignment
 * History From/To calendars misaligned).
 *
 * This guard:
 *  1) Requires DatePicker.tsx to partition/strip chrome tokens from className.
 *  2) Requires Assignment History filters use Apply + layout-only DatePicker className.
 *
 * Usage:
 *   node scripts/verify-datepicker-classname-no-box-in-box.mjs
 *   node scripts/verify-datepicker-classname-no-box-in-box.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATEPICKER = path.join(ROOT, "apps/frontend/src/components/forms/DatePicker.tsx");
const HISTORY = path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx");

function run() {
  const errors = [];
  const dp = fs.readFileSync(DATEPICKER, "utf8");
  if (!dp.includes("partitionDatePickerClassName")) {
    errors.push("DatePicker.tsx must define partitionDatePickerClassName (strip border/rounded/px/py from className)");
  }
  if (!/border-gray-300/.test(dp) || !/<button[\s\S]*border border-gray-300/.test(dp)) {
    errors.push("DatePicker button must keep the single QBO border chrome");
  }
  // Outer wrapper must use partitioned shell, not raw className
  if (/className=\{`relative \$\{className\}`\}/.test(dp) || /className=\{`relative \$\{className\}/.test(dp)) {
    errors.push("DatePicker must not apply raw className onto the outer relative wrapper (box-in-box)");
  }
  if (!dp.includes("${shell}") && !dp.includes("`relative ${shell}")) {
    errors.push("DatePicker outer wrapper must use partitioned shell classes only");
  }

  const hist = fs.readFileSync(HISTORY, "utf8");
  if (!hist.includes('data-testid="assignment-history-filter-apply"')) {
    errors.push("AssignmentHistoryPage must expose Apply (assignment-history-filter-apply)");
  }
  if (!hist.includes("setApplied") && !hist.includes("applied.")) {
    errors.push("AssignmentHistoryPage must keep draft vs applied filters (Apply before query)");
  }
  // DatePicker classNames on this page must not include border
  const dpCalls = [...hist.matchAll(/<DatePicker\b([^>]*)\/?>/g)];
  for (const m of dpCalls) {
    const attrs = m[1] || "";
    const cm = attrs.match(/className="([^"]*)"/) || attrs.match(/className=\{`([^`]*)`\}/);
    if (cm && /\bborder\b/.test(cm[1])) {
      errors.push(`AssignmentHistoryPage DatePicker className still has border (box-in-box): ${cm[1]}`);
    }
  }
  if (!hist.includes('data-testid="assignment-history-from-date"') || !hist.includes('data-testid="assignment-history-to-date"')) {
    errors.push("AssignmentHistoryPage must keep from/to DatePicker test ids");
  }

  if (errors.length) {
    console.error("verify-datepicker-classname-no-box-in-box FAIL:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log(
    "verify-datepicker-classname-no-box-in-box OK — DatePicker strips chrome className; Assignment History Apply + layout-only dates",
  );
}

function selftest() {
  const bak = fs.readFileSync(DATEPICKER, "utf8");
  try {
    const broken = bak
      .replace(/partitionDatePickerClassName/g, "partitionDatePickerClassNameREMOVED")
      .replace(/\$\{shell\}/g, "${className}");
    fs.writeFileSync(DATEPICKER, broken);
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (red.status === 0) {
      console.error("selftest FAIL — expected red after removing partition");
      process.exit(1);
    }
    console.log("selftest OK — red when partition removed");
  } finally {
    fs.writeFileSync(DATEPICKER, bak);
  }
  const green = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (green.status !== 0) {
    console.error(green.stderr || green.stdout);
    console.error("selftest FAIL — expected green after restore");
    process.exit(1);
  }
  console.log("selftest OK — green on restore");
}

if (process.argv.includes("--selftest")) selftest();
else run();
