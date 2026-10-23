#!/usr/bin/env node
/** 443.281-C: entity list/report filters use the shared MultiSelectDropdown.
 * Whole-tree check, zero allowed violations. No baseline or page-level exemption.
 * Create/edit fields without filter semantics are not list filters.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../apps/frontend/package.json', import.meta.url));
const ts = require('typescript');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTITY = /\b(?:units?|trucks?|trailers?|loads?|drivers?|settlements?|customers?|vendors?|accounts?|cards?)\b/i;
const CONTROL = /^(?:select|input|EntityPicker|EntityMultiSelect|ReferenceSelect|SelectCombobox|MultiSelectDropdown|Select|Combobox)$/;
const words = value => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');

export function inspectSource(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = new Map();
  const namespaces = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const module = stmt.moduleSpecifier.text;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.set(bindings.name.text, module);
    if (bindings && ts.isNamedImports(bindings)) for (const spec of bindings.elements) {
      imports.set(spec.name.text, { name: spec.propertyName?.text ?? spec.name.text, module });
    }
    if (stmt.importClause?.name) imports.set(stmt.importClause.name.text, { name: module.split('/').at(-1), module });
  }
  const failures = [];
  let filters = 0;
  let compliant = 0;
  function props(node) {
    return new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(p => [p.name.getText(sf), p.initializer?.getText(sf) ?? 'true']));
  }
  function walk(n) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      const parts = tag.split('.');
      const imp = imports.get(tag) ?? (parts.length === 2 && namespaces.has(parts[0]) ? { name: parts[1], module: namespaces.get(parts[0]) } : undefined);
      const canonical = imp?.name ?? tag;
      if (CONTROL.test(canonical)) {
        const attr = props(n);
        const metadata = ['kind', 'label', 'aria-label', 'ariaLabel', 'placeholder', 'allLabel', 'name'].map(k => attr.get(k) ?? '').join(' ');
        const element = ts.isJsxOpeningElement(n) ? n.parent : n;
        // Only literal option text, never comments, handler strings or an unrelated sibling.
        let optionText = '';
        function options(child) {
          if (ts.isJsxElement(child) && child.openingElement.tagName.getText(sf) === 'option') {
            optionText += ' | ' + child.children.filter(ts.isJsxText).map(x => x.text).join(' ');
          }
          ts.forEachChild(child, options);
        }
        if (ts.isJsxElement(element)) options(element);
        let filterContainer = false;
        let labelText = '';
        for (let p = element.parent; p; p = p.parent) {
          if (!ts.isJsxElement(p)) continue;
          const opening = p.openingElement;
          const parentTag = opening.tagName.getText(sf);
          if (parentTag === 'form' || /(?:Modal|Drawer|Dialog)$/.test(parentTag)) break;
          const parentAttrs = props(opening);
          if (/Filter(?:Bar|Toolbar|Panel)|MoneyListToolbar/.test(parentTag) || /\bfilters?\b/i.test(words(parentAttrs.get('data-testid') ?? ''))) filterContainer = true;
          if (parentTag === 'label' && !labelText) labelText = p.children.filter(ts.isJsxText).map(x => x.text).join(' ');
        }
        const allOption = optionText.match(/\bAll\s+(?:bank\s+)?(?:units?|trucks?|trailers?|loads?|drivers?|settlements?|customers?|vendors?|accounts?|cards?)\b/ig)?.join(' ') ?? '';
        const description = words(metadata + ' ' + labelText + ' ' + allOption);
        const entity = description.match(ENTITY)?.[0];
        const allEntity = /\bAll\s+(?:bank\s+)?(?:units?|trucks?|trailers?|loads?|drivers?|settlements?|customers?|vendors?|accounts?|cards?)\b/i.test(metadata + ' ' + optionText);
        const filterProp = /\bfilter\w*\b/i.test(words(['value', 'selected', 'id', 'data-testid', 'dataTestId'].map(k => attr.get(k) ?? '').join(' ')));
        const searchLabel = /search/i.test(attr.get('aria-label') ?? attr.get('ariaLabel') ?? '');
        const explicitEntity = ['kind', 'label', 'aria-label', 'ariaLabel'].some(k => ENTITY.test(words(attr.get(k) ?? '')) && !/search/i.test(attr.get(k) ?? '')) || /\b(?:unit|truck|trailer|load|driver|settlement|customer|vendor|account|card)\s*ids?\b/i.test(words(attr.get('value') ?? '')) || (!searchLabel && /\b(?:unit|truck|trailer|load|driver|settlement|customer|vendor|account|card)\s*filter\b/i.test(words(attr.get('value') ?? '')));
        const genericSearch = !explicitEntity && !allEntity && canonical === 'input' && (/^["']?search\b/i.test(attr.get('placeholder') ?? '') || /["']search["']/.test(attr.get('type') ?? '') || /^["']?search\b/i.test(attr.get('aria-label') ?? '') || /^\{search\}$/.test(attr.get('value') ?? ''));
        // Entity *types/status/activity* are taxonomies, not record selectors. A kind/id
        // binding still wins: relabelling an actual driverId picker cannot exempt it.
        const idBinding = attr.has('kind') || /\b(?:unit|truck|trailer|load|driver|settlement|customer|vendor|account|card)\s*ids?\b/i.test(words(attr.get('value') ?? ''));
        const taxonomy = !idBinding && (/\b(?:account|trailer|vehicle|vendor)\s+types?\b/i.test(metadata + ' ' + labelText + ' ' + optionText) || /\bactivity\s*filter\b/i.test(words(attr.get('value') ?? '')) || (/status/i.test(attr.get('ariaLabel') ?? attr.get('aria-label') ?? '') && /status/i.test(attr.get('value') ?? '')));
        const scalarCriterion = canonical === 'input' && !idBinding && /^["'](?:checkbox|radio|number|date)["']$/.test(attr.get('type') ?? '');
        if (entity && !genericSearch && !taxonomy && !scalarCriterion && (allEntity || filterContainer || filterProp)) {
          filters++;
          const resolvedImport = imp?.module.startsWith('.') ? path.resolve(ROOT, path.dirname(file), imp.module) : imp?.module.startsWith('@/') ? path.resolve(ROOT, 'apps/frontend/src', imp.module.slice(2)) : '';
          const shared = (imp?.name === 'MultiSelectDropdown' && resolvedImport.replace(/\.tsx$/, '') === path.join(ROOT, 'apps/frontend/src/components/forms/MultiSelectDropdown')) || (imp?.name === 'EntityMultiSelect' && resolvedImport.replace(/\.tsx$/, '') === path.join(ROOT, 'apps/frontend/src/components/EntityMultiSelect'));
          const truncated = /\.(?:slice|splice)\s*\(|\[\s*0\s*\]/.test((attr.get('selected') ?? '') + (attr.get('onChange') ?? ''));
          if (shared && !truncated) compliant++;
          else failures.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, entity, control: canonical, reason: 'entity filter must use shared MultiSelectDropdown (single-value form fields remain exempt)' });
        }
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);
  return { filters, compliant, failures };
}

export function selftest() {
  const shared = 'import { MultiSelectDropdown as Multi } from "../../components/forms/MultiSelectDropdown";';
  const cases = [
    ['single entity picker', '<EntityPicker kind="driver" placeholder="All drivers" />', 1],
    ['select options', '<select><option>All units</option></select>', 1],
    ['free text entity filter', '<input placeholder="All loads" />', 1],
    ['filter container', '<ReportFilterBar><EntityPicker kind="vendor" /></ReportFilterBar>', 1],
    ['filter value', '<EntityPicker kind="unit" value={staged.draft.unitFilter} />', 1],
    ['shared alias', shared + '<Multi label="Driver" allLabel="All drivers" selected={drivers} />', 0],
    ['sibling cannot mask violation', shared + '<><Multi label="Driver" allLabel="All drivers" /><EntityPicker kind="unit" placeholder="All units" /></>', 1],
    ['wrong import', 'import { MultiSelectDropdown } from "./Fake"; <MultiSelectDropdown label="Driver" allLabel="All drivers" />', 1],
    ['create field exemption', '<form><EntityPicker kind="unit" value={draft.unitId} /></form>', 0],
    ['filter inside form still fails', '<form><EntityPicker kind="unit" value={filters.unitId} /></form>', 1],
    ['nonentity filter', '<select><option>All statuses</option></select>', 0],
    ['comment not a mount', '/* <EntityPicker placeholder="All drivers" /> */ const x = 1;', 0],
    ['aliased bad picker', 'import { EntityPicker as Pick } from "./EntityPicker"; <Pick kind="driver" placeholder="All drivers" />', 1],
    ['native multiple not shared', '<select multiple><option>All units</option></select>', 1],
    ['custom select label', '<FilterBar><label>Driver<Select value={driver} /></label></FilterBar>', 1],
    ['page test id is not entity semantics', '<FilterBar><input data-testid="driver-audit-search" placeholder="Search" /></FilterBar>', 0],
    ['entity page status not entity filter', '<FilterBar><Select label="Status" data-testid="load-status-filter" /></FilterBar>', 0],
    ['transaction type not entity filter', '<FilterBar><select><option>driver_damage</option><option>from_load</option></select></FilterBar>', 0],
    ['general search stays text', '<FilterBar><input placeholder="Search WO, unit, vendor, driver" /></FilterBar>', 0],
    ['namespace picker', 'import * as Pickers from "./Pickers"; <Pickers.EntityPicker kind="driver" placeholder="All drivers" />', 1],
    ['entity-specific search not exempt', '<FilterBar><input type="search" aria-label="Driver" value={filters.driverId} /></FilterBar>', 1],
    ['nested form boundary', '<div data-testid="filters"><form><EntityPicker kind="unit" value={draft.unitId} /></form></div>', 0],
    ['lookalike import rejected', 'import { MultiSelectDropdown } from "./fake/components/forms/MultiSelectDropdown"; <MultiSelectDropdown label="Driver" allLabel="All drivers" />', 1],
    ['relative shared import', 'import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown"; <MultiSelectDropdown label="Driver" allLabel="All drivers" />', 0],
    ['separate option labels not an all-entity phrase', '<Modal><SelectCombobox><option>All</option><option>Truck</option><option>Trailer</option></SelectCombobox></Modal>', 0],
    ['account taxonomy', '<FilterBar><label>Account Type<SelectCombobox value={typeFilter}><option>All account types</option></SelectCombobox></label></FilterBar>', 0],
    ['vendor taxonomy', '<FilterBar><label>Vendor type<SelectCombobox value={typeFilter}><option>All types</option></SelectCombobox></label></FilterBar>', 0],
    ['trailer taxonomy', '<SelectCombobox><option>All trailer types</option></SelectCombobox>', 0],
    ['activity taxonomy', '<FilterBar><SelectCombobox aria-label="Driver activity filter" value={activityFilter}><option>All drivers</option></SelectCombobox></FilterBar>', 0],
    ['status taxonomy', '<FilterBar><Combobox ariaLabel="Status" value={statusFilter} placeholder="All trucks" /></FilterBar>', 0],
    ['universal search binding', '<FilterBar><input value={search} placeholder="Unit, driver, customer, status" /></FilterBar>', 0],
    ['taxonomy label cannot hide entity id', '<FilterBar><SelectCombobox label="Driver activity filter" value={driverId}><option>All drivers</option></SelectCombobox></FilterBar>', 1],
    ['taxonomy cannot hide entity kind', '<EntityPicker kind="trailer" placeholder="All trailer types" />', 1],
    ['boolean criterion', '<FilterBar><input type="checkbox" aria-label="Hide cancelled settlements" checked={hideCancelled}/></FilterBar>', 0],
    ['count threshold', '<FilterBar><input type="number" aria-label="Min loads" value={minLoads}/></FilterBar>', 0],
    ['id not exempt by number type', '<FilterBar><input type="number" aria-label="Load" value={loadId}/></FilterBar>', 1],
    ['camel aria label', '<FilterBar><Combobox ariaLabel="Driver" value={chosen}/></FilterBar>', 1],
    ['shared selection truncation', shared + '<Multi label="Driver" allLabel="All drivers" selected={selected.slice(0,1)}/>', 1],
    ['shared handler truncation', shared + '<Multi label="Driver" allLabel="All drivers" selected={selected} onChange={ids=>setValue(ids[0])}/>', 1],
  ];
  for (const [name, src, count] of cases) assert.equal(inspectSource('apps/frontend/src/pages/example/Plant.tsx', src).failures.length, count, name);
  const wrapper = 'import {MultiSelectDropdown} from "./forms/MultiSelectDropdown"; export function EntityMultiSelect({value,onChange}) {const selected = entityFilterIds(value); return <MultiSelectDropdown selected={selected} onChange={ids => { onChange(ids.length ? ids.join(",") : null); }} />;}';
  const wrapperCases = [
    ['canonical composition', wrapper, true],
    ['comment cannot fake composition', `/* ${wrapper} */ const view = null;`, false],
    ['first id only', wrapper.replace('ids.join(",")', 'ids[0]'), false],
    ['truncated selection', wrapper.replace('ids.join(",")', 'ids.slice(0, 1).join(",")'), false],
    ['fake shared import', wrapper.replace('./forms/MultiSelectDropdown', './Fake'), false],
    ['selection not bound', wrapper.replace('selected={selected}', 'selected={[]}'), false],
    ['dead join cannot mask first-only write', wrapper.replace('onChange(ids.length ? ids.join(",") : null);', 'if(false) onChange(ids.length ? ids.join(",") : null); onChange(ids[0] ?? null);'), false],
    ['mutation cannot trim selection', wrapper.replace('onChange(ids.length', 'ids.splice(1); onChange(ids.length'), false],
    ['reassignment cannot trim selection', wrapper.replace('onChange(ids.length', 'ids = ids.slice(0,1); onChange(ids.length'), false],
    ['unused JSX is not rendered', wrapper.replace('return <', 'const unused = <').replace('/>;}', '/>; return null;}'), false],
    ['selection must derive from incoming value', wrapper.replace('entityFilterIds(value)', '[]'), false],
  ];
  for (const [name, src, expected] of wrapperCases) assert.equal(validWrapper(src), expected, name);
  console.log(`verify-entity-filters-multi-select selftest PASS ${cases.length + wrapperCases.length}/${cases.length + wrapperCases.length}`);
}

