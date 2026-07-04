#!/usr/bin/env node
/**
 * G8-4 — Search/filter input accessible-name metric (INFORMATIONAL, non-failing).
 *
 * `eslint-plugin-jsx-a11y` is not installed in apps/frontend, and adding a new
 * dependency was out of scope for this fix. As a lightweight substitute this guard
 * statically counts search/filter `<input>` elements whose ONLY accessible-name hint
 * is a `placeholder` (a placeholder is NOT an accessible name per WCAG) and that lack
 * an `aria-label` / `aria-labelledby` / `id` (which could be paired with a <label>).
 *
 * It PRINTS the count as a burn-down metric and ALWAYS exits 0 — it never fails CI.
 * When the number trends toward zero, wiring the real eslint plugin becomes cheap.
 *
 * Usage: node scripts/verify-search-inputs-have-aria.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-search-inputs-have-aria";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps", "frontend", "src");

/** Heuristic: a placeholder that reads like a search/filter box. */
const SEARCH_HINT = /(search|filter|find|lookup|all\s|select\s)/i;

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

// Match an <input ...> opening tag (attributes may span multiple lines).
const INPUT_TAG = /<input\b[^>]*?\/?>/gis;

function isPlaceholderOnlySearchInput(tag) {
  const hasPlaceholder = /\splaceholder\s*=/.test(tag);
  if (!hasPlaceholder) return false;
  const placeholderMatch = tag.match(/placeholder\s*=\s*["'{]([^"'}]*)/i);
  const placeholderText = placeholderMatch ? placeholderMatch[1] : "";
  if (!SEARCH_HINT.test(placeholderText)) return false;
  const hasAccessibleName = /\s(aria-label|aria-labelledby|id)\s*=/.test(tag);
  return !hasAccessibleName;
}

function main() {
  const files = walk(SRC);
  let flagged = 0;
  const perFile = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const tags = source.match(INPUT_TAG) ?? [];
    const hits = tags.filter(isPlaceholderOnlySearchInput).length;
    if (hits > 0) {
      flagged += hits;
      perFile.push({ file: path.relative(ROOT, file), hits });
    }
  }

  perFile.sort((a, b) => b.hits - a.hits);
  console.log(`[${LABEL}] placeholder-only search/filter inputs without an accessible name: ${flagged}`);
  console.log(`[${LABEL}] files scanned: ${files.length}; files with findings: ${perFile.length}`);
  for (const row of perFile.slice(0, 20)) {
    console.log(`[${LABEL}]   ${row.hits}x  ${row.file}`);
  }
  if (perFile.length > 20) {
    console.log(`[${LABEL}]   ... and ${perFile.length - 20} more files`);
  }
  console.log(`[${LABEL}] INFORMATIONAL ONLY — this guard never fails CI (exit 0).`);
  process.exit(0);
}

main();
