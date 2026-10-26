#!/usr/bin/env node
/** Round 443.248 / 443.252: static drill contract, NOT live total/route parity proof.
 * Parse JSX (never proximity-match a sibling link). Reject unresolvable destinations;
 * a dashboard tab alone does not reproduce a value's underlying population.
 * --root permits read-only inspection of a concurrent UI checkout.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALUE_COMPONENTS = new Set(['V3KpiTile', 'V3Bar']);
// MoneyCell (components/shared/MoneyCell.tsx) owns its contract through the REQUIRED drill prop:
// entity (the one record) | amount (the exact list it sums) | none (a stated reason, counted below).
const MONEY_CELL = 'MoneyCell';
// Link wrappers whose source is checked every run (wrapperProblems): <NumLink to> renders <Link to={to}>.
const LINK_WRAPPERS = new Map([['NumLink', 'to']]);
// Route helpers whose return values are checked every run (helperProblems): every return is /drivers/${driverId}…
const ROUTE_HELPERS = new Map([['driverProfileTabHref', '/drivers/{dynamic}']]);
// Boards scanned. The pre-2026-10-25 path (components/v3/boards) never existed on main, so this guard
// scanned nothing; components/boards is where the boards live.
export const BOARDS_DIR = 'apps/frontend/src/components/boards';
// Declared no-drill values (MoneyCell drill.none / V3KpiTile noDrill, each with a written reason). SHRINK-ONLY:
// measured 2026-10-25 after the 31 dead values were fixed. A new declaration must replace a drill-less value,
// never add to the count — build the destination filter instead.
export const DECLARED_NO_DRILL_CEILING = 8;
// Only parameters observed at the destination consumer may certify a static scope.
// BillsPage.tsx:252-305. Other destinations remain UNVERIFIED, not guessed valid.
const ROUTE_FILTERS = new Map([
  ['/accounting/bills', new Set([
    'bill_id', 'status', 'has_balance', 'aging_bucket', 'vendor_id',
    'insurance_claim_id', 'legal_matter_id', 'unit_id', 'load_id',
  ])],
  // Board filters held in the URL. Each consumer is re-checked every run (consumerProblems).
  ['/vendors', new Set(['chip'])],
  ['/customers', new Set(['chip'])],
  ['/drivers', new Set(['status'])],
]);
export const FILTER_CONSUMERS = [
  { route: '/vendors', key: 'chip', file: 'apps/frontend/src/components/boards/VendorsHomeBoard.tsx' },
  { route: '/customers', key: 'chip', file: 'apps/frontend/src/components/boards/PartyBoard.tsx' },
  { route: '/drivers', key: 'status', file: 'apps/frontend/src/components/boards/DriverHubBoard.tsx' },
];
export function consumerProblems(readText) {
  const problems = [];
  for (const c of FILTER_CONSUMERS) {
    const text = readText(c.file);
    if (text == null) problems.push(`filter consumer missing: ${c.file} (${c.route}?${c.key}=)`);
    else if (!new RegExp(`\\.get\\(\\s*["']${c.key}["']\\s*\\)`).test(text)) {
      problems.push(`${c.file} no longer reads ?${c.key}= — ${c.route}?${c.key}= links would not reproduce their number`);
    }
  }
  return problems;
}
export function helperProblems(tabsSource) {
  const body = /export function driverProfileTabHref\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(tabsSource ?? '');
  if (!body) return ['driverProfileTabHref not found — the /drivers/{id} route-helper contract cannot be checked'];
  const returns = [...body[1].matchAll(/return\s+([^;]+);/g)].map(m => m[1].trim());
  if (!returns.length || returns.some(r => !r.startsWith('`/drivers/${driverId}'))) {
    return ['driverProfileTabHref returns something other than `/drivers/${driverId}…` — its route contract changed'];
  }
  return [];
}
export function wrapperProblems(kitSource) {
  return /export function NumLink\(\{\s*to,[^)]*\)[^{]*\{\s*return\s*<Link to=\{to\}/.test(kitSource ?? '')
    ? [] : ['NumLink no longer renders <Link to={to}> — it cannot certify a drill'];
}

export function destinationProblem(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return 'destination must be an internal route';
  const url = new URL(value, 'https://app.invalid');
  if (url.hash && !url.search) return 'anchor alone is not a record/filter destination';
  // SettlementsPage consumes these record keys only on the company_driver view.
  // A generic id, tab-only link, or a key on another tab is not a statement drill.
  if (url.pathname === '/driver-finance/settlements') {
    const statement = url.searchParams.get('tab') === 'company_driver';
    const identity = ['settlement_id', 'company_settlement_id'].some(key =>
      (url.searchParams.get(key) ?? '').trim() !== '');
    return statement && identity ? null : 'settlement drill requires company_driver tab and a consumed settlement identity';
  }
  const record = /\/(?:loads|drivers|units|customers|vendors|invoices|bills|settlements|work-orders|files|chart-of-accounts\/register)\/[^/]+$/.test(url.pathname);
  const filter = [...url.searchParams].some(([key, val]) => ROUTE_FILTERS.get(url.pathname)?.has(key) && val.trim() !== '');
  if (!record && !filter) return 'destination lacks record identity or population filter (tab/view alone is insufficient)';
  return null;
}

export function scanSource(source, file = 'board.tsx') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems = [];
  const declared = [];
  let values = 0;
  const add = (node, reason) => problems.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${reason}`);
  if (tree.parseDiagnostics.length) {
    return { values, declared, problems: [`${file}: JSX parse failed; cannot verify click-through`] };
  }
  const valueNames = new Set(VALUE_COMPONENTS);
  const moneyNames = new Set([MONEY_CELL]);
  for (const statement of tree.statements) {
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : null;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        const original = binding.propertyName?.text ?? binding.name.text;
        if (VALUE_COMPONENTS.has(original)) valueNames.add(binding.name.text);
        if (original === MONEY_CELL) moneyNames.add(binding.name.text);
      }
    }
  }
  const literalText = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  const reasonOf = (n) => {
    const raw = n && ts.isJsxExpression(n) ? n.expression : n;
    const text = literalText(raw);
    return text && text.trim().length >= 12 ? text.trim() : null;
  };
  function moneyDrill(attr) {
    const e = attr?.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : null;
    if (!e || !ts.isObjectLiteralExpression(e)) return { problem: 'MoneyCell drill must be an inline {entity|amount|none} object' };
    const prop = (o, n) => o.properties.find(q => ts.isPropertyAssignment(q) && q.name.getText(tree) === n);
    const ent = prop(e, 'entity'), amt = prop(e, 'amount'), none = prop(e, 'none');
    if (ent) {
      const o = ent.initializer;
      const kind = ts.isObjectLiteralExpression(o) ? literalText(prop(o, 'kind')?.initializer) : null;
      return kind && ts.isObjectLiteralExpression(o) && prop(o, 'id') ? {} : { problem: 'MoneyCell entity drill needs a literal kind and an id' };
    }
    if (amt) {
      const o = amt.initializer;
      const target = ts.isObjectLiteralExpression(o) ? literalText(prop(o, 'target')?.initializer) : null;
      return target ? {} : { problem: 'MoneyCell amount drill needs an inline filter with a literal target' };
    }
    if (none) {
      const reason = reasonOf(none.initializer);
      return reason ? { declared: reason } : { problem: 'MoneyCell drill.none needs a stated literal reason (12+ chars)' };
    }
    return { problem: 'MoneyCell drill names no entity, amount or none' };
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
    // A route helper whose return values helperProblems() checks every run.
    if (ts.isCallExpression(node) && ROUTE_HELPERS.has(node.expression.getText(tree))) return [ROUTE_HELPERS.get(node.expression.getText(tree))];
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
    // A fragment's children are figures too: `<>{usd(x)} ({int(n)})</>` must not escape because it has no tag.
    const isFragment = ts.isJsxFragment(node);
    const withChildren = ts.isJsxElement(node) || isFragment;
    const opening = isFragment ? node.openingFragment : ts.isJsxElement(node) ? node.openingElement : node;
    const tag = isFragment ? 'fragment' : opening.tagName.getText(tree);
    const attrs = isFragment ? new Map() : new Map(opening.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(tree), a]));
    if (moneyNames.has(tag)) {
      values++;
      const verdict = moneyDrill(attrs.get('drill'));
      if (verdict.problem) add(opening, `${tag}: ${verdict.problem}`);
      if (verdict.declared) declared.push(`${file}:${tree.getLineAndCharacterOfPosition(opening.getStart(tree)).line + 1}: ${verdict.declared}`);
      return;
    }
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
    // `count` must not match inside `account` (account_name is a label, not a number).
    const VALUE_RE = /(?:amount|cents|(?<![Aa]c)count|total|balance|money|formatInt|formatMoney|\.length\b)/i;
    // A caption that counts the rows of a table rendered from the SAME binding in this file (`{int(rows.length)}
    // drivers` over `<ParityTable rows={rows}>`) states the size of the list on screen; the list is its drill.
    const captionOf = (text) => {
      const m = /^(?:(?:int|formatInt|formatNumberTable)\(\s*)?([\w.]+)\.length\s*\)?$/.exec(text);
      return m && new RegExp(`\\brows=\\{\\s*${m[1].replace(/\./g, '\\.')}\\s*\\}`).test(source) ? m[1] : null;
    };
    // Judge what the expression RENDERS, not its condition: `{n.count > 0 ? "has rows" : null}` shows text.
    const rendersFigure = (e) => {
      if (!e) return false;
      if (ts.isParenthesizedExpression(e)) return rendersFigure(e.expression);
      if (ts.isConditionalExpression(e)) return rendersFigure(e.whenTrue) || rendersFigure(e.whenFalse);
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return rendersFigure(e.right);
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || e.kind === ts.SyntaxKind.NullKeyword) return false;
      if (ts.isNumericLiteral(e)) return true;
      const text = e.getText(tree).trim();
      return VALUE_RE.test(text) && !captionOf(text);
    };
    const valueExpressions = withChildren ? node.children.filter(ts.isJsxExpression).filter(n =>
      n.expression && !containsJsx(n.expression) && rendersFigure(n.expression)) : [];
    // Numeric text must contain a digit: a lone "." after an expression is punctuation, not a figure.
    const numericText = withChildren && node.children.some(n => ts.isJsxText(n) && /^\$?-?[\d,.]+%?$/.test(n.text.trim()) && /\d/.test(n.text));
    if (!numericPrimitive && !explicitValue && !chart && !numericText && !valueExpressions.length) return;
    values++;
    let owner = node;
    let destination;
    let disabled = false;
    let declaredReason = null;
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
          name === 'Link' || name === 'NavLink' ? p.get('to') : LINK_WRAPPERS.has(name) ? p.get(LINK_WRAPPERS.get(name)) :
          name === 'a' ? p.get('href') : null;
        if (dest) { destination = resolve(dest.initializer); break; }
        if (valueNames.has(name) && name === tag) {
          const reason = reasonOf(p.get('noDrill')?.initializer);
          if (reason) { declaredReason = reason; break; }
        }
      }
      // A primitive owns its own href contract; an outer link cannot repair it.
      if (numericPrimitive) break;
      owner = owner.parent;
    }
    if (disabled) add(opening, 'numeric drill is disabled');
    if (declaredReason && !destination) {
      declared.push(`${file}:${tree.getLineAndCharacterOfPosition(opening.getStart(tree)).line + 1}: ${declaredReason}`);
      return;
    }
    if (!destination) add(opening, `${tag}: missing or statically unresolved drill route; requires explicit record/filter contract`);
    else for (const route of destination) {
      const issue = destinationProblem(route);
      if (issue) add(opening, `${tag}: ${issue}: ${route}`);
    }
  }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) element(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { values, declared, problems };
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
    ['settlement statement', '<V3Bar value="1" href="/driver-finance/settlements?tab=company_driver&settlement_id=abc" />', false],
    ['company statement', '<V3Bar value="1" href="/driver-finance/settlements?tab=company_driver&company_settlement_id=abc" />', false],
    ['settlement tab alone', '<V3Bar value="1" href="/driver-finance/settlements?tab=company_driver" />', true],
    ['settlement generic id ignored', '<V3Bar value="1" href="/driver-finance/settlements?tab=company_driver&id=abc" />', true],
    ['settlement wrong tab', '<V3Bar value="1" href="/driver-finance/settlements?tab=disputes&settlement_id=abc" />', true],
    ['settlement empty id', '<V3Bar value="1" href="/driver-finance/settlements?tab=company_driver&settlement_id=" />', true],
    ['MoneyCell record drill', '<MoneyCell cents={c} drill={{ entity: { kind: "customer", id: r.id } }} />', false],
    ['MoneyCell amount drill', '<MoneyCell cents={c} drill={{ amount: { target: "bills", hasBalance: true } }} />', false],
    ['MoneyCell stated none', '<MoneyCell cents={c} drill={{ none: "Faro debtors have no record page" }} />', false],
    ['MoneyCell without drill', '<MoneyCell cents={c} />', true],
    ['MoneyCell empty none', '<MoneyCell cents={c} drill={{ none: "" }} />', true],
    ['MoneyCell dynamic kind', '<MoneyCell cents={c} drill={{ entity: { kind: p.kind, id: p.id } }} />', true],
    ['MoneyCell drill by variable', '<MoneyCell cents={c} drill={d} />', true],
    ['NumLink record', '<NumLink to={`/vendors/${r.id}`}>{usd(r.spend_cents)}</NumLink>', false],
    ['NumLink unresolved', '<NumLink to={x}>{usd(r.spend_cents)}</NumLink>', true],
    ['route helper', '<Link to={driverProfileTabHref(id, "Settlements")}>{money(c)}</Link>', false],
    ['account register record', '<Link to={`/accounting/chart-of-accounts/register/${id}`}>{money(c)}</Link>', false],
    ['vendors chip filter', '<V3KpiTile value="1" href="/vendors?chip=all" />', false],
    ['vendors empty chip', '<V3KpiTile value="1" href="/vendors?chip=" />', true],
    ['tile stated noDrill', '<V3KpiTile value="1" noDrill="GL account mix of vendor expenses" />', false],
    ['tile empty noDrill', '<V3KpiTile value="1" noDrill="" />', true],
    ['account name is not a count', '<span>{r.account_name}</span>', false],
    ['camelCase count still a value', '<span>{r.rowCount}</span>', true],
    ['punctuation is not numeric text', '<div>No rows {x}.</div>', false],
    ['caption of the table it heads', '<><span>{int(rows.length)} drivers</span><ParityTable rows={rows} /></>', false],
    ['caption with no table bound', '<span>{int(other.length)} drivers</span>', true],
    ['condition on a count that renders text', '<p>{n.count > 0 ? "has rows" : null}</p>', false],
    ['conditional that renders money', '<p>{ok ? money(total) : "—"}</p>', true],
    ['and-guard that renders money', '<p>{ok && usd(total)}</p>', true],
    ['fragment figure cannot escape', '<p>{ok ? <>{usd(total)} ({int(n)})</> : null}</p>', true],
    ['linked fragment figure', '<Link to="/accounting/bills?status=open"><>{usd(total)}</></Link>', false],
  ];
  for (const [name, source, fails] of cases) {
    assert.equal(scanSource(source).problems.length > 0, fails, name);
    console.log(`PASS ${name}`);
  }
  // The declared-none channel is counted, not hidden.
  assert.equal(scanSource('<MoneyCell cents={c} drill={{ none: "Faro debtors have no record page" }} />').declared.length, 1, 'none is counted');
  // Contract checks bite when the source they certify changes.
  const tabs = fs.readFileSync(path.join(ROOT, 'apps/frontend/src/pages/drivers/driverProfileTabs.ts'), 'utf8');
  assert.equal(helperProblems(tabs).length, 0, 'real driverProfileTabHref passes');
  assert.ok(helperProblems(tabs.replace('return `/drivers/${driverId}?tab=${slug}`;', 'return `/safety/${slug}`;')).length > 0, 'helper re-pointed off /drivers is caught');
  const kit = fs.readFileSync(path.join(ROOT, 'apps/frontend/src/components/boards/partyBoardKit.tsx'), 'utf8');
  assert.equal(wrapperProblems(kit).length, 0, 'real NumLink passes');
  assert.ok(wrapperProblems(kit.replace('return <Link to={to}', 'return <span data-to={to}')).length > 0, 'NumLink that stops linking is caught');
  const realRead = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };
  assert.equal(consumerProblems(realRead).length, 0, 'every URL filter consumer reads its key');
  assert.ok(consumerProblems((rel) => (realRead(rel) ?? '').replace(/\.get\(\s*["']chip["']\s*\)/g, '.get("x")')).length > 0, 'a consumer that stops reading ?chip= is caught');
  // A real board, planted with a dead number, fails; the real board as shipped passes.
  const boardRel = `${BOARDS_DIR}/VendorsHomeBoard.tsx`;
  const board = fs.readFileSync(path.join(ROOT, boardRel), 'utf8');
  const planted = board.replace('href="/vendors?chip=open_bills"', '');
  assert.notEqual(planted, board, 'plant changed the board');
  assert.ok(scanSource(planted, boardRel).problems.length > scanSource(board, boardRel).problems.length,
    'a real board tile stripped of its drill adds a problem');
  // A missing or empty scan directory is a failure, never a vacuous pass.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'graphic-drill-'));
  assert.ok(scanTree(empty).problems.some(p => p.includes('NOT a pass')), 'empty tree fails');
  fs.rmSync(empty, { recursive: true, force: true });
  console.log(`SELFTEST ${cases.length}/${cases.length} cases + contract/plant/empty-tree checks PASS; missing route/filter and dead-number mutations refused`);
}

export function scanTree(root) {
  const dir = path.join(root, BOARDS_DIR);
  const files = [];
  function walk(base) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const name = path.join(base, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(name); }
      else if (name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(name)) files.push(name);
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  if (!files.length) return { files: 0, values: 0, declared: [], problems: [`No board sources found under ${BOARDS_DIR}; coverage unavailable, NOT a pass`] };
  const read = (rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } };
  const results = files.map(file => scanSource(fs.readFileSync(file, 'utf8'), path.relative(root, file)));
  const declared = results.flatMap(r => r.declared);
  const problems = [
    ...results.flatMap(r => r.problems),
    ...consumerProblems(read),
    ...helperProblems(read('apps/frontend/src/pages/drivers/driverProfileTabs.ts')),
    ...wrapperProblems(read('apps/frontend/src/components/boards/partyBoardKit.tsx')),
  ];
  if (declared.length > DECLARED_NO_DRILL_CEILING) {
    problems.push(`${declared.length} declared no-drill values > ceiling ${DECLARED_NO_DRILL_CEILING} (shrink-only) — build the destination instead of declaring`);
  }
  return { files: files.length, values: results.reduce((n, r) => n + r.values, 0), declared, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const index = process.argv.indexOf('--root');
    if (index >= 0 && !process.argv[index + 1]) throw new Error('--root requires a path');
    const result = scanTree(index >= 0 ? path.resolve(process.argv[index + 1]) : ROOT);
    console.log(JSON.stringify({ ...result, declared_count: result.declared.length, ceiling: DECLARED_NO_DRILL_CEILING }, null, 2));
    console.log('Static contract only. Route existence, applied filters, and matching totals require live read-back.');
    process.exitCode = result.problems.length ? 1 : 0;
  }
}