export function validWrapper(source) {
  const sf = ts.createSourceFile('EntityMultiSelect.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const canonical = sf.statements.some(s => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === './forms/MultiSelectDropdown' && s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings) && s.importClause.namedBindings.elements.some(e => e.name.text === 'MultiSelectDropdown' && !e.propertyName));
  const component = sf.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'EntityMultiSelect' && s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
  if (!component?.body) return false;
  const selectionDeclaration = component.body.statements.filter(ts.isVariableStatement).flatMap(s => [...s.declarationList.declarations]).find(d => d.name.getText(sf) === 'selected');
  const initial = selectionDeclaration?.initializer;
  const derived = initial && (ts.isConditionalExpression(initial) ? initial.whenTrue : initial);
  if (!derived || !ts.isCallExpression(derived) || derived.expression.getText(sf) !== 'entityFilterIds' || derived.arguments.length !== 1 || derived.arguments[0].getText(sf) !== 'value') return false;
  let valid = false;
  let forbidden = false;
  function walk(n) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (['select', 'EntityPicker', 'Combobox'].includes(tag)) forbidden = true;
      if (tag === 'MultiSelectDropdown') {
        let rendered = false;
        for (let p = n.parent; p && p !== component.body; p = p.parent) {
          if (ts.isReturnStatement(p) && p.parent === component.body) rendered = true;
          if (ts.isVariableDeclaration(p)) break;
        }
        if (!rendered) return;
        const attrs = new Map(n.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(sf), a.initializer]));
        const selection = attrs.get('selected');
        const change = attrs.get('onChange');
        const callback = change && ts.isJsxExpression(change) ? change.expression : undefined;
        let preservesAll = false;
        let invalidCall = false;
        function calls(node) {
          if (ts.isCallExpression(node) && /^ids\.(?:splice|shift|pop|sort|reverse)$/.test(node.expression.getText(sf))) invalidCall = true;
          if (ts.isBinaryExpression(node) && /^ids(?:\.|\[|$)/.test(node.left.getText(sf)) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) invalidCall = true;
          if (ts.isCallExpression(node) && node.expression.getText(sf) === 'onChange' && node.arguments.length === 1) {
            const arg = node.arguments[0];
            const direct = ts.isExpressionStatement(node.parent) && node.parent.parent === callback.body;
            const all = direct && ts.isConditionalExpression(arg) && arg.condition.getText(sf) === 'ids.length' && arg.whenFalse.kind === ts.SyntaxKind.NullKeyword && ts.isCallExpression(arg.whenTrue) && arg.whenTrue.expression.getText(sf) === 'ids.join' && arg.whenTrue.arguments.length === 1 && ts.isStringLiteral(arg.whenTrue.arguments[0]) && arg.whenTrue.arguments[0].text === ',';
            preservesAll ||= all;
            invalidCall ||= !all;
          }
          ts.forEachChild(node, calls);
        }
        if (callback && ts.isArrowFunction(callback) && callback.parameters.length === 1 && callback.parameters[0].name.getText(sf) === 'ids') calls(callback.body);
        valid ||= !!selection && ts.isJsxExpression(selection) && selection.expression?.getText(sf) === 'selected' && preservesAll && !invalidCall;
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);
  return canonical && valid && !forbidden;
}

export function run(root = ROOT) {
  const wrapper = fs.readFileSync(path.join(root, 'apps/frontend/src/components/EntityMultiSelect.tsx'), 'utf8');
  if (!validWrapper(wrapper)) {
    console.error('EntityMultiSelect must compose the canonical MultiSelectDropdown and preserve every selected id');
    return 1;
  }
  const results = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && !['node_modules', '__tests__', 'dist'].includes(entry.name)) visit(file);
      else if (entry.isFile() && /\.tsx$/.test(file) && !/\.(test|spec|stories)\.tsx$/.test(file)) results.push(inspectSource(path.relative(root, file), fs.readFileSync(file, 'utf8')));
    }
  }
  visit(path.join(root, 'apps/frontend/src'));
  const failures = results.flatMap(r => r.failures);
  for (const f of failures) console.error(`${f.file}:${f.line}: ${f.control} ${f.entity}: ${f.reason}`);
  console.log(JSON.stringify({ filesScanned: results.length, detectedEntityFilters: results.reduce((n, r) => n + r.filters, 0), compliant: results.reduce((n, r) => n + r.compliant, 0), failed: failures.length, skipped: 0 }));
  return failures.length ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else process.exitCode = run();
}
