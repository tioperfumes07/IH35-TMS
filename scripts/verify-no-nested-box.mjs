#!/usr/bin/env node
/**
 * verify-no-nested-box.mjs  (UI-01 PART 2 — flat containers, QuickBooks/NetSuite style)
 *
 * Design rule: a bordered/shadowed rounded container (a "box") must NOT be
 * nested directly inside another such container. QuickBooks & NetSuite frame a
 * section ONCE, then lay flat rows/fields inside — never a card-in-card-in-card.
 *
 * A "box" element here = a JSX container tag (div/section/aside/article, or a
 * Card/Panel/Section-style capitalized component) whose className contains
 * `rounded` AND at least one framing token (`border` that is not `border-0`/
 * `border-none`, OR `shadow`). When such a box is opened while a box ancestor is
 * already on the tag stack, that is one nesting offense.
 *
 * This guard is a RATCHET: current offenders are baselined per-file into
 * scripts/.nested-box-baseline.json so today stays green, and CI FAILS only when
 * a file's nested-box count rises above its baseline (a NEW box-in-box) or a
 * new file introduces one. Flatten inner frames to lower a file's count.
 *
 * Usage:
 *   node scripts/verify-no-nested-box.mjs            # scan, compare to baseline
 *   node scripts/verify-no-nested-box.mjs --update   # write current counts as baseline
 *   node scripts/verify-no-nested-box.mjs --selftest # inject a nested box -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const SCAN_ROOT = "apps/frontend/src";
const BASELINE_PATH = "scripts/.nested-box-baseline.json";

const CONTAINER_TAGS = /^(div|section|aside|article|main|header|footer|Card|Panel|Section|Box|Surface)$/;

// className is a box frame if it has `rounded` AND (a real border OR a shadow).
function isBoxClassName(cls) {
  if (!cls) return false;
  const hasRounded = /\brounded(-[a-z0-9]+)?\b/.test(cls);
  if (!hasRounded) return false;
  const hasBorder = /\bborder\b/.test(cls) && !/\bborder-(0|none)\b/.test(cls);
  const hasShadow = /\bshadow(-[a-z0-9]+)?\b/.test(cls) && !/\bshadow-none\b/.test(cls);
  return hasBorder || hasShadow;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Deterministic tag-stack scan. We walk JSX opening/closing/self-closing tags
// for the container set and track nesting depth of "box" containers.
function countNestedBoxes(src) {
  const source = stripComments(src);
  // Match: </tag> | <tag ...>  | <tag .../>  for container tags only.
  const tagRe = /<(\/)?([A-Za-z][A-Za-z0-9]*)\b([^>]*?)(\/)?>/g;
  const stack = []; // each entry: { isBox: boolean }
  let boxDepth = 0;
  let nested = 0;
  let m;
  while ((m = tagRe.exec(source)) !== null) {
    const closing = Boolean(m[1]);
    const tag = m[2];
    const attrs = m[3] ?? "";
    const selfClose = Boolean(m[4]);
    if (!CONTAINER_TAGS.test(tag)) {
      // Non-container tag: ignore for stack purposes (keeps depth stable and
      // deterministic; box nesting is measured only across container elements).
      continue;
    }
    if (closing) {
      // Pop the nearest matching-by-box container. Since we only track container
      // tags, pop the last one; if it was a box, decrement boxDepth.
      const top = stack.pop();
      if (top?.isBox) boxDepth -= 1;
      continue;
    }
    const clsMatch = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/.exec(attrs);
    const cls = clsMatch ? (clsMatch[1] ?? clsMatch[2] ?? clsMatch[3] ?? "") : "";
    const isBox = isBoxClassName(cls);
    if (isBox && boxDepth > 0) nested += 1;
    if (selfClose) {
      // self-closing container never becomes an ancestor
      continue;
    }
    stack.push({ isBox });
    if (isBox) boxDepth += 1;
  }
  return nested;
}

function listTsx(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listTsx(full, out);
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
}

function scanCounts() {
  const files = [];
  const abs = path.join(repoRoot, SCAN_ROOT);
  if (fs.existsSync(abs)) listTsx(abs, files);
  const counts = {};
  for (const full of files) {
    const rel = path.relative(repoRoot, full);
    const n = countNestedBoxes(fs.readFileSync(full, "utf8"));
    if (n > 0) counts[rel] = n;
  }
  return counts;
}

function loadBaseline() {
  const p = path.join(repoRoot, BASELINE_PATH);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

export function run() {
  const counts = scanCounts();
  const baseline = loadBaseline();
  const regressions = [];
  for (const [rel, n] of Object.entries(counts)) {
    const base = baseline[rel] ?? 0;
    if (n > base) regressions.push(`${rel}: ${n} nested box(es) (baseline ${base}) — flatten the inner frame`);
  }
  if (regressions.length > 0) {
    console.error("[verify-no-nested-box] FAIL — new box-within-box nesting (QBO/NetSuite = one frame, flat inside):");
    for (const r of regressions) console.error(`  - ${r}`);
    return { ok: false, regressions, counts };
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`[verify-no-nested-box] PASS — no new nested boxes (${Object.keys(counts).length} baselined files, ${total} tracked offenders)`);
  return { ok: true, regressions: [], counts };
}

export function check() {
  return run().ok;
}

function update() {
  const counts = scanCounts();
  fs.writeFileSync(path.join(repoRoot, BASELINE_PATH), JSON.stringify(counts, null, 2) + "\n");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`[verify-no-nested-box] baseline updated — ${Object.keys(counts).length} files, ${total} offenders`);
}

function selftest() {
  const nested = `<div className="rounded border p-4"><div className="rounded border p-2">x</div></div>`;
  if (countNestedBoxes(nested) !== 1) {
    console.error(`[verify-no-nested-box] SELFTEST FAIL — nested box not detected (got ${countNestedBoxes(nested)})`);
    process.exit(1);
  }
  const flat = `<div className="rounded border p-4"><div className="p-2">x</div></div>`;
  if (countNestedBoxes(flat) !== 0) {
    console.error(`[verify-no-nested-box] SELFTEST FAIL — false positive on flat inner (got ${countNestedBoxes(flat)})`);
    process.exit(1);
  }
  const siblings = `<div className="rounded border"><div className="p-1"/></div><div className="rounded border">y</div>`;
  if (countNestedBoxes(siblings) !== 0) {
    console.error(`[verify-no-nested-box] SELFTEST FAIL — sibling boxes counted as nested (got ${countNestedBoxes(siblings)})`);
    process.exit(1);
  }
  console.log("[verify-no-nested-box] SELFTEST PASS — detects nesting, ignores flat inner + siblings");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else if (process.argv.includes("--update")) update();
  else process.exit(run().ok ? 0 : 1);
}
