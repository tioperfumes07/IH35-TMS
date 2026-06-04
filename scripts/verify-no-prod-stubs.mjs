#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const SKIP_RE = /(\/__tests__\/|\.test\.(tsx|ts)$|\.deprecated\.|test-setup\.ts$)/;
const STUB_RE =
  /(coming soon|lorem ipsum|phase\s*\d+\s*stub|contract stub|stub mode|\(stub\)|save link \(stub\)|phase\s*\d+\s*placeholder|not yet implemented)/i;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|jsx)$/.test(entry.name) && !SKIP_RE.test(p.replace(/\\/g, "/"))) out.push(p);
  }
  return out;
}

function recordViolation(file, sf, node, text, violations) {
  if (!text || !STUB_RE.test(text)) return;
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  violations.push(`${path.relative(ROOT, file)}:${pos.line + 1} forbidden stub copy "${text.slice(0, 72)}"`);
}

const violations = [];
for (const file of walk(FRONTEND_ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.getText().replace(/\s+/g, " ").trim();
      recordViolation(file, sf, node, text, violations);
    }
    if (ts.isStringLiteral(node)) {
      if (ts.isJsxAttribute(node.parent)) {
        recordViolation(file, sf, node, node.text, violations);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

if (violations.length > 0) {
  console.error("verify:no-prod-stubs failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log("verify:no-prod-stubs: ok");
