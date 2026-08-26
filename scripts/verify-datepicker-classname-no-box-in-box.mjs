#!/usr/bin/env node
/**
 * CLS-QBO-DATEPICKER-BOX-IN-BOX — DatePicker className must not paint a second box.
 *
 * Root cause: callers passed `border` / `rounded` / `px-*` / `py-*` onto DatePicker's outer
 * wrapper while the button already has QBO border chrome → nested boxes (Assignment
 * History From/To calendars misaligned). DatePicker.partitionDatePickerClassName strips
 * at runtime; this ratchet forbids the tokens at call sites so the defect cannot return.
 *
 * This guard:
 *  1) Requires DatePicker.tsx to partition/strip chrome tokens from className.
 *  2) Requires Assignment History filters use Apply + layout-only DatePicker className.
 *  3) Scans all apps/frontend/src TSX DatePicker className literals for chrome tokens.
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
const FE = path.join(ROOT, "apps/frontend/src");

const CHROME_TOKEN = /(?:^|\s)(?:rounded(?:-\S+)?|border(?:-\S+)?|p[xytblr]?-\S+|text-\S+|focus:\S+|hover:border\S*)(?:\s|$)/;

function walkTsx(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__tests__") continue;
      walkTsx(p, out);
    } else if (ent.name.endsWith(".tsx") && !ent.name.includes(".test.")) {
      out.push(p);
    }
  }
  return out;
}

function extractDatePickerAttrs(src) {
  const results = [];
  const re = /<DatePicker\b/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    let i = start;
    let depth = 0;
    let inString = null;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (inString) {
        if (ch === "\\" && inString !== "`") {
          i += 1;
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (ch === ">" && depth === 0) {
        results.push(src.slice(start, i));
        break;
      }
      if (ch === "/" && src[i + 1] === ">" && depth === 0) {
        results.push(src.slice(start, i));
        break;
      }
    }
  }
  return results;
}

function scanCallSites() {
  const findings = [];
  for (const file of walkTsx(FE)) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (rel.endsWith("components/forms/DatePicker.tsx")) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const attrs of extractDatePickerAttrs(src)) {
      for (const cm of attrs.matchAll(/className="([^"]*)"/g)) {
        if (CHROME_TOKEN.test(` ${cm[1]} `)) {
          findings.push(`${rel}: DatePicker className has chrome tokens (use layout-only): "${cm[1]}"`);
        }
      }
      for (const cm of attrs.matchAll(/className=\{`([^`]*)`\}/g)) {
        if (CHROME_TOKEN.test(` ${cm[1]} `)) {
          findings.push(`${rel}: DatePicker className template has chrome tokens: "${cm[1]}"`);
        }
      }
    }
  }
  return findings;
}

function run() {
  const errors = [];
  const dp = fs.readFileSync(DATEPICKER, "utf8");
  if (!dp.includes("partitionDatePickerClassName")) {
    errors.push("DatePicker.tsx must define partitionDatePickerClassName (strip border/rounded/px/py from className)");
  }
  if (!dp.includes("preventDefault")) {
    errors.push("DatePicker calendar must preventDefault so a wrapping label cannot re-open after a day click");
  }
  if (!dp.includes("suppressToggleRef")) {
    errors.push("DatePicker must suppress the leftover click on the trigger after a day pick (DATEPICKER-CLICKTHROUGH-REOPEN)");
  }
  if (!/onMouseDown=\{\(e\) => \{[\s\S]*setOpen\(false\)/.test(dp)) {
    errors.push("DatePicker day cells must commit on mousedown (not click) so the popover unmount cannot retoggle");
  }
  if (!/border-gray-300/.test(dp) || !/<button[\s\S]*border border-gray-300/.test(dp)) {
    errors.push("DatePicker button must keep the single QBO border chrome");
  }
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
  if (!hist.includes('data-testid="assignment-history-from-date"') || !hist.includes('data-testid="assignment-history-to-date"')) {
    errors.push("AssignmentHistoryPage must keep from/to DatePicker test ids");
  }

  errors.push(...scanCallSites());

  if (errors.length) {
    console.error("verify-datepicker-classname-no-box-in-box FAIL:");
    for (const e of errors.slice(0, 40)) console.error(" -", e);
    if (errors.length > 40) console.error(` - … +${errors.length - 40} more`);
    process.exit(1);
  }
  console.log(
    "verify-datepicker-classname-no-box-in-box OK — DatePicker strips chrome; all call sites layout-only; Assignment History Apply",
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
      console.error("verify-datepicker-classname-no-box-in-box --selftest FAIL: broken DatePicker did not redden");
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(DATEPICKER, bak);
  }
  // Call-site arm: poison the from-date DatePicker className (className precedes data-testid).
  const histBak = fs.readFileSync(HISTORY, "utf8");
  try {
    const poisoned = histBak.replace(
      /className="w-full"(\s*\n\s*data-testid="assignment-history-from-date")/,
      'className="w-full border border-gray-300"$1',
    );
    if (poisoned === histBak) {
      console.error("selftest FAIL: could not poison assignment-history-from-date DatePicker className");
      process.exit(1);
    }
    fs.writeFileSync(HISTORY, poisoned);
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (red.status === 0) {
      console.error("verify-datepicker-classname-no-box-in-box --selftest FAIL: bordered call site did not redden");
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(HISTORY, histBak);
  }
  console.log("verify-datepicker-classname-no-box-in-box --selftest PASS");
}

if (process.argv.includes("--selftest")) selftest();
else run();
