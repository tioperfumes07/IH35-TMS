#!/usr/bin/env node
/**
 * C1-4 CI guard — archived components stay OUT of the active tree.
 *
 * Per the ADDITIVE-ONLY / ARCHIVE-never-DELETE rule, genuinely-dead frontend components
 * (zero live importers) are moved into `apps/frontend/src/components/_archived/` so they are
 * preserved for rollback but no longer part of the active dependency graph. This guard locks that
 * in: NO live source file may `import` anything from an `_archived/` directory. If a future change
 * re-wires an archived component back into the live tree, that import belongs at the component's
 * real home, not under `_archived/` — this guard fails the build (exit 1) so the dead file gets
 * un-archived properly instead of the app depending on an "archived" path.
 *
 * Files INSIDE `_archived/` may import each other (an archived modal importing its archived
 * sub-section is fine) — only imports that ORIGINATE outside `_archived/` are flagged.
 *
 * Usage:
 *   node scripts/verify-no-archived-imports.mjs            # CI gate
 *   node scripts/verify-no-archived-imports.mjs --selftest # verify the guard catches a seeded import
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "apps", "frontend", "src");

// Matches an import/export-from specifier that resolves into an `_archived/` directory,
// e.g.  import { X } from "../../components/_archived/Foo";
//       export { Y } from "./_archived/bar";
const ARCHIVED_SPECIFIER = /(?:import|export)\b[^;\n]*?\bfrom\s*["'][^"']*\/_archived\//;
// Also catch bare side-effect / dynamic imports into _archived.
const ARCHIVED_DYNAMIC = /import\s*\(\s*["'][^"']*\/_archived\//;

function isInsideArchived(relPath) {
  return relPath.split(sep).includes("_archived");
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function scanContent(relPath, content) {
  // Files inside _archived/ are allowed to reference each other.
  if (isInsideArchived(relPath)) return [];
  const hits = [];
  for (const line of content.split("\n")) {
    if (ARCHIVED_SPECIFIER.test(line) || ARCHIVED_DYNAMIC.test(line)) {
      hits.push(line.trim());
    }
  }
  return hits;
}

function runSelfTest() {
  const seeded = 'import { BookLoadModalV3Deprecated } from "../../components/_archived/BookLoadModalV3Deprecated";';
  const outsideHits = scanContent(join("apps", "frontend", "src", "pages", "x", "Live.tsx"), seeded);
  const insideHits = scanContent(join("apps", "frontend", "src", "components", "_archived", "A.tsx"), seeded);
  if (outsideHits.length !== 1) {
    console.error("SELFTEST FAIL: guard did not flag a live import from _archived/");
    process.exit(1);
  }
  if (insideHits.length !== 0) {
    console.error("SELFTEST FAIL: guard wrongly flagged an intra-_archived import");
    process.exit(1);
  }
  console.log("verify:no-archived-imports — SELFTEST OK (flags live import, allows intra-archived)");
  process.exit(0);
}

function main() {
  if (process.argv.includes("--selftest")) return runSelfTest();

  const violations = [];
  for (const file of walk(SRC)) {
    const relPath = relative(ROOT, file);
    const hits = scanContent(relPath, readFileSync(file, "utf8"));
    for (const hit of hits) violations.push({ file: relPath.split(sep).join("/"), line: hit });
  }

  if (violations.length > 0) {
    console.error(
      `verify:no-archived-imports — FAIL: ${violations.length} live file(s) import from _archived/ ` +
        "(archived components must not be wired into the active tree; un-archive the file to its real home instead):",
    );
    for (const v of violations) console.error(`  ${v.file}: ${v.line}`);
    process.exit(1);
  }

  console.log("verify:no-archived-imports — OK (no live imports from _archived/)");
}

main();
