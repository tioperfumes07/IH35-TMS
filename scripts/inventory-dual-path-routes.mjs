#!/usr/bin/env node
/**
 * DUAL_PATH / OLD-vs-NEW mechanical scanner (owner GO 2026-07-22).
 *
 * Walks `apps/frontend/src/routes/manifest.tsx` for still-mounted `ComingSoonPage`
 * routes, and walks all of `apps/frontend/src` for `@deprecated` / `@archived`
 * tagged files, then classifies each tagged file by who still imports it:
 *
 *   MOUNTED_LIVE   — a non-archived, non-test file imports the tagged file
 *                    (candidate DUAL_PATH_OLD_ACTIVE / re-verify by hand)
 *   TEST_ONLY      — only `__tests__` / `.test.` / `.spec.` files import it
 *   SELF_CLUSTER   — only other @deprecated/@archived-tagged files import it
 *                    (an archived cluster referencing itself — mitigated)
 *   ORPHAN         — nothing imports it (dead file; safe to leave archived)
 *
 * This is a MECHANICAL sweep only — it does not know whether a "MOUNTED_LIVE"
 * hit is actually mitigated (e.g. imported only for a redirect comment) or
 * genuinely a live dual path. Every MOUNTED_LIVE hit MUST be opened by hand
 * before it is written into the curated audit doc as DUAL_PATH_OLD_ACTIVE.
 *
 * Regenerate: `node scripts/inventory-dual-path-routes.mjs`
 * Writes: docs/trackers/DUAL-PATH-SCAN-RAW-2026-07-22.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const MANIFEST = path.join(SRC, "routes/manifest.tsx");
const OUT = path.join(ROOT, "docs/trackers/DUAL-PATH-SCAN-RAW-2026-07-22.md");

const SKIP_DIR = new Set(["node_modules", "dist", "coverage", ".git"]);

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

const allFiles = walk(SRC);
const fileTextCache = new Map();
function textOf(p) {
  if (!fileTextCache.has(p)) fileTextCache.set(p, fs.readFileSync(p, "utf8"));
  return fileTextCache.get(p);
}

// ---------------------------------------------------------------------------
// 1. ComingSoonPage — every JSX mount site still reachable from the router.
// ---------------------------------------------------------------------------
const manifestText = textOf(MANIFEST);
const comingSoonHits = [];
{
  const lines = manifestText.split("\n");
  lines.forEach((line, idx) => {
    if (/ComingSoonPage/.test(line) && !/React\.lazy/.test(line)) {
      comingSoonHits.push({ line: idx + 1, text: line.trim() });
    }
  });
}

// Pull the nearest preceding `path="..."` for each ComingSoonPage JSX usage
// (best-effort — the JSX element and its `path=` prop can be several lines apart).
function nearestPathAbove(lineIdx) {
  const lines = manifestText.split("\n");
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 12); i--) {
    const m = lines[i].match(/path=["']([^"']+)["']/);
    if (m) return m[1];
  }
  return "(dynamic / unknown — inspect manually)";
}
/**
 * Escape a value for a single Markdown table cell.
 *
 * ORDER MATTERS — backslashes FIRST. The previous code did `.replace(/\|/g, "\\|")` only, so an
 * input containing a backslash produced broken output: "a\|b" became "a\\|b", where the backslash
 * escapes the backslash and the pipe stays live, splitting the row and shifting every later cell.
 * Raw JSX/source lines are full of backslashes (regex literals, escapes), so this silently produced
 * a STRUCTURALLY WRONG audit table — the exact failure mode an audit document must not have.
 * Newlines are collapsed for the same reason: a multi-line capture must not break the row.
 * (CodeQL js/incomplete-sanitization, 2 high-severity alerts.)
 */
function mdCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

const comingSoonRoutes = comingSoonHits
  .filter((h) => /<ComingSoonPage/.test(h.text) || /return\s*<ComingSoonPage/.test(h.text))
  .map((h) => ({ ...h, path: nearestPathAbove(h.line - 1) }));

// ---------------------------------------------------------------------------
// 2. @deprecated / @archived tagged files + importer classification.
// ---------------------------------------------------------------------------
const TAG_RE = /@(deprecated|archived)\b[^\n]*/;
const tagged = [];
for (const file of allFiles) {
  const text = textOf(file);
  const m = text.match(TAG_RE);
  if (!m) continue;
  // Only count top-of-file / near-top module-level tags as "this whole file is old",
  // not every inline @deprecated prop/jsdoc on a sub-export (still recorded, but flagged).
  const firstHitIdx = text.indexOf(m[0]);
  const linesBefore = text.slice(0, firstHitIdx).split("\n").length;
  tagged.push({
    path: rel(file),
    tag: m[0].trim().slice(0, 160),
    nearTop: linesBefore <= 6,
  });
}

const basenameNoExt = (p) => path.basename(p).replace(/\.(tsx|ts|jsx|js)$/, "");
function findImporters(taggedFile) {
  const base = basenameNoExt(taggedFile);
  const importers = [];
  const importRe = new RegExp(`from ["'][^"']*${base}["']`);
  for (const file of allFiles) {
    const r = rel(file);
    if (r === taggedFile) continue;
    if (importRe.test(textOf(file))) importers.push(r);
  }
  return importers;
}

