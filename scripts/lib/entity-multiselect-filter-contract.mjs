import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const ts = createRequire(new URL('../../apps/frontend/package.json', import.meta.url))('typescript');

/** Checks the actual named filter mount, never a comment/import elsewhere. */
export function multiSelectFilterProblems(source, { file, kind, testId }) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set();
  for (const node of sf.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const spec = node.moduleSpecifier.text;
    const resolved = spec.startsWith('@/') ? `apps/frontend/src/${spec.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    if (resolved.replace(/\.(?:tsx|js)$/, '') !== 'apps/frontend/src/components/EntityMultiSelect') continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) if ((item.propertyName ?? item.name).text === 'EntityMultiSelect') names.add(item.name.text);
  }
  const found = [];
  function walk(n) {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && names.has(n.tagName.getText(sf))) {
      const props = new Map(n.attributes.properties.filter(ts.isJsxAttribute).map(p => [p.name.getText(sf), p.initializer]));
      if (testId ? props.get('dataTestId') && ts.isStringLiteral(props.get('dataTestId')) && props.get('dataTestId').text === testId : props.get('kind')?.text === kind) found.push({ n, props });
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);
  if (found.length !== 1) return [`${testId}: expected one canonical EntityMultiSelect filter mount, found ${found.length}`];
  const { n, props } = found[0];
  const failures = [];
  if (props.get('kind')?.text !== kind) failures.push(`${testId}: wrong entity kind`);
  for (const key of ['operatingCompanyId', 'value']) {
    const value = props.get(key);
    if (!value || !ts.isJsxExpression(value) || !value.expression || !/[A-Za-z_]/.test(value.expression.getText(sf)) || /^(?:null|undefined|false|true|["'`])/.test(value.expression.getText(sf))) failures.push(`${testId}: missing dynamic ${key}`);
  }
  if (n.attributes.properties.some(ts.isJsxSpreadAttribute) || ['allowCreate', 'onCreate', 'createLabel'].some(p => props.has(p))) failures.push(`${testId}: filter cannot expose creation/spread props`);
  const handler = props.get('onChange');
  const fn = handler && ts.isJsxExpression(handler) ? handler.expression : null;
  if (!fn || !ts.isArrowFunction(fn) || fn.parameters.length !== 1 || !ts.isIdentifier(fn.parameters[0].name)) failures.push(`${testId}: expected explicit one-argument selection handler`);
  else {
    const param = fn.parameters[0].name.text;
    const body = fn.body.getText(sf);
    const aliases = new Set([param]);
    let overwritten = false;
    const fullValue = node => node && (ts.isIdentifier(node) && aliases.has(node.text) || ts.isParenthesizedExpression(node) && fullValue(node.expression) || ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind) && fullValue(node.left) && ts.isStringLiteral(node.right) && node.right.text === '');
    let forwarded = false;
    if (ts.isBlock(fn.body)) {
      for (const statement of fn.body.statements) {
        if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
          for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && fullValue(declaration.initializer)) aliases.add(declaration.name.text);
        }
        if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
          const call = statement.expression;
          if (ts.isIdentifier(call.expression) && /^set[A-Z]/.test(call.expression.text) && call.arguments.length === 1 && fullValue(call.arguments[0])) forwarded = true;
          if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'setDraft' && call.arguments.length === 1) {
            const arg = call.arguments[0];
            if (ts.isArrowFunction(arg)) {
              const result = ts.isParenthesizedExpression(arg.body) ? arg.body.expression : arg.body;
              if (ts.isObjectLiteralExpression(result)) forwarded ||= result.properties.some(p => ts.isPropertyAssignment(p) && fullValue(p.initializer));
            }
          }
        }
        if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) break;
      }
    } else if (ts.isCallExpression(fn.body)) {
      const call = fn.body;
      forwarded = call.arguments.some(fullValue);
      forwarded ||= call.arguments.some(arg => ts.isObjectLiteralExpression(arg) && arg.properties.some(p => ts.isPropertyAssignment(p) && fullValue(p.initializer)));
      // staged.setDraft(d => ({...d, driverId: next ?? ''})) keeps the
      // complete CSV value; only actual property assignments count.
      for (const arg of call.arguments) if (ts.isArrowFunction(arg)) {
        const expr = ts.isParenthesizedExpression(arg.body) ? arg.body.expression : arg.body;
        if (ts.isObjectLiteralExpression(expr)) forwarded ||= expr.properties.some(p => ts.isPropertyAssignment(p) && fullValue(p.initializer));
      }
    }
    function assignment(node) {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && aliases.has(node.left.text)) overwritten = true;
      ts.forEachChild(node, assignment);
    }
    assignment(fn.body);
    if (!forwarded || overwritten || /\.(?:split|slice|splice|at)\s*\(|\[\s*\d+\s*\]/.test(body)) failures.push(`${testId}: handler must forward all selected IDs, not truncate or ignore them`);
  }
  let rendered = false;
  let jsxBinding = null;
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isBinaryExpression(p) && p.left.kind === ts.SyntaxKind.FalseKeyword) failures.push(`${testId}: unreachable false branch`);
    if (ts.isConditionalExpression(p) && p.condition.kind === ts.SyntaxKind.FalseKeyword) failures.push(`${testId}: unreachable conditional`);
    if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && !ts.isBlock(p.body))) rendered = true;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) jsxBinding = p.name.text;
  }
  if (!rendered && jsxBinding) {
    function boundUse(node) {
      if (ts.isIdentifier(node) && node.text === jsxBinding && ts.isJsxExpression(node.parent)) {
        let returned = false, dead = false;
        for (let p = node.parent; p; p = p.parent) {
          if (ts.isReturnStatement(p)) returned = true;
          if (ts.isBinaryExpression(p) && p.left.kind === ts.SyntaxKind.FalseKeyword) dead = true;
        }
        if (returned && !dead) rendered = true;
      }
      ts.forEachChild(node, boundUse);
    }
    boundUse(sf);
  }
  if (!rendered) failures.push(`${testId}: filter must be rendered, not unused JSX`);
  return failures;
}
export function selftestMultiSelectFilterContract() {
  const options = {file:'apps/frontend/src/pages/example/Page.tsx',kind:'driver',testId:'driver-filter'};
  const good = `import {EntityMultiSelect} from '../../components/EntityMultiSelect'; export function Page() { return <EntityMultiSelect kind="driver" dataTestId="driver-filter" operatingCompanyId={companyId} value={selected} onChange={next => setSelected(next ?? '')} />; }`;
  assert.deepEqual(multiSelectFilterProblems(good,options),[]);
  const plants = [good.replace('EntityMultiSelect\'','Impostor\''), good.replace('kind="driver"','kind="unit"'),good.replace('operatingCompanyId={companyId}','operatingCompanyId={""}'),good.replace('value={selected}','value={null}'),good.replace('setSelected(next ?? \'\')','setSelected(next.split(",")[0])'),good.replace('setSelected(next ?? \'\')','setSelected("")'),good.replace('return <','return false && <'),good.replace('return <','const unused = <'),good.replace('kind="driver"','allowCreate kind="driver"'),good.replace('return <','return null; /* <').replace('/>; }','/> */ }')];
  for (const plant of plants) assert.ok(multiSelectFilterProblems(plant,options).length,plant);
  const block = good.replace("setSelected(next ?? '')", "{ const id = next ?? ''; setSelected(id); setSearchParams(prev => prev); }");
  assert.deepEqual(multiSelectFilterProblems(block, options), []);
  for (const plant of [block.replace("const id = next ?? ''", "const id = next.split(',')[0]"), block.replace('setSelected(id)', 'setSelected(\'\')'), block.replace('setSelected(id)', 'if(false) setSelected(id)'), block.replace('setSelected(id)', 'return; setSelected(id)'), block.replace("const id = next ?? ''", "const id = 'next'"),block.replace('setSelected(id)', 'const unused = () => setSelected(id)'), block.replace("const id = next ?? ''", "next = ''; const id = next ?? ''")]) assert.ok(multiSelectFilterProblems(plant,options).length,plant);
  const staged = block.replace('setSelected(id)', 'staged.setDraft(p => ({ ...p, driverId: id }))');
  assert.deepEqual(multiSelectFilterProblems(staged, options), []);
  for (const plant of [staged.replace('driverId: id','driverId: ""'), staged.replace("const id = next ?? ''", "const id = next?.split(',')[0] ?? ''"),staged.replace('staged.setDraft','if(false) staged.setDraft')]) assert.ok(multiSelectFilterProblems(plant,options).length,plant);
  return 23;
}
