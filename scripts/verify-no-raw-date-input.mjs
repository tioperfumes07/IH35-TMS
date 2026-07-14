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
 * `type={type}` passthrough (a bare identifier, which only yields a native date
 * box for NON-date types) are ignored. `type="datetime-local"` is out of scope
 * (no DatePicker time-of-day equivalent exists yet).
 *
 * 2026-07-14 hardening (UI-STANDARD ROLLOUT sweep): the original regex only matched a
 * LITERAL `type="date"`/`type='date'`. It missed the real bug shape found in 3 create/edit
 * forms — a DYNAMIC ternary assigned straight to a raw <input>'s type, e.g.
 * `type={key.includes("expires") ? "date" : "text"}` (CreateDriverModal.tsx,
 * UnifiedContractCreatorModal.tsx, CatalogEditModal.tsx) — because `type={...}` never matches
 * `type\s*=\s*["']date["']`. Those 3 were converted to <DatePicker/> in the same PR that added
 * this hardening. The guard now brace/quote-aware-extracts each <input> tag and flags it if the
 * `type=` attribute is EITHER the literal string "date" OR an expression container that contains
 * a quoted "date" token (covers the ternary shape) — while still ignoring a bare-identifier
 * passthrough (`type={type}`) and `datetime-local`.
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

// Quoted "date" token — deliberately requires the closing quote immediately after "date" so
// `"datetime-local"` is never matched (no "t" follows the 4th letter in a literal `"date"`).
const DATE_TOKEN = /["']date["']/;

/** Brace/quote-aware JSX opening-tag extractor: a bare `>` inside a `{...}` expression (e.g. a
 *  ternary's own comparison) must not prematurely end the tag. Only a `>` at brace depth 0 and
 *  outside a string literal ends the tag. */
function extractTags(src, tagName) {
  const results = [];
  const re = new RegExp(`<${tagName}\\b`, "g");
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    let i = m.index + m[0].length;
    let depth = 0;
    let inString = null;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (inString) {
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
        depth -= 1;
        continue;
      }
      if (ch === ">" && depth === 0) {
        i += 1;
        break;
      }
    }
    results.push(src.slice(start, i));
  }
  return results;
}

/** Find a `type={...}` expression-container's inner text (brace-matched), or null if `type=` is
 *  a plain quoted literal (already handled by RAW_DATE_INPUT) or absent. */
function typeExpressionBody(tag) {
  const idx = tag.search(/\btype\s*=\s*\{/);
  if (idx < 0) return null;
  const braceStart = tag.indexOf("{", idx);
  let depth = 0;
  for (let i = braceStart; i < tag.length; i += 1) {
    if (tag[i] === "{") depth += 1;
    else if (tag[i] === "}") {
      depth -= 1;
      if (depth === 0) return tag.slice(braceStart + 1, i);
    }
  }
  return null;
}

/** Does this <input> tag's `type=` resolve to a raw "date" — either a literal `type="date"` or a
 *  `type={...}` expression (ternary, etc.) containing a quoted "date" token? A bare-identifier
 *  passthrough (`type={type}`) has no quoted token and is correctly ignored. */
function isRawDateInputTag(tag) {
  if (RAW_DATE_INPUT.test(tag)) return true;
  const body = typeExpressionBody(tag);
  return body != null && DATE_TOKEN.test(body);
}

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
    const tags = extractTags(stripped, "input");
    if (tags.some(isRawDateInputTag)) offenders.push(rel);
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

function detects(src) {
  const tags = extractTags(stripComments(src), "input");
  return tags.some(isRawDateInputTag);
}

function selftest() {
  const cases = [
    { n: "literal type=\"date\" → detected", src: `export function X(){ return <input type="date" value={v}/>; }`, want: true },
    {
      n: "dynamic ternary → detected (the real CreateDriverModal/CatalogEditModal/UnifiedContractCreatorModal bug shape)",
      src: `<input data-field={key} type={key.includes("expires") ? "date" : "text"} value={form[key]} onChange={onChange} />`,
      want: true,
    },
    {
      n: "dynamic ternary, number/date mix → detected",
      src: `<input type={def.type === "date" ? "date" : def.type === "number" ? "number" : "text"} value={v} />`,
      want: true,
    },
    { n: "<Field type=\"date\"> wrapper prop → NOT flagged (not a raw <input>)", src: `<Field label="Event Date" type="date" value={v} />`, want: false },
    { n: "comment mentioning type=\"date\" → NOT flagged", src: `// SYS-DATE: raw type="date" inputs were replaced with the shared DatePicker.`, want: false },
    { n: "bare-identifier passthrough type={type} → NOT flagged", src: `<input type={type} value={v} />`, want: false },
    { n: "datetime-local → NOT flagged (no DatePicker time equivalent)", src: `<input type="datetime-local" value={v} />`, want: false },
    { n: "text input → NOT flagged", src: `<input type="text" value={v} />`, want: false },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = detects(c.src);
    const ok = got === c.want;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (detected=${got}, want=${c.want})`);
  }
  if (failed) {
    console.error(`\n[verify-no-raw-date-input] SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log("\n[verify-no-raw-date-input] SELFTEST PASS — detects literal + dynamic-ternary raw date inputs, ignores Field prop/comment/passthrough/datetime-local");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    process.exit(run().ok ? 0 : 1);
  }
}