const taggedPaths = new Set(tagged.map((t) => t.path));
const scanRows = tagged
  .filter((t) => t.nearTop)
  .map((t) => {
    const importers = findImporters(t.path);
    const isTest = (p) => /\.(test|spec)\.|\/__tests__\//.test(p);
    const liveImporters = importers.filter((p) => !isTest(p) && !taggedPaths.has(p));
    const testImporters = importers.filter(isTest);
    const clusterImporters = importers.filter((p) => taggedPaths.has(p) && !isTest(p));
    let verdict = "ORPHAN";
    if (liveImporters.length > 0) verdict = "MOUNTED_LIVE";
    else if (testImporters.length > 0 && clusterImporters.length === 0) verdict = "TEST_ONLY";
    else if (clusterImporters.length > 0) verdict = "SELF_CLUSTER";
    return {
      path: t.path,
      tag: t.tag,
      verdict,
      liveImporters,
      testImporters,
      clusterImporters,
    };
  })
  .sort((a, b) => a.verdict.localeCompare(b.verdict) || a.path.localeCompare(b.path));

const counts = {};
for (const row of scanRows) counts[row.verdict] = (counts[row.verdict] || 0) + 1;

// ---------------------------------------------------------------------------
// 3. Write the raw, mechanical, refreshable appendix.
// ---------------------------------------------------------------------------
const md = `# DUAL-PATH SCAN — RAW MECHANICAL SWEEP (2026-07-22)

Generated by \`scripts/inventory-dual-path-routes.mjs\`. This file is the **mechanical**
appendix to \`docs/trackers/DUAL-PATH-OLD-VS-NEW-DESIGN-AUDIT-2026-07-22.md\` — the curated
audit is hand-verified and cites specific rows from here; this file is safe to regenerate
at any time and will not match line-for-line after future PRs land (that is expected).

Regenerate: \`node scripts/inventory-dual-path-routes.mjs\`

## 1. \`ComingSoonPage\` mounts still reachable from \`manifest.tsx\`

Every JSX site where \`<ComingSoonPage />\` is actually rendered (excludes the \`React.lazy\`
import declaration line itself). Each row is a **candidate** \`COMING_SOON_STUB\` — verify by
hand whether a real tab/page already exists for that path before classifying.

| manifest.tsx line | Nearest \`path=\` above | Raw JSX line |
|---:|---|---|
${
  comingSoonRoutes
    .map((h) => `| ${h.line} | \`${h.path}\` | \`${mdCell(h.text)}\` |`)
    .join("\n") || "| — | — | none found |"
}

**Total \`<ComingSoonPage />\` JSX mounts:** ${comingSoonRoutes.length}

## 2. \`@deprecated\` / \`@archived\` tagged files — importer classification

Verdict legend:

- **MOUNTED_LIVE** — a non-archived, non-test file still imports this tagged file. **Open by
  hand** — this is the candidate list for real \`DUAL_PATH_OLD_ACTIVE\` rows.
- **SELF_CLUSTER** — only other tagged (@deprecated/@archived) files import it. Usually
  mitigated (an archived cluster referencing itself), but confirm the cluster itself has no
  live importer.
- **TEST_ONLY** — only \`__tests__\`/\`.test.\`/\`.spec.\` files import it (kept for regression
  coverage of the old behavior).
- **ORPHAN** — nothing in \`apps/frontend/src\` imports it. Safe to leave archived; do not
  delete (Rule 07).

| Verdict | Count |
|---|---:|
${Object.entries(counts)
  .sort()
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}
| **TOTAL tagged files** | **${scanRows.length}** |

| Path | Verdict | Tag (truncated) | Live importer(s) |
|---|---|---|---|
${scanRows
  .map(
    (r) =>
      `| \`${r.path}\` | ${r.verdict} | ${mdCell(r.tag)} | ${
        r.liveImporters.length ? r.liveImporters.map((p) => `\`${p}\``).join("<br>") : "—"
      } |`
  )
  .join("\n")}

## Method

1. \`ComingSoonPage\` mounts: regex scan of \`routes/manifest.tsx\` for JSX \`<ComingSoonPage />\`
   sites (excludes the lazy-import declaration), with a best-effort nearest-\`path=\`-above
   lookup (dynamic/param routes report \`(dynamic / unknown — inspect manually)\`).
2. \`@deprecated\`/\`@archived\` tags: scans all \`.ts\`/\`.tsx\`/\`.js\`/\`.jsx\` under
   \`apps/frontend/src\` for the literal tag string, keeping only tags within the first 6 lines
   of the file (module-level "this whole file is old" tags, not inline prop-level jsdoc).
3. Importer classification: for each tagged file, searches every other file in
   \`apps/frontend/src\` for \`from "...<basename>"\` and buckets importers into
   live / test / self-cluster.
4. **Known limitation:** basename matching can false-positive on same-named files in different
   directories (rare in this repo — verify by hand on any surprising MOUNTED_LIVE hit). Does
   not resolve dynamic \`import()\` behind runtime string concatenation, and does not walk the
   full transitive graph — only direct (one-hop) importers.
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log(`Wrote ${rel(OUT)} — ${comingSoonRoutes.length} ComingSoon mounts, ${scanRows.length} tagged files (${JSON.stringify(counts)})`);
