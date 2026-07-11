#!/usr/bin/env node
/**
 * verify-no-raw-date-input.mjs  (UI-01 PART 1 — QuickBooks-format calendars everywhere)
 *
 * QuickBooks Online renders dates as a MM/DD/YYYY month-grid picker. The native
 * browser <input type="date"> box does NOT match that (locale-dependent, no US
 * format guarantee, no shared styling). The canonical control is the shared
 * apps/frontend/src/components/forms/DatePicker.tsx.
 *
 * This guard FAILS CI if any *.tsx under apps/frontend/src renders a RAW
 * `<input ... type="date">` element. It deliberately does NOT flag a wrapper
 * component prop such as `<Field type="date">` or `<DatePicker>` — those route
 * to the shared picker (that IS the desired pattern). Comments and the
 * `type={type}` passthrough (which only yields a native date box for
 * NON-date types) are ignored.
 *
 * Usage:
 *   node scripts/verify-no-raw-date-input.mjs           # scan repo
 *   node scripts/verify-no-raw-date-input.mjs --selftest # inject a raw input -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const SCAN_ROOT = "apps/frontend/src";

// The DatePicker component itself is the ONE allowed home for a native input
// (it currently uses none, but keep a single documented exemption so the guard
// never fights the canonical control if it ever needs a hidden native input).
const EXEMPT_FILES = new Set(["apps/frontend/src/components/forms/DatePicker.tsx"]);

// Strip // line comments, /* */ block comments, and {/* jsx */} comments so a
// comment mentioning type="date" (e.g. a "SYS-DATE: replaced" note) is not a hit.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// A raw native date box: an <input ...> opening tag that carries type="date"
// (single or double quoted). A `<Field type="date">` (capitalized component)
// is NOT an <input> and is intentionally not matched.
const RAW_DATE_INPUT = /<input\b[^>]*\btype\s*=\s*["']date["']/;

function listTsx(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listTsx(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
}

function scan(root) {
  const files = [];
  const abs = path.join(repoRoot, root);
  if (fs.existsSync(abs)) listTsx(abs, files);
  const offenders = [];
  for (const full of files) {
    const rel = path.relative(repoRoot, full);
    if (EXEMPT_FILES.has(rel)) continue;
    const stripped = stripComments(fs.readFileSync(full, "utf8"));
    if (RAW_DATE_INPUT.test(stripped)) offenders.push(rel);
  }
  return offenders;
}

export function run() {
  const offenders = scan(SCAN_ROOT);
  if (offenders.length > 0) {
    console.error("[verify-no-raw-date-input] FAIL — raw <input type=\"date\"> found (use the shared DatePicker):");
    for (const rel of offenders) console.error(`  - ${rel}`);
    return { ok: false, offenders };
  }
  console.log(`[verify-no-raw-date-input] PASS — no raw <input type="date"> under ${SCAN_ROOT} (shared DatePicker only)`);
  return { ok: true, offenders };
}

export function check() {
  return run().ok;
}

function selftest() {
  // Positive: a raw native date input must be detected.
  const raw = `export function X(){ return <input type="date" value={v}/>; }`;
  if (!RAW_DATE_INPUT.test(stripComments(raw))) {
    console.error("[verify-no-raw-date-input] SELFTEST FAIL — raw <input type=\"date\"> not detected");
    process.exit(1);
  }
  // Negative: a Field wrapper prop and a comment must NOT be flagged.
  const ok1 = `<Field label="Event Date" type="date" value={v} />`;
  const ok2 = `// SYS-DATE: raw type="date" inputs were replaced with the shared DatePicker.`;
  const ok3 = `<input type={type} value={v} />`;
  for (const s of [ok1, ok2, ok3]) {
    if (RAW_DATE_INPUT.test(stripComments(s))) {
      console.error(`[verify-no-raw-date-input] SELFTEST FAIL — false positive on: ${s}`);
      process.exit(1);
    }
  }
  console.log("[verify-no-raw-date-input] SELFTEST PASS — detects raw input, ignores Field prop/comment/passthrough");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    process.exit(run().ok ? 0 : 1);
  }
}
