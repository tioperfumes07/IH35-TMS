#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const BASE_RE = /qbo_archive|^undefined$|version=dev/i;
const QBO_ARCHIVE_SNAPSHOT_RE = /qbo_archive\.entities_snapshot/i;
const SNAKE_RE = /^[a-z]+_[a-z_]+$/;

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
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  function visit(node, parentTag = "") {
    let tag = parentTag;
    if (ts.isJsxElement(node)) {
      tag = node.openingElement.tagName.getText();
    }

    if (ts.isJsxText(node)) {
      const text = node.getText().replace(/\s+/g, " ").trim();
      if (!text) {
        ts.forEachChild(node, (c) => visit(c, tag));
        return;
      }
      const snakeHit = SNAKE_RE.test(text) && ["h1", "h2", "h3", "label", "th"].includes(tag);
      if (BASE_RE.test(text) || QBO_ARCHIVE_SNAPSHOT_RE.test(text) || snakeHit) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        violations.push(`${path.relative(ROOT, file)}:${pos.line + 1} internal string "${text}"`);
      }
    }

    if (ts.isStringLiteralLike(node)) {
      const text = node.text.trim();
      if (QBO_ARCHIVE_SNAPSHOT_RE.test(text)) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        violations.push(`${path.relative(ROOT, file)}:${pos.line + 1} internal string "${text}"`);
      }
    }

    ts.forEachChild(node, (c) => visit(c, tag));
  }

  visit(sf, "");
}

if (violations.length > 0) {
  console.error("verify:no-internal-strings failed");
  for (const v of violations) console.error(v);
  process.exit(1);
}
console.log("verify:no-internal-strings: ok");
