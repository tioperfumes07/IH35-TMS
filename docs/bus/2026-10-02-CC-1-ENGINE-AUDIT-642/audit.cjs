// READ-ONLY structural audit of apps/backend/src. Uses the TypeScript AST.
const ts = require('/Users/jorgemunoz/ih35-worktrees/lto/node_modules/typescript');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, 'tree');
const BACK = path.join(ROOT, 'apps/backend');
const SRC = path.join(BACK, 'src');

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(SRC, p);
const isTest = (p) => /(^|\/)__tests__\//.test(p) || /\.(test|spec)\./.test(path.basename(p)) || /\/test-helpers\//.test(p);

const srcFiles = walk(SRC);
const allBackFiles = walk(BACK); // src + apps/backend/__tests__ + scripts + test-helpers
const POP_RE = /\.(service|cron|worker|job|engine)\.ts$/;
const pop = srcFiles.filter((f) => POP_RE.test(f) && !/\.test\./.test(f) && !/(^|\/)__tests__\//.test(f)).sort();

const cache = new Map();
function parse(f) {
  if (!cache.has(f)) {
    const text = fs.readFileSync(f, 'utf8');
    cache.set(f, { text, sf: ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) });
  }
  return cache.get(f);
}
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

// ---- 1. population
const bySuffix = {}, byDir = {};
for (const f of pop) {
  const s = f.match(POP_RE)[1]; bySuffix[s] = (bySuffix[s] || 0) + 1;
  const d = rel(f).split('/')[0]; byDir[d] = (byDir[d] || 0) + 1;
}

// ---- string literal extraction (outermost template/string literals)
function literals(f) {
  const { sf } = parse(f);
  const out = [];
  function visit(n, insideTpl) {
    const isLit = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
    if (isLit && !insideTpl) {
      out.push({ text: n.getText(sf), start: n.getStart(sf), line: lineOf(sf, n.getStart(sf)) });
    }
    ts.forEachChild(n, (c) => visit(c, insideTpl || isLit));
  }
  visit(sf, false);
  return out;
}
const WRITE_RE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([a-z_][a-z0-9_]*)"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?/gi;
const MONEY_RE = /INSERT\s+INTO\s+accounting\s*\.\s*journal_entr(ies|y_postings)\b/i;
const MONEY_RE_RAW = /INSERT\s+INTO\s+accounting\s*\.\s*journal_entr(ies|y_postings)\b/i;

