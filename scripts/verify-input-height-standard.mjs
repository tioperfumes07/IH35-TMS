#!/usr/bin/env node
/**
 * IH35-347-A: Input height standard guard.
 *
 * Every form input primitive (MoneyInput, NumberInput, TimePicker, DatePicker,
 * QboDocumentNumberField, FORM_INPUT_CLASS) must use h-9 (36px). No screen file may
 * override input/select element height to a non-standard value.
 *
 * Standard heights allowed on raw <input> and <select> elements:
 *   h-9   — form inputs (FORM_INPUT_CLASS)
 *   h-8.5 — filter-bar search inputs (FILTER_CONTROL_SIZE_CLASS)
 *
 * Allowlist exceptions (compact UI utilities, not form fields):
 *   table/Paginator.tsx   — page-jump input
 *   table/ColumnChooser.tsx — column-search input (popover)
 *   forms/              — primitive source of truth (fixed at the source)
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "apps/frontend/src");

// Non-standard height patterns on input/select elements (spec IH35-347-A).
// h-7 (28px), h-[30px], h-[38px]: the classes the spec explicitly calls out for removal.
// h-8 (32px) is not in scope for this guard (it is a separate follow-up sweep).
const BANNED_HEIGHTS = [
  /\bh-7\b/,
  /h-\[30px\]/,
  /h-\[38px\]/,
  /h-\[28px\]/,
];

// Files/paths exempt from this check
const ALLOWLIST = [
  "table/Paginator.tsx",       // compact page-jump input
  "table/ColumnChooser.tsx",   // compact column-search input
];

function isAllowlisted(filePath) {
  return ALLOWLIST.some((p) => filePath.endsWith(p));
}

let violations = [];

// grep for lines that contain a raw <input or <select with a className that has a banned height
// We look for multi-token patterns: a line with <input or <select AND a banned height class
try {
  const result = execSync(
    `grep -rn '<input\\|<select' ${SRC} --include="*.tsx"`,
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );

  for (const line of result.split("\n")) {
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(":");
    const rest = line.slice(colonIdx + 1);
    const lineNumEnd = rest.indexOf(":");
    const filePath = line.slice(0, colonIdx);
    const lineNum = rest.slice(0, lineNumEnd);
    const content = rest.slice(lineNumEnd + 1);

    // Skip test files
    if (filePath.includes("__tests__") || filePath.includes(".test.")) continue;
    // Skip allowlisted files
    if (isAllowlisted(filePath)) continue;

    // Only care about lines that have className with a height class
    if (!content.includes("className")) continue;

    // Check for banned height patterns
    for (const pattern of BANNED_HEIGHTS) {
      if (pattern.test(content)) {
        violations.push({ file: filePath.replace(ROOT + "/", ""), line: lineNum, content: content.trim() });
        break;
      }
    }
  }
} catch (e) {
  if (e.status !== 1) {
    // grep exit 1 = no matches (OK); other errors = real errors
    console.error("grep error:", e.message);
    process.exit(1);
  }
}

if (violations.length > 0) {
  console.error(`verify-input-height-standard: FAIL — ${violations.length} input element(s) with non-standard height:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.content.slice(0, 120)}`);
  }
  console.error("Standard heights: h-9 (form inputs) · h-8.5 (filter-bar search). Fix at the primitive, not at the screen.");
  process.exit(1);
}

console.log(`verify-input-height-standard: PASS — 0 non-standard input heights`);
process.exit(0);
