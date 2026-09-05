#!/usr/bin/env node
/**
 * LFI-20+ catalog list voided-toggle guard (owner 2026-09-05):
 * Every catalog list page that renders a ParityTable or DataTable must have a
 * "Show voided" or "Show inactive" toggle that is OFF by default (voided/inactive hidden).
 * Also verifies useCatalogQuery.ts has no `sortable: false` on labeled columns.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function listTsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsxFiles(full));
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const listsDir = resolve(ROOT, "apps/frontend/src/pages/lists");

// Exclude accounting/**, dispatch/**, and components/** subdirectories
function isExcluded(file) {
  const rel = relative(listsDir, file);
  return (
    rel.startsWith("accounting/") ||
    rel.startsWith("dispatch/") ||
    rel.startsWith("components/")
  );
}

const failures = [];
let checkedFiles = 0;

// --- Check 1: Every catalog list page with a table has a voided/inactive toggle ---
const allFiles = listTsxFiles(listsDir).filter((f) => !isExcluded(f));

for (const file of allFiles) {
  const src = readFileSync(file, "utf8");

  // Only check files that render a ParityTable or DataTable
  if (!/ParityTable|DataTable/.test(src)) continue;

  // Skip GenericCatalogPage itself — it delegates to CatalogTable which has the toggle
  if (/GenericCatalogPage/.test(file) && !/CatalogTable/.test(src)) continue;

  checkedFiles++;

  // Check for showVoided or showInactive state variable
  const hasShowVoided = /\bshowVoided\b/.test(src);
  const hasShowInactive = /\bshowInactive\b/.test(src);

  if (!hasShowVoided && !hasShowInactive) {
    failures.push(
      `${relative(ROOT, file)}: missing showVoided or showInactive state variable`
    );
    continue;
  }

  // Check for checkbox/toggle UI element
  const toggleVar = hasShowVoided ? "showVoided" : "showInactive";
  const hasCheckbox = new RegExp(
    `type="checkbox"[\\s\\S]*?checked=\\{${toggleVar}\\}`
  ).test(src);
  const hasCheckboxAlt = new RegExp(
    `checked=\\{${toggleVar}\\}[\\s\\S]*?type="checkbox"`
  ).test(src);

  if (!hasCheckbox && !hasCheckboxAlt) {
    failures.push(
      `${relative(ROOT, file)}: missing checkbox UI for ${toggleVar}`
    );
    continue;
  }

  // Check default is false
  const defaultFalseRegex = new RegExp(
    `useState\\(\\s*false\\s*\\).*${toggleVar}|${toggleVar}.*useState\\(\\s*false\\s*\\)`
  );
  const defaultFalseDirect = new RegExp(
    `\\[${toggleVar},\\s*set[A-Z]\\w*\\]\\s*=\\s*useState\\(\\s*false\\s*\\)`
  ).test(src);

  if (!defaultFalseDirect) {
    failures.push(
      `${relative(ROOT, file)}: ${toggleVar} must default to false (voided/inactive hidden by default)`
    );
  }
}

// --- Check 2: useCatalogQuery.ts has no sortable: false on labeled columns ---
const catalogQueryPath = resolve(ROOT, "apps/frontend/src/hooks/useCatalogQuery.ts");
const catalogQuerySrc = readFileSync(catalogQueryPath, "utf8");

// Find all column definitions with sortable: false that have a non-empty label
const columnRegex =
  /\{\s*key:\s*["'`]([^"'`]+)["'`]\s*,\s*label:\s*["'`]([^"'`]+)["'`][^}]*sortable:\s*false[^}]*\}/g;
let colMatch;
while ((colMatch = columnRegex.exec(catalogQuerySrc)) !== null) {
  const label = colMatch[2];
  if (label && label.trim() !== "") {
    failures.push(
      `useCatalogQuery.ts: column "${label}" (key: "${colMatch[1]}") has sortable: false but has a non-empty label`
    );
  }
}

if (failures.length) {
  console.error(
    `FAIL verify-catalog-lists-voided-toggle — ${failures.length} issue(s):`
  );
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(
  `PASS verify-catalog-lists-voided-toggle — ${checkedFiles} catalog list page(s) have voided/inactive toggle OFF by default; useCatalogQuery.ts has no sortable: false on labeled columns (LFI-20+)`
);
