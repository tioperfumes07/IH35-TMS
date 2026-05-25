#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const STUB_RE = /(coming soon|not yet implemented|stub|placeholder|\blorem\b|foo bar)/i;
const TARGET_RE = /pages\/(maintenance|customers|eld|docs)\//;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(FRONTEND_ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const isTargetFile = TARGET_RE.test(rel) || rel.endsWith("pages/reports/ReportsRunner.tsx") || rel.endsWith("pages/home/HomePage.tsx");
  if (!isTargetFile) continue;
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.getText().replace(/\s+/g, " ").trim();
      if (text && STUB_RE.test(text)) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        violations.push(`${path.relative(ROOT, file)}:${pos.line + 1} contains stub text "${text}"`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
if (violations.length > 0) {
  console.error("verify:no-stub-strings failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log("verify:no-stub-strings: ok");
