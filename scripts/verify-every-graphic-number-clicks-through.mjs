#!/usr/bin/env node
/** Round 443.248 / 443.252: static drill contract, NOT live total/route parity proof.
 * Parse JSX (never proximity-match a sibling link). Reject unresolvable destinations;
 * a dashboard tab alone does not reproduce a value's underlying population.
 * --root permits read-only inspection of a concurrent UI checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALUE_COMPONENTS = new Set(['V3KpiTile', 'V3Bar']);
// Only parameters observed at the destination consumer may certify a static scope.
// BillsPage.tsx:252-305. Other destinations remain UNVERIFIED, not guessed valid.
const ROUTE_FILTERS = new Map([['/accounting/bills', new Set([
  'bill_id', 'status', 'has_balance', 'aging_bucket', 'vendor_id',
  'insurance_claim_id', 'legal_matter_id', 'unit_id', 'load_id',
])]]);

export function destinationProblem(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return 'destination must be an internal route';
  const url = new URL(value, 'https://app.invalid');
  if (url.hash && !url.search) return 'anchor alone is not a record/filter destination';
  const record = /\/(?:loads|drivers|units|customers|vendors|invoices|bills|settlements|work-orders|files)\/[^/]+$/.test(url.pathname);
  const filter = [...url.searchParams].some(([key, val]) => ROUTE_FILTERS.get(url.pathname)?.has(key) && val.trim() !== '');
  if (!record && !filter) return 'destination lacks record identity or population filter (tab/view alone is insufficient)';
  return null;
}

export function scanSource(source, file = 'board.tsx') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems = [];
  let values = 0;
  const add = (node, reason) => problems.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${reason}`);
  if (tree.parseDiagnostics.length) {
    return { values, problems: [`${file}: JSX parse failed; cannot verify click-through`] };
  }
  const valueNames = new Set(VALUE_COMPONENTS);
  for (const statement of tree.statements) {
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : null;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if (VALUE_COMPONENTS.has(binding.propertyName?.text ?? binding.name.text)) valueNames.add(binding.name.text);
      }
    }
  }
  function resolve(node, depth = 0) {
    if (!node || depth > 8) return null;
    if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node)) return resolve(node.expression, depth + 1);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isConditionalExpression(node)) {
      const a = resolve(node.whenTrue, depth + 1), b = resolve(node.whenFalse, depth + 1);
      return a && b ? [...a, ...b] : null;
    }
    // Preserve dynamic field placeholders, but only in literal route templates. Their
    // existence/consumer behavior still requires live parity; do not invent their value.
    if (ts.isTemplateExpression(node)) {
      let route = node.head.text;
      for (const span of node.templateSpans) route += '{dynamic}' + span.literal.text;
      return [route];
    }
    // Deliberately fail closed on helper calls/identifiers until a route contract is
    // available. Seeing navigate() somewhere in the file proves nothing about this cell.
    return null;
  }
  function element(node) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(tree);
    const attrs = new Map(opening.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(tree), a]));
    const numericPrimitive = valueNames.has(tag);
    const explicitValue = attrs.has('data-graphic-value');
    const chart = ['polyline', 'Bar', 'Line', 'Pie', 'Area', 'Scatter'].includes(tag) ||
      (/^[A-Z]/.test(tag) && ['data', 'series', 'points'].some(key => attrs.has(key)));
    function containsJsx(expression) {
      let found = false;
      function inspect(child) {
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) found = true;
        else ts.forEachChild(child, inspect);
      }
      inspect(expression);
      return found;
    }
    const valueExpressions = ts.isJsxElement(node) ? node.children.filter(ts.isJsxExpression).filter(n =>
      n.expression && !containsJsx(n.expression) &&
      (ts.isNumericLiteral(n.expression) || /(?:amount|cents|count|total|balance|money|formatInt|formatMoney|\.length\b)/i.test(n.expression.getText(tree)))) : [];
    const numericText = ts.isJsxElement(node) && node.children.some(n => ts.isJsxText(n) && /^\$?-?[\d,.]+%?$/.test(n.text.trim()));
    if (!numericPrimitive && !explicitValue && !chart && !numericText && !valueExpressions.length) return;
    values++;
    let owner = node;
    let destination;
    let disabled = false;
    while (owner && !ts.isSourceFile(owner)) {
      if (ts.isJsxElement(owner) || ts.isJsxSelfClosingElement(owner)) {
        const el = ts.isJsxElement(owner) ? owner.openingElement : owner;
        const p = new Map(el.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(tree), a]));
        const name = el.tagName.getText(tree);
        const disabledProp = p.get('disabled');
        const disabledExpr = disabledProp?.initializer;
        if (disabledProp && !(disabledExpr && ts.isJsxExpression(disabledExpr) &&
          disabledExpr.expression?.kind === ts.SyntaxKind.FalseKeyword)) disabled = true;
        const dest = valueNames.has(name) ? p.get('href') :
          name === 'Link' || name === 'NavLink' ? p.get('to') : name === 'a' ? p.get('href') : null;
        if (dest) { destination = resolve(dest.initializer); break; }
      }
      // A primitive owns its own href contract; an outer link cannot repair it.
      if (numericPrimitive) break;
      owner = owner.parent;
    }
    if (disabled) add(opening, 'numeric drill is disabled');
    if (!destination) add(opening, `${tag}: missing or statically unresolved drill route; requires explicit record/filter contract`);
    else for (const route of destination) {
      const issue = destinationProblem(route);
      if (issue) add(opening, `${tag}: ${issue}: ${route}`);
    }
  }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) element(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { values, problems };
}

export function selftest() {
  const cases = [
    ['filtered KPI', '<V3KpiTile value={money(total)} href="/accounting/bills?status=partially_paid" />', false],
    ['dead KPI', '<V3KpiTile value={money(total)} />', true],
    ['dead bar', '<V3Bar value={money(total)} />', true],
    ['unfiltered bar', '<V3Bar value={money(total)} href="/cash-flow?tab=rolling_ledger" />', true],
    ['empty filter', '<V3KpiTile value="1" href="/accounting/bills?status=" />', true],
    ['unresolved helper', '<V3KpiTile value="1" href={homeHref("rolling_ledger")} />', true],
    ['record drill', '<V3Bar value="1" href={`/dispatch/loads/${row.id}`} />', false],
    ['conditional missing scope', '<V3Bar value="1" href={id ? `/dispatch/loads/${id}` : "/cash-flow"} />', true],
    ['external URL', '<V3KpiTile value="1" href="https://example.com/bills?id=1" />', true],
    ['protocol relative', '<V3KpiTile value="1" href="//example.com/bills?id=1" />', true],
    ['anchor', '<V3KpiTile value="1" href="/bills#all" />', true],
    ['plain money', '<span>{money(total)}</span>', true],
    ['sibling never lends link', '<><a href="/bills?status=open">Bills</a><span>{money(total)}</span></>', true],
    ['nested amount link', '<Link to="/accounting/bills?status=open"><span>{money(total)}</span></Link>', false],
    ['comments do not count', '{/* <V3KpiTile value="1" /> */}', false],
    ['disabled drill', '<Link disabled to="/bills?status=open">{money(total)}</Link>', true],
    ['plain count', '<span>{rows.length /* count */}</span>', true],
    ['explicit arbitrary numeric', '<span data-graphic-value>{n}</span>', true],
    ['outer link cannot repair KPI', '<Link to="/accounting/bills?status=open"><V3KpiTile value="1" /></Link>', true],
    ['disabled false is usable', '<Link disabled={false} to="/accounting/bills?status=open">{money(total)}</Link>', false],
    ['unknown filter consumer', '<V3Bar value="1" href="/cash-flow?date=2026-10-22" />', true],
    ['unsupported filter key', '<V3Bar value="1" href="/accounting/bills?madeup=open" />', true],
    ['chart data cannot escape', '<Chart data={[{total:42}]} />', true],
    ['svg series cannot escape', '<polyline points={points} />', true],
    ['map container is not another value', '<>{rows.map(row => <Link to={`/dispatch/loads/${row.id}`}>{money(row.total)}</Link>)}</>', false],
    ['bare mapped money is not ignored', '<span>{rows.map(row => money(row.total))}</span>', true],
    ['filtered aggregate is not ignored', '<span>{rows.filter(isOpen).length}</span>', true],
    ['numeric literal expression', '<span>{42}</span>', true],
    ['numeric text', '<span>$1,200.00</span>', true],
    ['renamed import cannot evade', 'import {V3KpiTile as Metric} from "../V3Kit"; const x=<Metric value="1" />;', true],
    ['renamed import valid scope', 'import {V3KpiTile as Metric} from "../V3Kit"; const x=<Metric value="1" href="/accounting/bills?status=open" />;', false],
  ];
  for (const [name, source, fails] of cases) {
    assert.equal(scanSource(source).problems.length > 0, fails, name);
    console.log(`PASS ${name}`);
  }
  console.log(`SELFTEST ${cases.length}/${cases.length} PASS; missing route/filter and dead-number mutations refused`);
}

export function scanTree(root) {
  const dir = path.join(root, 'apps/frontend/src/components/v3/boards');
  const files = [];
  function walk(base) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const name = path.join(base, entry.name);
      if (entry.isDirectory()) walk(name);
      else if (name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(name)) files.push(name);
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  if (!files.length) return { files: 0, values: 0, problems: ['No V3 board sources found; coverage unavailable, NOT a pass'] };
  const results = files.map(file => scanSource(fs.readFileSync(file, 'utf8'), path.relative(root, file)));
  return { files: files.length, values: results.reduce((n, r) => n + r.values, 0), problems: results.flatMap(r => r.problems) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const index = process.argv.indexOf('--root');
    if (index >= 0 && !process.argv[index + 1]) throw new Error('--root requires a path');
    const result = scanTree(index >= 0 ? path.resolve(process.argv[index + 1]) : ROOT);
    console.log(JSON.stringify(result, null, 2));
    console.log('Static contract only. Route existence, applied filters, and matching totals require live read-back.');
    process.exitCode = result.problems.length ? 1 : 0;
  }
}