const info = {};
for (const f of pop) {
  const lits = literals(f);
  const writes = [];
  for (const L of lits) {
    WRITE_RE.lastIndex = 0; let m;
    while ((m = WRITE_RE.exec(L.text))) {
      const verb = m[1].toUpperCase().replace(/\s+/g, ' ');
      // skip "DO UPDATE SET" false positives impossible (needs schema.table) ; skip "UPDATE OF col" trigger syntax
      const off = L.start + m.index;
      writes.push({ verb, table: `${m[2].toLowerCase()}.${m[3].toLowerCase()}`, lit: L, idx: m.index, line: lineOf(parse(f).sf, off) });
    }
  }
  const rawText = parse(f).text;
  WRITE_RE.lastIndex = 0;
  const rawWriter = WRITE_RE.test(rawText.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  WRITE_RE.lastIndex = 0;
  const rawWriterInclComments = WRITE_RE.test(rawText);
  info[f] = { writes, lits, rawWriter, rawWriterInclComments, money: lits.some((L) => MONEY_RE.test(L.text)), moneyRaw: MONEY_RE_RAW.test(rawText) };
}
const writers = pop.filter((f) => info[f].writes.length);
const money = pop.filter((f) => info[f].money);

// ---- 4. imports
let specCount = 0, relSpecCount = 0;
const importers = new Map(); // target -> Set(importer)
function resolveSpec(from, spec) {
  if (!spec.startsWith('.')) return null;
  let base = path.resolve(path.dirname(from), spec).replace(/\.(js|ts|mjs|cjs)$/, '');
  for (const c of [base + '.ts', base + '.tsx', base + '/index.ts', base + '.d.ts', base]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return 'UNRESOLVED:' + base;
}
const unresolved = [];
for (const f of allBackFiles) {
  const { sf } = parse(f);
  const specs = [];
  (function v(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) specs.push(n.moduleSpecifier.text);
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) specs.push(n.arguments[0].text);
    else if (ts.isImportTypeNode && ts.isImportTypeNode(n) && n.argument && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) specs.push(n.argument.literal.text);
    ts.forEachChild(n, v);
  })(sf);
  for (const s of specs) {
    specCount++;
    const r = resolveSpec(f, s);
    if (!r) continue;
    relSpecCount++;
    if (r.startsWith('UNRESOLVED:')) { unresolved.push(`${path.relative(BACK, f)} -> ${s}`); continue; }
    if (!importers.has(r)) importers.set(r, new Set());
    importers.get(r).add(f);
  }
}
// autoload roots: accounting/**/*.routes.ts not in ignorePattern
const AUTOLOAD_IGNORE = /(\.test\.|(^|\/)cash-flow\.routes\.|(^|\/)cash-forecast\.routes\.|(^|\/)finance-hub\.routes\.|(^|\/)checks\.routes\.)/;
const autoloadRoots = srcFiles.filter((f) => f.startsWith(path.join(SRC, 'accounting') + '/') && /\.routes\.(ts|js)$/.test(f) && !AUTOLOAD_IGNORE.test(path.basename(f)) && !isTest(f));
// other non-ts references (package.json scripts, render.yaml, Dockerfile, .mjs scripts)
function nonTsRefs(base) {
  const hits = [];
  const cands = [path.join(BACK, 'package.json'), path.join(ROOT, 'package.json'), path.join(ROOT, 'render.yaml')];
  for (const c of cands) if (fs.existsSync(c) && fs.readFileSync(c, 'utf8').includes(base)) hits.push(path.relative(ROOT, c));
  return hits;
}
// bootstrap string refs (index.ts, accounting/index.ts, server.ts, app.ts)
const bootFiles = ['index.ts', 'accounting/index.ts', 'server.ts', 'app.ts'].map((x) => path.join(SRC, x)).filter(fs.existsSync);
const classify = {};
for (const f of pop) {
  const imps = [...(importers.get(f) || [])];
  const prod = imps.filter((i) => !isTest(i));
  const test = imps.filter((i) => isTest(i));
  const base = path.basename(f, '.ts');
  const bootRef = bootFiles.filter((b) => b !== f && parse(b).text.includes(base));
  const cfgRef = nonTsRefs(base);
  let cls;
  if (prod.length || bootRef.length || cfgRef.length) cls = 'wired';
  else if (test.length) cls = 'test-only';
  else cls = 'orphan';
  classify[f] = { prod, test, cls, bootRef, cfgRef };
}
// transitive reachability from roots (supplementary)
const roots = [path.join(SRC, 'index.ts'), ...autoloadRoots];
const reach = new Set();
const fwd = new Map();
for (const [t, s] of importers) for (const i of s) { if (!fwd.has(i)) fwd.set(i, new Set()); fwd.get(i).add(t); }
const stack = [...roots];
while (stack.length) { const x = stack.pop(); if (reach.has(x)) continue; reach.add(x); for (const y of fwd.get(x) || []) stack.push(y); }

