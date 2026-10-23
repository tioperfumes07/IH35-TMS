#!/usr/bin/env node
/** 443.252 E3: new V3 components and changed components use the single token source.
 * AST scan ignores comments, includes style/template/Tailwind literals. --base adds
 * changed legacy components without imposing a made-up whole-repo baseline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import ts from 'typescript';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_FILE = 'apps/frontend/src/design/v3-tokens.ts';
const HEX = /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{4}\b|#[0-9a-f]{3}\b/ig;

export function scanTokens(file, source) {
  if (file === TOKEN_FILE) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (tree.parseDiagnostics.length) return [`${file}: parse error; token verification unavailable`];
  const problems = [];
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // URL fragments are not colors. CSS url() is deliberately still examined:
      // CSS can put a color and an image in the same background declaration.
      const text = node.text;
      if (!/^(?:https?:\/\/|\/[^\s]*#)/.test(text)) {
        for (const match of text.matchAll(HEX)) {
          const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
          problems.push(`${file}:${line}: literal ${match[0]} outside ${TOKEN_FILE}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return problems;
}

export function selftest() {
  const cases = [
    ['style hex', '<div style={{color:"#123456"}}/>', true],
    ['short hex', '<div style={{color:"#fff"}}/>', true],
    ['alpha hex', '<div style={{color:"#FFffFF80"}}/>', true],
    ['short alpha', '<div style={{color:"#abcd"}}/>', true],
    ['tailwind hex', '<div className="border-[#e5e7eb]"/>', true],
    ['template tail', '<div style={{border:`${width}px solid #123456`}}/>', true],
    ['template head', '<div style={{border:`#123456 ${width}px solid`}}/>', true],
    ['token member', '<div style={{color:V3.ink}}/>', false],
    ['css variable', '<div style={{color:"var(--ink)"}}/>', false],
    ['comment ignored', '// #123456\nconst color = V3.ink;', false],
    ['URL not color', '<a href="https://example.com/#abcdef">Source</a>', false],
    ['local fragment not color', '<a href="/docs#abcdef">Source</a>', false],
    ['not a hex color', 'const label = "#ABCDEF123456";', false],
  ];
  for (const [name, source, fails] of cases) {
    assert.equal(scanTokens('apps/frontend/src/components/v3/Test.tsx', source).length > 0, fails, name);
    console.log(`PASS ${name}`);
  }
  assert.deepEqual(scanTokens(TOKEN_FILE, 'export const V3={ink:"#123456"};'), []);
  assert.equal(scanTokens('apps/frontend/src/components/v3/fake-tokens.ts', 'const ink="#123456";').length, 1);
  console.log(`SELFTEST ${cases.length + 2}/${cases.length + 2} PASS; only the exact canonical token file is exempt`);
}

export function scanTree(root, base) {
  const files = new Set();
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file)) files.add(path.relative(root, file));
    }
  }
  walk(path.join(root, 'apps/frontend/src/components/v3'));
  if (base) {
    const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', base, '--', 'apps/frontend/src'], {cwd: root, encoding: 'utf8'});
    for (const file of changed.trim().split('\n')) {
      if (/\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file)) files.add(file);
    }
  }
  const problems = [...files].flatMap(file => scanTokens(file, fs.readFileSync(path.join(root, file), 'utf8')));
  if (!files.size) problems.push('No component sources inspected; NOT a coverage pass');
  return {files: files.size, problems};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const arg = name => {const i=process.argv.indexOf(name); if(i<0) return undefined; if(!process.argv[i+1]) throw new Error(`${name} requires a value`); return process.argv[i+1];};
    const result = scanTree(path.resolve(arg('--root') ?? ROOT), arg('--base'));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.problems.length ? 1 : 0;
  }
}
