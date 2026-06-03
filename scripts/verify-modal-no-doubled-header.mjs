#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/Modal\.tsx$/.test(entry.name) && entry.name !== "Modal.tsx") out.push(p);
  }
  return out;
}

const violations = [];

for (const file of walk(FRONTEND_ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);

  const usesSharedModal = /<Modal[\s>]/.test(source) || /from\s+["'][^"']*\/Modal["']/.test(source);
  if (!usesSharedModal) continue;

  if (/<h2[\s>]/.test(source)) {
    violations.push(`${rel}: shared Modal + inner <h2> (doubled header pattern)`);
  }

  const titleMatch = source.match(/<Modal[^>]*\btitle=\{?["'`]([^"'`$]+)/);
  if (titleMatch) {
    const titleText = titleMatch[1].trim();
    const innerHeading = [...source.matchAll(/<h[1-3][^>]*>([^<{]+)</g)]
      .map((m) => m[1].trim().replace(/\s+/g, " "))
      .find((text) => text && text.toLowerCase() === titleText.toLowerCase());
    if (innerHeading) {
      violations.push(`${rel}: Modal title duplicates inner heading "${innerHeading}"`);
    }
  }
}

if (violations.length > 0) {
  console.error("verify:modal-no-doubled-header failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}

console.log("verify:modal-no-doubled-header: ok");
