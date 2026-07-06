#!/usr/bin/env node
/**
 * verify-orphan-components.mjs — Dead / orphaned frontend component CI guard.
 *
 * The #1 stale-file source: a component/page is built but nothing imports or
 * renders it (e.g. apps/frontend/src/pages/banking/components/BankingReviewCenter.tsx
 * was built for banking-categorization yet never wired — it *looked* done but
 * never ran). This guard makes NEW orphans impossible to accumulate.
 *
 * HOW IT WORKS
 *   1. Statically scans apps/frontend/src for every .ts/.tsx file and builds an
 *      import graph from static (`import … from`, `export … from`, side-effect
 *      `import "…"`), dynamic (`import("…")`) and lazy (`React.lazy(() =>
 *      import("…"))`) imports. Relative + tsconfig/vite alias paths are resolved.
 *   2. Computes REACHABILITY (transitive closure) from a set of ENTRYPOINTS:
 *      main.tsx, App.tsx, the route manifest(s), sidebar-config.ts, and every
 *      index.ts/index.tsx barrel. A file reachable from any entrypoint is LIVE.
 *   3. ORPHAN = a .tsx component/page file (NOT test/spec/story/.d.ts) that is
 *      not reachable and is not on the explicit allowlist.
 *
 * BASELINE PATTERN (so it merges without a massive cleanup)
 *   The current orphan set is stored in scripts/orphan-components-baseline.json.
 *   The guard PASSES when the current orphans are a subset of the baseline
 *   (no NEW orphans) — printing `new_vs_baseline=0`. It FAILS when a NEW orphan
 *   appears, naming it so it can be wired into a route/parent OR allowlisted.
 *   The baseline is a burn-down list: shrink it over time, never grow it.
 *
 * Non-financial tooling — auto-merge on green CI.
 *
 * Usage:
 *   node scripts/verify-orphan-components.mjs           # CI gate (exit 1 on a NEW orphan)
 *   node scripts/verify-orphan-components.mjs --update  # regenerate the baseline
 *   node scripts/verify-orphan-components.mjs --list    # print every current orphan, sorted
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps", "frontend", "src");
const BASELINE_PATH = path.join(ROOT, "scripts", "orphan-components-baseline.json");
const ALLOWLIST_PATH = path.join(ROOT, "scripts", "orphan-components-allowlist.json");

const UPDATE = process.argv.includes("--update");
const LIST = process.argv.includes("--list");

// tsconfig/vite path aliases (apps/frontend/tsconfig.app.json + vite.config.ts).
// Only aliases that could resolve INTO apps/frontend/src matter for the graph;
// the ones below all resolve OUTSIDE src (packages/, docs/) so imports through
// them are simply ignored (they never point at an orphan candidate).
const ALIASES = [
  { prefix: "@ih35/shared-types", target: path.join(ROOT, "packages", "shared-types", "src", "index.ts") },
  { prefix: "@ih35/shared-types/", target: path.join(ROOT, "packages", "shared-types", "src") + path.sep },
  { prefix: "@legal/", target: path.join(ROOT, "docs", "legal") + path.sep },
];

const CODE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];
const INDEX_FILES = CODE_EXTS.map((e) => "index" + e);

// ─── file discovery ──────────────────────────────────────────────────────────

/** Recursively collect every .ts/.tsx/.js file under a directory. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(full, out);
    } else if (CODE_EXTS.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative POSIX path (stable across machines / OSes). */
function rel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

// ─── import extraction ─────────────────────────────────────────────────────────

