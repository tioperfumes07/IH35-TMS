#!/usr/bin/env node
/**
 * verify-help-module-guides-visible.mjs
 *
 * GUARD 2026-07-16: Help "Module Guides" articles must appear in HelpCenterPage CATEGORY_ORDER.
 * Content was authored but unreachable because the category was omitted from the render list.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/help/HelpCenterPage.tsx");
const CONTENT = path.join(ROOT, "apps/frontend/src/help/helpCenterContent.ts");
const LABEL = "verify-help-module-guides-visible";

const failures = [];
if (!fs.existsSync(PAGE)) failures.push("missing HelpCenterPage.tsx");
if (!fs.existsSync(CONTENT)) failures.push("missing helpCenterContent.ts");

if (!failures.length) {
  const page = fs.readFileSync(PAGE, "utf8");
  const content = fs.readFileSync(CONTENT, "utf8");
  if (!/"Module Guides"/.test(content)) {
    failures.push('helpCenterContent.ts must define "Module Guides" category');
  }
  if (!/CATEGORY_ORDER[\s\S]*"Module Guides"/.test(page)) {
    failures.push('HelpCenterPage CATEGORY_ORDER must include "Module Guides"');
  }
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Module Guides category is visible in Help center`);
process.exit(0);
