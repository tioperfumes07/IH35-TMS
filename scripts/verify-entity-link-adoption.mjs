#!/usr/bin/env node
/**
 * Scope-aware EntityLink adoption ratchet.
 *
 * The scanner resolves bindings at the JSX use site. It deliberately has no file-global alias map:
 * every function/block owns a lexical scope, later assignments update only the nearest declaration,
 * and shadowing cannot leak between siblings. Unknown display wrappers fail closed by propagating
 * every argument; known local helpers propagate their returned value.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const SKIP_RE = /(\/__tests__\/|\.test\.(tsx|ts)$|\.deprecated\.|test-setup\.ts$)/;
const MAX_LEGACY_FINDINGS = 76;
const MAX_SEMANTIC_FINDINGS = 148;
const ID_NAME_RE = /(^|_)id$|[a-z]Id$/;
const LINK_TAGS = new Set(["EntityLink", "Link", "NavLink", "a"]);

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
    this.functions = new Map();
  }
  declare(name, value) {
    this.bindings.set(name, value);
  }
  assign(name, value) {
    for (let scope = this; scope; scope = scope.parent) {
      if (scope.bindings.has(name)) {
        scope.bindings.set(name, value);
        return;
      }
    }
    this.bindings.set(name, value);
  }
  lookup(name) {
    for (let scope = this; scope; scope = scope.parent) {
      if (scope.bindings.has(name)) return scope.bindings.get(name);
    }
    return null;
  }
  lookupFunction(name) {
    for (let scope = this; scope; scope = scope.parent) {
      if (scope.functions.has(name)) return scope.functions.get(name);
    }
    return null;
  }
}

function parse(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  if (sf.parseDiagnostics.length) {
    const details = sf.parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
      .join("; ");
    throw new Error(`${file}: TypeScript parse failed: ${details}`);
  }
  return sf;
}

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (/\.tsx$/.test(entry.name) && !SKIP_RE.test(absolute.replaceAll("\\", "/"))) files.push(absolute);
  }
  return files;
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    if (ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
  }
  return null;
}

function mergeNames(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function substituteScope(fn, args, callerScope) {
  const child = new Scope(callerScope);
  fn.parameters.forEach((parameter, index) => {
    if (ts.isIdentifier(parameter.name)) {
      child.declare(parameter.name.text, args[index] ?? null);
    }
  });
  return child;
}

function returnedExpressions(fn) {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
  const returns = [];
  function visit(node) {
    if (node !== fn.body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) returns.push(node.expression);
    ts.forEachChild(node, visit);
  }
  visit(fn.body);
  return returns;
}

function resolveNames(expr, scope, seen = new Set()) {
  if (!expr) return [];
  if (ts.isIdentifier(expr)) {
    const key = `binding:${expr.text}`;
    if (seen.has(key)) return [expr.text];
    const binding = scope.lookup(expr.text);
    if (!binding) return [expr.text];
    const next = new Set(seen);
    next.add(key);
    return mergeNames([expr.text], resolveNames(binding, scope, next));
  }
  const directProperty = propertyName(expr);
  if (directProperty) return [directProperty];
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isAwaitExpression(expr)
  ) {
    return resolveNames(expr.expression, scope, seen);
  }
  if (ts.isConditionalExpression(expr)) {
    return mergeNames(resolveNames(expr.whenTrue, scope, seen), resolveNames(expr.whenFalse, scope, seen));
  }
  if (ts.isBinaryExpression(expr)) {
    if (
      expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      return resolveNames(expr.left, scope, seen);
    }
    return mergeNames(resolveNames(expr.left, scope, seen), resolveNames(expr.right, scope, seen));
  }
  if (ts.isCallExpression(expr)) {
    if (ts.isIdentifier(expr.expression)) {
      const fn = scope.lookupFunction(expr.expression.text);
      if (fn) {
        const key = `function:${expr.expression.text}`;
        if (!seen.has(key)) {
          const next = new Set(seen);
          next.add(key);
          const callScope = substituteScope(fn, expr.arguments, scope);
          return mergeNames(...returnedExpressions(fn).map((returned) => resolveNames(returned, callScope, next)));
        }
      }
    }
    // Unknown wrappers are not proof that an id became a link. Follow all arguments fail-closed.
    return mergeNames(...expr.arguments.map((argument) => resolveNames(argument, scope, seen)));
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return mergeNames(...expr.elements.map((element) => resolveNames(element, scope, seen)));
  }
  if (ts.isObjectLiteralExpression(expr)) {
    return mergeNames(
      ...expr.properties.map((property) => {
        if (ts.isPropertyAssignment(property)) return resolveNames(property.initializer, scope, seen);
        if (ts.isShorthandPropertyAssignment(property)) return resolveNames(property.name, scope, seen);
        return [];
      }),
    );
  }
  return [];
}

function bindPattern(name, initializer, scope) {
  if (ts.isIdentifier(name)) {
    scope.declare(name.text, initializer);
    return;
  }
  if (!ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)) return;
  name.elements.forEach((element, index) => {
    if (!ts.isBindingElement(element)) return;
    let value = null;
    if (initializer) {
      if (ts.isObjectBindingPattern(name)) {
        const keyNode = element.propertyName ?? element.name;
        if (ts.isIdentifier(keyNode) || ts.isStringLiteralLike(keyNode)) {
          value = ts.factory.createElementAccessExpression(initializer, ts.factory.createStringLiteral(keyNode.text));
        } else if (ts.isComputedPropertyName(keyNode) && ts.isStringLiteralLike(keyNode.expression)) {
          value = ts.factory.createElementAccessExpression(initializer, keyNode.expression);
        }
      } else {
        value = ts.factory.createElementAccessExpression(initializer, ts.factory.createNumericLiteral(index));
      }
    }
    bindPattern(element.name, value ?? element.initializer ?? null, scope);
  });
}

function legacyNames(expr) {
  if (!expr) return [];
  if (ts.isIdentifier(expr)) return [expr.text];
  const name = propertyName(expr);
  if (name) return [name];
  if (ts.isParenthesizedExpression(expr)) return legacyNames(expr.expression);
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return legacyNames(expr.left);
  }
  return [];
}

export function scanSource(file, source, semantic = true) {
  const sf = parse(file, source);
  const findings = [];

  function record(node, scope) {
    const names = semantic ? resolveNames(node.expression, scope) : legacyNames(node.expression);
    if (!names.some((name) => ID_NAME_RE.test(name))) return;
    const tag = ts.isJsxElement(node.parent) ? node.parent.openingElement.tagName.getText(sf) : null;
    if (tag && LINK_TAGS.has(tag)) return;
    const position = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({
      file: path.relative(ROOT, file),
      line: position.line + 1,
      tag: tag ?? "(fragment/expression)",
      text: node.getText(sf).replace(/\s+/g, " ").trim().slice(0, 100),
    });
  }

  function visit(node, scope) {
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) {
      const blockScope = ts.isSourceFile(node) ? scope : new Scope(scope);
      for (const statement of node.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name) {
          blockScope.functions.set(statement.name.text, statement);
        }
      }
      for (const statement of node.statements) visit(statement, blockScope);
      return;
    }
    if (ts.isFunctionLike(node)) {
      const functionScope = new Scope(scope);
      for (const parameter of node.parameters) bindPattern(parameter.name, null, functionScope);
      if (node.name && ts.isIdentifier(node.name)) functionScope.functions.set(node.name.text, node);
      if (node.body) visit(node.body, functionScope);
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      bindPattern(node.name, node.initializer ?? null, scope);
      if (node.initializer) visit(node.initializer, scope);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      visit(node.right, scope);
      scope.assign(node.left.text, node.right);
      return;
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) record(node, scope);
    ts.forEachChild(node, (child) => visit(child, scope));
  }

  visit(sf, new Scope());
  return findings;
}

function scanTree(semantic) {
  return walkFiles(FRONTEND_ROOT).flatMap((file) =>
    scanSource(file, fs.readFileSync(file, "utf8"), semantic),
  );
}

function expectCase(test, expected) {
  const actual = scanSource(`${test.name}.tsx`, test.source).length;
  if (actual !== expected) throw new Error(`${test.name}: expected ${expected}, received ${actual}`);
}

function runSelftest() {
  const cases = [
    ["plain-property", `const T=({row})=><td>{row.vendor_id}</td>`, 1],
    ["computed-property", `const T=({row})=><td>{row["vendor_id"]}</td>`, 1],
    ["assignment-alias", `const T=({row})=>{let value; value=row.vendor_id; return <td>{value}</td>}`, 1],
    ["destructured-alias", `const T=({row})=>{const {vendor_id:value}=row; return <td>{value}</td>}`, 1],
    ["computed-destructure", `const T=({row})=>{const {["vendor_id"]:value}=row; return <td>{value}</td>}`, 1],
    ["multi-hop", `const T=({row})=>{const a=row.vendor_id; const b=a; return <td>{b}</td>}`, 1],
    ["helper-return", `function pick(row){return row.vendor_id} const T=({row})=><td>{pick(row)}</td>`, 1],
    ["result-alias", `function pick(row){return row.vendor_id} const T=({row})=>{const x=pick(row);return <td>{x}</td>}`, 1],
    ["unknown-wrapper", `const T=({row})=><td>{formatUnknown(row.vendor_id)}</td>`, 1],
    ["string-wrapper", `const T=({row})=><td>{String(row.vendor_id)}</td>`, 1],
    ["linked", `const T=({row})=><EntityLink kind="vendor" id={row.vendor_id}/>`, 0],
    ["linked-wrapper", `const T=({row})=><td>{show(<EntityLink kind="vendor" id={row.vendor_id}/>)}</td>`, 0],
    ["linked-branches", `const T=({row,ok})=><td>{ok?<EntityLink kind="vendor" id={row.vendor_id}/>:<Link to="/"/>}</td>`, 0],
    ["scope-shadowing", `const value=outer.vendor_id; function T(){const value="safe";return <td>{value}</td>}`, 0],
    ["sibling-scope", `function A(){const value=row.vendor_id;return null} function B(){const value="safe";return <td>{value}</td>}`, 0],
    ["later-safe-assignment", `function T(){let value=row.vendor_id; value="safe"; return <td>{value}</td>}`, 0],
    ["later-id-assignment", `function T(){let value="safe"; value=row.vendor_id; return <td>{value}</td>}`, 1],
    ["comment-decoy", `// {row.vendor_id}\nconst fake="{row.vendor_id}"; const T=()=>null`, 0],
  ].map(([name, source, expected]) => ({ name, source, expected }));
  for (const test of cases) expectCase(test, test.expected);
  console.log(`verify:entity-link-adoption --selftest PASS ${cases.length} lexical/alias/metamorphic cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }
  const legacy = scanTree(false);
  const semantic = scanTree(true);
  console.log(
    `verify:entity-link-adoption scanned ${legacy.length} legacy (max ${MAX_LEGACY_FINDINGS}) and ` +
      `${semantic.length} semantic (max ${MAX_SEMANTIC_FINDINGS}) candidates`,
  );
  if (legacy.length > MAX_LEGACY_FINDINGS || semantic.length > MAX_SEMANTIC_FINDINGS) {
    for (const finding of semantic) {
      console.error(`  ${finding.file}:${finding.line} <${finding.tag}> ${finding.text}`);
    }
    console.error("verify:entity-link-adoption FAIL — semantic adoption baseline increased");
    process.exit(1);
  }
  console.log("verify:entity-link-adoption PASS — lexical semantic ratchet preserved");
}

main();