/** Strip line + block comments so commented-out imports are not counted. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const RE_FROM = /\bfrom\s*['"]([^'"]+)['"]/g; // import … from '…' / export … from '…'
const RE_DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g; // import('…') incl. React.lazy
const RE_SIDE_EFFECT = /\bimport\s+['"]([^'"]+)['"]/g; // import '…'

/** Extract every import specifier string from a source file. */
function extractSpecifiers(src) {
  const clean = stripComments(src);
  const specs = new Set();
  for (const re of [RE_FROM, RE_DYNAMIC, RE_SIDE_EFFECT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

// ─── module resolution ─────────────────────────────────────────────────────────

/** Try a base path with extension + index resolution. Returns abs path or null. */
function tryResolve(base) {
  // exact file (with extension already)
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  // base + ext
  for (const ext of CODE_EXTS) {
    const cand = base + ext;
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  // directory index
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const idx of INDEX_FILES) {
      const cand = path.join(base, idx);
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    }
  }
  return null;
}

/**
 * Resolve a specifier to an absolute code file, or null. Only returns a target
 * that is a code file (bare npm packages, css/json/asset imports → null).
 */
function resolveSpecifier(fromFile, spec) {
  // strip query/hash (e.g. `?raw`, `?worker`)
  const clean = spec.replace(/[?#].*$/, "");
  let base = null;

  if (clean.startsWith("./") || clean.startsWith("../")) {
    base = path.resolve(path.dirname(fromFile), clean);
  } else {
    for (const a of ALIASES) {
      if (a.prefix.endsWith("/") && clean.startsWith(a.prefix)) {
        base = path.join(a.target, clean.slice(a.prefix.length));
        break;
      }
      if (!a.prefix.endsWith("/") && clean === a.prefix) {
        base = a.target;
        break;
      }
    }
  }
  if (base === null) return null; // bare package or unknown alias → not a graph node

  const resolved = tryResolve(base);
  if (!resolved) return null;
  // only code files are graph nodes; assets (css/json/svg) resolve to null above
  if (!CODE_EXTS.includes(path.extname(resolved))) return null;
  return resolved;
}

// ─── candidate / classification helpers ────────────────────────────────────────

/** A .tsx file that is a real component/page candidate (not test/story/type). */
function isOrphanCandidate(abs) {
  const b = path.basename(abs);
  if (!b.endsWith(".tsx")) return false; // components/pages are .tsx
  if (b.endsWith(".d.ts")) return false;
  if (/\.(test|spec|stories)\.tsx$/.test(b)) return false;
  if (/(^|\/)__tests__(\/|$)/.test(rel(abs))) return false;
  if (/(^|\/)__mocks__(\/|$)/.test(rel(abs))) return false;
  return true;
}

/** Files seeded as reachability roots. */
function isEntrypoint(abs) {
  const relPath = rel(abs);
  const b = path.basename(abs);
  if (relPath === "apps/frontend/src/main.tsx") return true;
  if (relPath === "apps/frontend/src/App.tsx") return true;
  if (b === "sidebar-config.ts") return true;
  // route manifest(s): manifest*.tsx, routes*.tsx (any dir under src)
  if (/^manifest[^/]*\.tsx$/.test(b)) return true;
  if (/^routes?[^/]*\.tsx$/.test(b)) return true;
  // barrels: every index.ts / index.tsx is a public surface / commonly imported
  if (b === "index.ts" || b === "index.tsx") return true;
  return false;
}

// ─── build the graph ───────────────────────────────────────────────────────────

const files = walk(SRC);
const fileSet = new Set(files);

// adjacency: file -> [imported code files inside src (and reachable outside-src code)]
const edges = new Map();
for (const f of files) {
  let src;
  try {
    src = fs.readFileSync(f, "utf8");
  } catch {
    src = "";
  }
  const targets = [];
  for (const spec of extractSpecifiers(src)) {
    const resolved = resolveSpecifier(f, spec);
    if (resolved) targets.push(resolved);
  }
  edges.set(f, targets);
}

// ─── reachability BFS from entrypoints ─────────────────────────────────────────

const entrypoints = files.filter(isEntrypoint);
const reachable = new Set();
const queue = [...entrypoints];
for (const e of entrypoints) reachable.add(e);
while (queue.length) {
  const cur = queue.pop();
  for (const t of edges.get(cur) || []) {
    if (!reachable.has(t)) {
      reachable.add(t);
      // only keep traversing through nodes we actually indexed (inside src);
      // out-of-src code files have no outgoing edges recorded, harmlessly skipped
      if (edges.has(t)) queue.push(t);
    }
  }
}

// ─── allowlist ─────────────────────────────────────────────────────────────────

let allowlist = new Set();
if (fs.existsSync(ALLOWLIST_PATH)) {
  try {
    const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
    const arr = Array.isArray(raw) ? raw : raw.allow || raw.files || [];
    allowlist = new Set(arr);
  } catch (e) {
    console.error(`⚠️  could not parse ${rel(ALLOWLIST_PATH)}: ${e.message}`);
  }
}

// ─── current orphan set ────────────────────────────────────────────────────────

const orphans = files
  .filter(isOrphanCandidate)
  .filter((f) => !reachable.has(f))
  .map(rel)
  .filter((r) => !allowlist.has(r))
  .sort();

// ─── --list ────────────────────────────────────────────────────────────────────

if (LIST) {
  console.log(`Current orphan .tsx files (${orphans.length}):`);
  for (const o of orphans) console.log("  " + o);
  process.exit(0);
}

// ─── --update ──────────────────────────────────────────────────────────────────

if (UPDATE) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(orphans, null, 2) + "\n");
  console.log(`✓ wrote ${rel(BASELINE_PATH)} — baseline_count=${orphans.length}`);
  process.exit(0);
}

// ─── compare vs baseline ───────────────────────────────────────────────────────

let baseline = [];
if (fs.existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  } catch (e) {
    console.error(`❌ could not parse ${rel(BASELINE_PATH)}: ${e.message}`);
    process.exit(1);
  }
} else {
  console.error(`❌ missing baseline ${rel(BASELINE_PATH)} — run: node scripts/verify-orphan-components.mjs --update`);
  process.exit(1);
}

const baselineSet = new Set(baseline);
const newOrphans = orphans.filter((o) => !baselineSet.has(o));
const resolvedOrphans = baseline.filter((b) => !orphans.includes(b)); // burnt-down since baseline

console.log(`orphan-components guard: baseline_count=${baseline.length} current_count=${orphans.length} new_vs_baseline=${newOrphans.length}`);
if (resolvedOrphans.length) {
  console.log(`  ↓ ${resolvedOrphans.length} baseline orphan(s) resolved — run --update to burn them down.`);
}

if (newOrphans.length > 0) {
  console.error("");
  console.error(`❌ ${newOrphans.length} NEW orphaned component(s) — built but nothing imports/renders them:`);
  for (const o of newOrphans) console.error("   • " + o);
  console.error("");
  console.error("   Fix: wire it into a route/parent OR allowlist it.");
  console.error("     - wire: import & render it from a route (routes/manifest.tsx) or a live parent component");
  console.error(`     - allowlist (only for an intentional standalone entrypoint): add its path to ${rel(ALLOWLIST_PATH)}`);
  console.error("   Do NOT add it to the baseline — the baseline is a shrinking burn-down list, never grow it.");
  process.exit(1);
}

console.log("✓ no NEW orphaned components.");
process.exit(0);
