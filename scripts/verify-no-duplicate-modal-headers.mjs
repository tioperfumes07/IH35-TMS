#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function isModalComponent(node) {
  if (!ts.isJsxElement(node)) return false;
  const tag = node.openingElement.tagName.getText();
  return tag.endsWith("Modal") || tag.endsWith("Drawer") || tag === "Modal";
}

function headingTextFromChild(node) {
  if (!ts.isJsxElement(node)) return null;
  const tag = node.openingElement.tagName.getText();
  if (!["h1", "h2", "h3"].includes(tag)) return null;
  const text = node.children.map((child) => (ts.isJsxText(child) ? child.getText() : "")).join(" ").trim().replace(/\s+/g, " ");
  return text || null;
}

const violations = [];
for (const file of walk(FRONTEND_ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (isModalComponent(node)) {
      const counts = new Map();
      for (const child of node.children) {
        const text = headingTextFromChild(child);
        if (!text) continue;
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
      for (const [text, count] of counts.entries()) {
        if (count > 1) {
          const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          violations.push(`${path.relative(ROOT, file)}:${pos.line + 1} duplicate modal heading "${text}"`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

if (violations.length > 0) {
  console.error("verify:no-duplicate-modal-headers failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log("verify:no-duplicate-modal-headers: ok");