// ---- 5. checks
const TXN_RE = /\bBEGIN\b|withTransaction|withLuciaBypass|withCurrentUser|transaction\(|SAVEPOINT/;
const CLIENT_PARAM_RE = /\b(client|tx|trx|db|c|conn|q)\s*:\s*(DbClient|PoolClient|PgClient|Queryable|Pick<\s*PoolClient|ClientBase|TxClient|Client\b|pg\.PoolClient|DbQueryable|SqlClient)/;
const SPINE_RE = /writeTransactionSourceLink|transaction_source_links/;
const F_TRIG = /cron|schedule|setInterval|worker/i;
const F_SAFE = /ON\s+CONFLICT|idempoten|WHERE\s+NOT\s+EXISTS/i;

function whereClause(sqlText, fromIdx) {
  const tail = sqlText.slice(fromIdx);
  const m = tail.match(/\bWHERE\b([\s\S]*?)(\bRETURNING\b|;|`$|\bON CONFLICT\b|$)/i);
  return m ? m[1] : null;
}
function idOnlyWhere(w) {
  if (w == null) return 'no-where';
  const stripped = w.replace(/\$\{[\s\S]*?\}/g, ' ');
  const cols = [...stripped.matchAll(/([a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)\s*(=|<>|!=|\bIN\b|\bIS\b|<|>|=\s*ANY)/gi)].map((m) => m[2].toLowerCase());
  const real = cols.filter((c) => !/^(and|or|not|null|true|false)$/.test(c));
  if (!real.length) return 'unparsed';
  return real.every((c) => c === 'id' || c.endsWith('_id') || c === 'uuid') ? 'id-only' : 'other';
}
function catches(f) {
  const { sf } = parse(f);
  const out = [];
  (function v(n) {
    if (ts.isCatchClause(n)) {
      const blk = n.block;
      const empty = blk.statements.length === 0;
      const body = blk.getText(sf);
      const logs = /\b(console|logger|log|app\.log|request\.log|req\.log|fastify\.log|server\.log|Sentry|captureException|reportError|recordFailure|warn|error)\b\s*[\.(]/.test(body) || /\.(log|warn|error|info|debug|fatal)\s*\(/.test(body);
      let throwsOrReturns = false;
      (function w(x) { if (ts.isThrowStatement(x) || ts.isReturnStatement(x)) throwsOrReturns = true; if (!ts.isFunctionLike(x)) ts.forEachChild(x, w); })(blk);
      out.push({ line: lineOf(sf, n.getStart(sf)), empty, silent: !logs && !throwsOrReturns, text: body.replace(/\s+/g, ' ').slice(0, 120) });
    }
    ts.forEachChild(n, v);
  })(sf);
  return out;
}
function hasHeader(f) {
  const t = parse(f).text.replace(/^#!.*\n/, '').trimStart();
  return t.startsWith('//') || t.startsWith('/*');
}

const res = {};
for (const f of writers) {
  const I = info[f]; const text = parse(f).text;
  const tables = [...new Set(I.writes.map((w) => w.table))];
  const A = I.money && !SPINE_RE.test(text);
  const B = tables.length >= 2 && !TXN_RE.test(text);
  const Bclient = B && CLIENT_PARAM_RE.test(text);
  const cStmts = I.writes.filter((w) => w.verb !== 'INSERT INTO' && !/operating_company_id/i.test(w.lit.text)).map((w) => ({ ...w, where: idOnlyWhere(whereClause(w.lit.text, w.idx)) }));
  const F = F_TRIG.test(text) && !F_SAFE.test(text);
  const cs = catches(f);
  res[f] = { tables, A, B, Bclient, cStmts, F, catches: cs, G: cs.some((c) => c.empty), Gsilent: cs.filter((c) => c.silent), I: !hasHeader(f) };
}

// ---- output
const out = {
  population: pop.length, bySuffix, byDir,
  writers: writers.length, writersRawNoComments: pop.filter((f) => info[f].rawWriter).length, writersRawInclComments: pop.filter((f) => info[f].rawWriterInclComments).length,
  money: money.map(rel), moneyRaw: pop.filter((f) => info[f].moneyRaw).map(rel),
  backendTsSrc: srcFiles.length, backendTsAll: allBackFiles.length, specCount, relSpecCount, unresolvedCount: unresolved.length,
  wired: pop.filter((f) => classify[f].cls === 'wired').length,
  wiredByBootOrCfgOnly: pop.filter((f) => classify[f].cls === 'wired' && !classify[f].prod.length).map((f) => ({ f: rel(f), boot: classify[f].bootRef.map(rel), cfg: classify[f].cfgRef })),
  orphans: pop.filter((f) => classify[f].cls === 'orphan').map(rel),
  testOnly: pop.filter((f) => classify[f].cls === 'test-only').map((f) => ({ f: rel(f), tests: classify[f].test.map((t) => path.relative(BACK, t)) })),
  testCovered: pop.filter((f) => classify[f].test.length).length,
  unreachableTransitive: pop.filter((f) => !reach.has(f)).map(rel),
  autoloadRootCount: autoloadRoots.length,
  A: writers.filter((f) => res[f].A).map(rel),
  B: writers.filter((f) => res[f].B).length, Bclient: writers.filter((f) => res[f].Bclient).length,
  Bfiles: writers.filter((f) => res[f].B).map(rel),
  Cfiles: writers.filter((f) => res[f].cStmts.length).length,
  Cstmts: writers.reduce((a, f) => a + res[f].cStmts.length, 0),
  CstmtsIdOnly: writers.reduce((a, f) => a + res[f].cStmts.filter((s) => s.where === 'id-only').length, 0),
  CstmtsWhereBreakdown: writers.reduce((a, f) => { for (const s of res[f].cStmts) a[s.where] = (a[s.where] || 0) + 1; return a; }, {}),
  CfilesAllIdOnly: writers.filter((f) => res[f].cStmts.length && res[f].cStmts.every((s) => s.where === 'id-only')).length,
  F: writers.filter((f) => res[f].F).length, Ffiles: writers.filter((f) => res[f].F).map(rel),
  Gempty: writers.flatMap((f) => res[f].catches.filter((c) => c.empty).map((c) => `${rel(f)}:${c.line} ${c.text}`)),
  GemptyPop: pop.flatMap((f) => catches(f).filter((c) => c.empty).map((c) => `${rel(f)}:${c.line} ${c.text}`)),
  GsilentWriters: writers.flatMap((f) => res[f].Gsilent.map((c) => `${rel(f)}:${c.line} ${c.text}`)),
  GsilentWriterFiles: writers.filter((f) => res[f].Gsilent.length).length,
  IWriters: writers.filter((f) => res[f].I).length, IPop: pop.filter((f) => !hasHeader(f)).length,
};
fs.writeFileSync(path.join(__dirname, 'out.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, 'writers.txt'), writers.map(rel).join('\n'));

// per-file detail
const NAMED = ['driver-finance/settlement-contract-terms.service.ts', 'accounting/amortization-posting/amortization-posting.service.ts', 'accounting/lease-asc842/lease-posting.service.ts', 'accounting/settlement-posting/settlement-posting.service.ts', 'accounting/void.service.ts', 'accounting/fuel-posting/poster.service.ts', 'accounting/posting-engine.service.ts', 'accounting/recurring.worker.ts'];
const det = {};
for (const n of NAMED) {
  const f = path.join(SRC, n);
  if (!fs.existsSync(f)) { det[n] = 'MISSING'; continue; }
  const r = res[f]; const I = info[f]; const text = parse(f).text; const lines = text.split('\n');
  if (!r) { det[n] = { writer: false, cls: classify[f]?.cls }; continue; }
  const snip = (w) => w.lit.text.slice(w.idx, w.idx + 110).replace(/\s+/g, ' ');
  det[n] = {
    cls: classify[f].cls, prodImporters: classify[f].prod.map(rel), testImporters: classify[f].test.length,
    tables: r.tables,
    A: r.A ? I.writes.filter((w) => /journal_entr/.test(w.table) && w.verb === 'INSERT INTO').map((w) => `${n}:${w.line} ${snip(w)}`) : false,
    B: r.B, Bclient: r.Bclient, writes: I.writes.map((w) => `${w.line} ${w.verb} ${w.table}`),
    txnMarkers: lines.map((l, i) => (TXN_RE.test(l) ? `${i + 1}: ${l.trim().slice(0, 100)}` : null)).filter(Boolean).slice(0, 15),
    C: r.cStmts.map((s) => `${n}:${s.line} [${s.where}] ${snip(s)}`),
    F: r.F ? lines.map((l, i) => (F_TRIG.test(l) ? `${n}:${i + 1}: ${l.trim().slice(0, 100)}` : null)).filter(Boolean).slice(0, 8) : false,
    Gempty: r.catches.filter((c) => c.empty).map((c) => `${n}:${c.line}`),
    Gsilent: r.Gsilent.map((c) => `${n}:${c.line} ${c.text}`),
    I: r.I ? `${n}:1 ${lines[0].slice(0, 80)}` : false,
  };
}
fs.writeFileSync(path.join(__dirname, 'detail.json'), JSON.stringify(det, null, 1));
console.log(JSON.stringify({ ...out, Bfiles: undefined, Ffiles: undefined, byDir: Object.keys(byDir).length + ' dirs' }, null, 1));

// ---- definition-sensitivity variants
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const V = {};
V.B_codeOnly = writers.filter((f) => res[f].tables.length >= 2 && !TXN_RE.test(strip(parse(f).text))).length;
V.B_ci = writers.filter((f) => res[f].tables.length >= 2 && !new RegExp(TXN_RE.source, 'i').test(parse(f).text)).length;
V.B_ci_codeOnly = writers.filter((f) => res[f].tables.length >= 2 && !new RegExp(TXN_RE.source, 'i').test(strip(parse(f).text))).length;
V.B_multiTablesGe2 = writers.filter((f) => res[f].tables.length >= 2).length;
V.C_anyCompanyKey_files = writers.filter((f) => info[f].writes.some((w) => w.verb !== 'INSERT INTO' && !/operating_company_id|company_id|tenant_id/i.test(w.lit.text))).length;
V.C_window300_files = writers.filter((f) => info[f].writes.some((w) => w.verb !== 'INSERT INTO' && !/operating_company_id/i.test(w.lit.text.slice(w.idx, w.idx + 300)))).length;
V.C_UPDATEonly_files = writers.filter((f) => info[f].writes.some((w) => w.verb === 'UPDATE' && !/operating_company_id/i.test(w.lit.text))).length;
V.C_DELETEonly_stmts = writers.reduce((a, f) => a + res[f].cStmts.filter((s) => s.verb === 'DELETE FROM').length, 0);
V.F_codeOnly = writers.filter((f) => { const t = strip(parse(f).text); return F_TRIG.test(t) && !F_SAFE.test(t); }).length;
V.F_safeInLiteralsOnly = writers.filter((f) => F_TRIG.test(parse(f).text) && !info[f].lits.some((L) => F_SAFE.test(L.text))).length;
V.F_overPopulation = pop.filter((f) => F_TRIG.test(parse(f).text) && !F_SAFE.test(parse(f).text)).length;
V.A_rawText = pop.filter((f) => info[f].moneyRaw && !SPINE_RE.test(parse(f).text)).map(rel);
V.G_emptyNoComment_pop = pop.flatMap((f) => { const { sf, text } = parse(f); const o = []; (function v(n) { if (ts.isCatchClause(n) && n.block.statements.length === 0 && !/\/\/|\/\*/.test(n.block.getText(sf))) o.push(`${rel(f)}:${lineOf(sf, n.getStart(sf))}`); ts.forEachChild(n, v); })(sf); return o; });
V.G_promiseCatchEmpty_writers = writers.flatMap((f) => { const t = parse(f).text.split('\n'); return t.map((l, i) => (/\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)/.test(l) ? `${rel(f)}:${i + 1}` : null)).filter(Boolean); }).length;
V.G_regexEmptyRaw_pop = pop.flatMap((f) => parse(f).text.split('\n').map((l, i) => (/catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/.test(l) ? `${rel(f)}:${i + 1}: ${l.trim().slice(0, 90)}` : null)).filter(Boolean));
V.G_regexEmptyRaw_srcAll = srcFiles.filter((f) => !isTest(f)).flatMap((f) => parse(f).text.split('\n').map((l, i) => (/catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/.test(l) && !/^\s*(\/\/|\*)/.test(l) ? `${rel(f)}:${i + 1}: ${l.trim().slice(0, 90)}` : null)).filter(Boolean));
V.I_ignoreEslintOnly = writers.filter((f) => { const t = parse(f).text.trimStart(); return !(t.startsWith('//') || t.startsWith('/*')) || /^\/\/\s*(eslint|@ts-|biome)/.test(t) && false; }).length;
V.wired_strict_transitive = pop.filter((f) => reach.has(f)).length;
V.unresolved = unresolved;
fs.writeFileSync(path.join(__dirname, 'variants.json'), JSON.stringify(V, null, 1));
console.error(JSON.stringify(V, null, 1));

// =================== ENGINES TABLE ===================
(function engines() {
  // repo-root script importers
  const scriptImporters = new Map();
  (function sw(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) sw(p);
      else if (/\.(ts|mts|mjs|js|cjs)$/.test(e.name)) {
        const t = fs.readFileSync(p, 'utf8');
        if (!t.includes('apps/backend/src')) continue;
        for (const m of t.matchAll(/(?:from\s*|import\s*\(\s*)["'`]([^"'`]*apps\/backend\/src\/[^"'`]+)["'`]/g)) {
          const r = resolveSpec(p, m[1]);
          if (r && !r.startsWith('UNRESOLVED')) { if (!scriptImporters.has(r)) scriptImporters.set(r, new Set()); scriptImporters.get(r).add(path.relative(ROOT, p)); }
        }
      }
    }
  })(path.join(ROOT, 'scripts'));

  const WRAP_CALL = /^(withCurrentUser|withCompanyScope|withLuciaBypass|withTransaction|withCompany|withCompanyTx|withTx)$/;
  const CLIENT_P = /\b(client|tx|trx|conn|db|queryable)\b|DbClient|PoolClient|Queryable|ClientBase|TxClient|ctx\s*:\s*\w*(Context|Ctx)\b/i;
  const POOL_RE = /\b(pool|luciaPool|appPool|getPool\(\))\s*\.\s*(query|connect)\b/;
  const writeTablesOf = (f) => { const s = new Set(); for (const L of literals(f)) { WRITE_RE.lastIndex = 0; let m; while ((m = WRITE_RE.exec(L.text))) s.add(`${m[2]}.${m[3]}`.toLowerCase()); } return s; };
  const wtCache = new Map(); const wt = (f) => { if (!wtCache.has(f)) wtCache.set(f, writeTablesOf(f)); return wtCache.get(f); };
  const cronImporters = (f) => [...(importers.get(f) || [])].some((i) => /\.(cron|worker)\.ts$/.test(i) && !isTest(i));

  function classifyWritePos(f, pos) {
    const { sf } = parse(f);
    // ancestors
    const anc = []; (function v(n) { if (n.getStart(sf) <= pos && pos < n.end) { anc.push(n); ts.forEachChild(n, v); } })(sf);
    let wrapped = false, fn = null;
    for (const n of anc) {
      if (ts.isCallExpression(n)) { const e = n.expression.getText(sf).split('.').pop(); if (WRAP_CALL.test(e)) wrapped = true; }
      if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) fn = n;
    }
    // outermost named function for BEGIN / pool checks
    const fns = anc.filter((n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n));
    if (!fns.length) return null; // module-level
    // SQL-builder function (never calls .query itself): classify where it is used instead
    const inner = fns[fns.length - 1];
    if (!/\.query\s*[<(]/.test(inner.getText(sf)) && ts.isVariableDeclaration(inner.parent)) return null;
    const outer = fns[0]; const body = strip(outer.getText(sf));
    if (/["'`]\s*BEGIN\b/.test(body) && !wrapped) wrapped = true;
    if (wrapped) return 'wrapped';
    const hasClient = fns.some((x) => x.parameters.some((p) => CLIENT_P.test(p.getText(sf))));
    const opensPool = POOL_RE.test(body);
    if (hasClient && !opensPool) return 'caller';
    return 'unwrapped';
  }
  function atomicOf(f) {
    const I = info[f]; const tables = new Set(I.writes.map((w) => w.table));
    if (tables.size < 2) return 'na';
    const { sf } = parse(f); const kinds = new Set();
    for (const w of I.writes) {
      let k = classifyWritePos(f, w.lit.start);
      if (k === null) {
        // module-level SQL const: classify each usage of its identifier
        let name = null; (function v(n) { if (ts.isVariableDeclaration(n) && n.initializer && n.initializer.getStart(sf) <= w.lit.start && w.lit.start < n.initializer.end) name = n.name.getText(sf); ts.forEachChild(n, v); })(sf);
        // innermost declaration wins (forEachChild visits outer first, inner overwrites)
        if (name) { (function v(n) { if (ts.isIdentifier(n) && n.text === name && !ts.isVariableDeclaration(n.parent)) { const kk = classifyWritePos(f, n.getStart(sf)); if (kk) kinds.add(kk); } ts.forEachChild(n, v); })(sf); }
        continue;
      }
      kinds.add(k);
    }
    if (!kinds.size) return 'UNKNOWN';
    if (!kinds.has('unwrapped')) return kinds.has('wrapped') ? 'WRAPPED' : 'CALLER';
    return kinds.size === 1 ? 'UNWRAPPED' : 'MIXED';
  }
  function rlsBypass(f) {
    const { sf, text } = parse(f); const code = strip(text);
    if (/withLuciaBypass|bypass_rls|app\.bypass_rls/.test(code)) return true;
    let hit = false;
    (function v(n, inWcu) {
      let w = inWcu;
      if (ts.isCallExpression(n)) { const e = n.expression.getText(sf); if (/withCurrentUser|withCompanyScope/.test(e.split('.').pop())) w = true; if (!w && /\b(pool|luciaPool|appPool)\s*\.\s*query$|getPool\(\)\s*\.\s*query$/.test(e)) hit = true; }
      ts.forEachChild(n, (c) => v(c, w));
    })(sf, false);
    return hit;
  }
  function leadingComment(f) {
    const { text } = parse(f); let t = text.replace(/^#!.*\n/, ''); let out = '';
    for (;;) { t = t.trimStart(); if (t.startsWith('//')) { const i = t.indexOf('\n'); out += t.slice(0, i < 0 ? undefined : i) + '\n'; t = i < 0 ? '' : t.slice(i); } else if (t.startsWith('/*')) { const i = t.indexOf('*/'); out += t.slice(0, i + 2) + '\n'; t = t.slice(i + 2); } else break; }
    return out;
  }
  function header(f) {
    const c = leadingComment(f); if (!c.trim()) return 'NONE';
    const writes = /\bwrit|insert|updat|\bpost|creat|persist|upsert|mint|record/i.test(c);
    const rev = /revers|undo|\bvoid/i.test(c);
    const never = /\bnever\b|must[\s-]+not|\bdo not\b|don't/i.test(c);
    return writes && rev && never ? 'FULL' : 'PARTIAL';
  }
  const REV_FN = /void|revers|undo|delete/i;
  function fnNames(f) { const { sf } = parse(f); const o = []; (function v(n) { if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) o.push(n.name.getText(sf)); else if (ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) o.push(n.name.getText(sf)); ts.forEachChild(n, v); })(sf); return o; }
  function reverseHint(f) {
    const mine = new Set(info[f].writes.map((w) => w.table));
    const dir = path.dirname(f);
    const cands = new Set([f, ...srcFiles.filter((x) => path.dirname(x) === dir && !isTest(x)), ...((fwd.get(f) && [...fwd.get(f)]) || []).filter((x) => x.startsWith(SRC) && !isTest(x))]);
    const hints = [];
    for (const c of cands) {
      const tw = wt(c); if (![...tw].some((t) => mine.has(t))) continue;
      const names = fnNames(c).filter((n) => REV_FN.test(n));
      const fileHit = REV_FN.test(path.basename(c));
      if (names.length) hints.push(`${rel(c)}#${[...new Set(names)].slice(0, 4).join('/')}`);
      else if (fileHit) hints.push(rel(c));
    }
    return hints.slice(0, 6).join('; ');
  }

  const rows = [];
  for (const f of pop) {
    const I = info[f]; const C = classify[f]; const text = parse(f).text; const code = strip(text);
    const suffix = f.match(POP_RE)[1];
    let reach = C.cls === 'wired' ? 'WIRED' : C.cls === 'test-only' ? 'TEST-ONLY' : 'ORPHAN';
    const sImp = scriptImporters.get(f);
    if (reach !== 'WIRED' && sImp && sImp.size) reach += '+script-only';
    const writer = I.writes.length > 0;
    const tables = [...new Set(I.writes.map((w) => w.table))];
    const money = I.money;
    const spine = money ? (SPINE_RE.test(code) ? 'y' : 'n') : 'na';
    const atomic = writer ? atomicOf(f) : 'na';
    const unscoped = I.writes.filter((w) => w.verb !== 'INSERT INTO' && !/operating_company_id|company_id|tenant_id/i.test(w.lit.text)).length;
    const bypass = rlsBypass(f);
    const scheduled = /\.(cron|worker|job)\.ts$/.test(f) || /cron\.schedule|setInterval\s*\(|node-cron|registerCron/.test(code) || cronImporters(f);
    let idem = 'na';
    if (scheduled && writer) {
      const lit = I.lits.map((L) => L.text).join('\n');
      idem = (/ON\s+CONFLICT|WHERE\s+NOT\s+EXISTS|idempotency_key|run_key/i.test(lit) || /idempotency_key|run_key/.test(code) || (/advisory_(xact_)?lock/i.test(text) && /\bEXISTS\b|SELECT\s+1\b/i.test(lit))) ? 'y' : 'n';
    }
    const hdr = header(f);
    const rh = writer ? reverseHint(f) : '';
    const reasons = [];
    if (money && spine === 'n') reasons.push('money-no-spine');
    if (atomic === 'UNWRAPPED' || atomic === 'MIXED') reasons.push(`atomic-${atomic}`);
    if (bypass && unscoped > 0) reasons.push('bypass+unscoped');
    if (scheduled && writer && idem === 'n') reasons.push('scheduled-not-idempotent');
    if (reach.startsWith('ORPHAN') && writer) reasons.push('orphan-writer');
    if (hdr === 'NONE' && writer) reasons.push('writer-no-header');
    if (!writer && !reach.startsWith('WIRED')) reasons.push(`nonwriter-${reach}`);
    rows.push({ path: rel(f), suffix, module: rel(f).split('/')[0], reach, writer: writer ? 'y' : 'n', tables_written: tables.join(','), money: money ? 'y' : 'n', spine, atomic, scope_unscoped_count: unscoped, rls_bypass: bypass ? 'y' : 'n', scheduled: scheduled ? 'y' : 'n', idempotent: idem, header: hdr, reverse_hint: rh, prelim_verdict: reasons.length ? 'CHECK: ' + reasons.join(', ') : 'OK' });
  }
  fs.writeFileSync(path.join(__dirname, 'engines.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const cols = Object.keys(rows[0]);
  fs.writeFileSync(path.join(__dirname, 'engines.tsv'), [cols.join('\t'), ...rows.map((r) => cols.map((c) => String(r[c]).replace(/[\t\n]/g, ' ')).join('\t'))].join('\n') + '\n');
  const cnt = {}; for (const r of rows) for (const x of (r.prelim_verdict === 'OK' ? ['OK'] : r.prelim_verdict.slice(7).split(', '))) cnt[x] = (cnt[x] || 0) + 1;
  const dist = (k) => rows.reduce((a, r) => { a[r[k]] = (a[r[k]] || 0) + 1; return a; }, {});
  console.error(JSON.stringify({ rows: rows.length, check: rows.filter((r) => r.prelim_verdict !== 'OK').length, cnt, atomic: dist('atomic'), reach: dist('reach'), header: dist('header'), idempotent: dist('idempotent'), scheduled: dist('scheduled'), rls: dist('rls_bypass') }, null, 1));
})();
