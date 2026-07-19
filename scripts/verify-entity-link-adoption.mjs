#!/usr/bin/env node
/**
 * Syntactic EntityLink adoption ratchet.
 *
 * This guard does not infer arbitrary alias semantics. It resolves only same-file lexical
 * declarations and direct helper returns. Outside a recognized link element, directly rendered
 * id-shaped properties and those narrowly resolved aliases/helpers are non-canonical findings.
 * Existing finding keys are ratcheted per file/rule; new code should render IDs through a direct
 * EntityLink/Link/NavLink/a expression. Canonical conditional/short-circuit links are accepted.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const BASELINE_FILE = path.join(ROOT, "scripts/entity-link-adoption-baseline.json");
const SKIP_RE = /(\/__tests__\/|\.test\.(tsx|ts)$|\.deprecated\.|test-setup\.ts$)/;
const ID_NAME_RE = /(^|_)id$|[a-z]Id$/;
const LINK_TAGS = new Set(["EntityLink", "Link", "NavLink", "a"]);

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

function walk(root, visit) {
  visit(root);
  ts.forEachChild(root, (child) => walk(child, visit));
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function isNullishOrLiteral(node) {
  return (
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node)
  );
}

function isDirectLink(node, sf) {
  return (
    (ts.isJsxElement(node) && LINK_TAGS.has(node.openingElement.tagName.getText(sf))) ||
    (ts.isJsxSelfClosingElement(node) && LINK_TAGS.has(node.tagName.getText(sf)))
  );
}

function isCanonicalLinkExpression(node, sf) {
  if (isDirectLink(node, sf)) return true;
  if (isNullishOrLiteral(node)) return true;
  if (ts.isParenthesizedExpression(node)) return isCanonicalLinkExpression(node.expression, sf);
  if (ts.isConditionalExpression(node)) {
    return isCanonicalLinkExpression(node.whenTrue, sf) && isCanonicalLinkExpression(node.whenFalse, sf);
  }
  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind)
  ) {
    return isCanonicalLinkExpression(node.right, sf);
  }
  return false;
}

function isDirectIdProperty(node) {
  const name = propertyName(node);
  return Boolean(name && ID_NAME_RE.test(name));
}

function isResolvedIdProperty(node, sf) {
  if (isDirectIdProperty(node)) return true;
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const key = resolvedStaticString(node.argumentExpression, sf);
    return Boolean(key && ID_NAME_RE.test(key));
  }
  return false;
}

function enclosingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return null;
}

function enclosingLexicalScope(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isBlock(current) || ts.isSourceFile(current)) return current;
  }
  return null;
}

function isInside(node, container) {
  for (let current = node; current; current = current.parent) {
    if (current === container) return true;
  }
  return false;
}

function bindingName(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

function lexicalDeclarations(sf, identifier) {
  const useFunction = enclosingFunction(identifier);
  const candidates = [];
  walk(sf, (node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isBindingElement(node)) &&
      bindingName(node) === identifier.text &&
      node.pos < identifier.pos &&
      enclosingFunction(node) === useFunction
    ) {
      const scope = enclosingLexicalScope(node);
      if (scope && isInside(identifier, scope)) candidates.push(node);
    }
  });
  return candidates.sort((a, b) => b.pos - a.pos);
}

function unwrapParentheses(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function resolvedStaticString(expr, sf, seen = new Set()) {
  if (ts.isStringLiteralLike(expr)) return expr.text;
  if (!ts.isIdentifier(expr)) return null;
  const token = `${expr.text}:${expr.pos}`;
  if (seen.has(token)) return null;
  seen.add(token);
  const value = lexicalValueBeforeUse(sf, expr);
  return value?.expression ? resolvedStaticString(value.expression, sf, seen) : null;
}

function propertyKeyIsId(name, sf) {
  if (!name) return false;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return ID_NAME_RE.test(name.text);
  if (ts.isComputedPropertyName(name)) {
    const value = resolvedStaticString(name.expression, sf);
    return Boolean(value && ID_NAME_RE.test(value));
  }
  return false;
}

function bindingWrite(declaration, sf) {
  if (ts.isVariableDeclaration(declaration)) {
    return declaration.initializer ? { expression: declaration.initializer, directId: false } : null;
  }
  if (!ts.isBindingElement(declaration)) return null;
  const variableDeclaration = declaration.parent.parent;
  if (!ts.isVariableDeclaration(variableDeclaration) || !variableDeclaration.initializer) return null;
  return {
    expression: variableDeclaration.initializer,
    directId: propertyKeyIsId(declaration.propertyName ?? declaration.name, sf),
  };
}

function destructuredAssignmentWrite(left, identifier, sf) {
  const target = unwrapParentheses(left);
  if (!ts.isObjectLiteralExpression(target)) return null;
  for (const property of target.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.initializer) &&
      property.initializer.text === identifier.text
    ) {
      return { expression: null, directId: propertyKeyIsId(property.name, sf), target: property.initializer };
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === identifier.text) {
      return { expression: null, directId: propertyKeyIsId(property.name, sf), target: property.name };
    }
  }
  return null;
}

function directAssignmentWrite(expression, identifier, declaration, sf) {
  if (
    !ts.isBinaryExpression(expression) ||
    expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
  ) {
    return null;
  }
  if (
    ts.isIdentifier(expression.left) &&
    expression.left.text === identifier.text &&
    lexicalDeclarations(sf, expression.left)[0] === declaration
  ) {
    return { expression: expression.right, directId: false };
  }
  const destructured = destructuredAssignmentWrite(expression.left, identifier, sf);
  return destructured?.target && lexicalDeclarations(sf, destructured.target)[0] === declaration
    ? { expression: destructured.expression, directId: destructured.directId }
    : null;
}

function descriptorKey(value, sf) {
  return value.directId
    ? "direct-id"
    : value.expression
      ? `expression:${value.expression.getText(sf)}`
      : "unknown";
}

function mergeValues(values, sf) {
  const unique = new Map();
  for (const value of values) unique.set(descriptorKey(value, sf), value);
  return [...unique.values()];
}

function applyExpressionFlow(values, expression, identifier, declaration, sf) {
  const direct = directAssignmentWrite(expression, identifier, declaration, sf);
  if (direct) return [direct];
  if (ts.isParenthesizedExpression(expression)) {
    return applyExpressionFlow(values, expression.expression, identifier, declaration, sf);
  }
  if (ts.isConditionalExpression(expression)) {
    return mergeValues([
      ...applyExpressionFlow(values, expression.whenTrue, identifier, declaration, sf),
      ...applyExpressionFlow(values, expression.whenFalse, identifier, declaration, sf),
    ], sf);
  }
  if (
    ts.isBinaryExpression(expression) &&
    [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]
      .includes(expression.operatorToken.kind)
  ) {
    return mergeValues([
      ...values,
      ...applyExpressionFlow(values, expression.right, identifier, declaration, sf),
    ], sf);
  }
  return values;
}

function applyStatementFlow(values, statement, identifier, declaration, sf) {
  if (ts.isExpressionStatement(statement)) {
    return applyExpressionFlow(values, statement.expression, identifier, declaration, sf);
  }
  if (ts.isBlock(statement)) {
    return statement.statements.reduce(
      (current, child) => applyStatementFlow(current, child, identifier, declaration, sf),
      values,
    );
  }
  if (ts.isIfStatement(statement)) {
    const thenValues = applyStatementFlow(values, statement.thenStatement, identifier, declaration, sf);
    const elseValues = statement.elseStatement
      ? applyStatementFlow(values, statement.elseStatement, identifier, declaration, sf)
      : values;
    return mergeValues([...thenValues, ...elseValues], sf);
  }
  if (
    ts.isForStatement(statement) ||
    ts.isForInStatement(statement) ||
    ts.isForOfStatement(statement) ||
    ts.isWhileStatement(statement) ||
    ts.isDoStatement(statement)
  ) {
    return mergeValues([
      ...values,
      ...applyStatementFlow(values, statement.statement, identifier, declaration, sf),
    ], sf);
  }
  if (ts.isSwitchStatement(statement)) {
    const branchValues = statement.caseBlock.clauses.flatMap((clause) =>
      clause.statements.reduce(
        (current, child) => applyStatementFlow(current, child, identifier, declaration, sf),
        values,
      ),
    );
    const hasDefault = statement.caseBlock.clauses.some(ts.isDefaultClause);
    return mergeValues(hasDefault ? branchValues : [...values, ...branchValues], sf);
  }
  return values;
}

function lexicalValuesBeforeUse(sf, identifier) {
  const declaration = lexicalDeclarations(sf, identifier)[0];
  if (!declaration) return [];
  const initialWrite = bindingWrite(declaration, sf);
  const bindingScope = enclosingLexicalScope(declaration);
  if (!bindingScope || !ts.isBlock(bindingScope)) return initialWrite ? [initialWrite] : [];
  let values = initialWrite ? [initialWrite] : [];
  for (const statement of bindingScope.statements) {
    if (statement.getEnd() <= declaration.getStart(sf)) continue;
    if (statement.getStart(sf) >= identifier.getStart(sf) || isInside(identifier, statement)) break;
    values = applyStatementFlow(values, statement, identifier, declaration, sf);
  }
  return mergeValues(values, sf);
}

function lexicalValueBeforeUse(sf, identifier) {
  const values = lexicalValuesBeforeUse(sf, identifier);
  return values.length === 1 ? values[0] : null;
}

function lexicalFunctions(sf, identifier) {
  const useFunction = enclosingFunction(identifier);
  const candidates = [];
  walk(sf, (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === identifier.text &&
      node.body &&
      (enclosingFunction(node) === useFunction || enclosingFunction(node) === null)
    ) {
      const scope = enclosingLexicalScope(node);
      if (scope && isInside(identifier, scope)) candidates.push(node);
    }
  });
  return candidates.sort((a, b) => b.pos - a.pos);
}

function directReturnExpression(fn) {
  if (!fn.body || !ts.isBlock(fn.body)) return null;
  const returns = fn.body.statements.filter(ts.isReturnStatement);
  return returns.length === 1 ? returns[0].expression ?? null : null;
}

function resolvedIdReason(expr, sf, seen = new Set()) {
  if (isCanonicalLinkExpression(expr, sf)) return null;
  if (isResolvedIdProperty(expr, sf)) return "direct-id";
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    return resolvedIdReason(expr.expression, sf, seen);
  }
  if (ts.isIdentifier(expr)) {
    if (ID_NAME_RE.test(expr.text)) return "named-id";
    const token = `variable:${expr.text}:${expr.pos}`;
    if (seen.has(token)) return null;
    seen.add(token);
    const values = lexicalValuesBeforeUse(sf, expr);
    return values.some(
      (value) => value.directId || (value.expression && resolvedIdReason(value.expression, sf, new Set(seen))),
    )
      ? "alias-id"
      : null;
  }
  if (ts.isCallExpression(expr)) {
    if (expr.arguments.some((argument) => resolvedIdReason(argument, sf, new Set(seen)))) {
      return "helper-id-argument";
    }
    if (ts.isIdentifier(expr.expression)) {
      const fn = lexicalFunctions(sf, expr.expression)[0];
      const returned = fn && directReturnExpression(fn);
      if (returned && resolvedIdReason(returned, sf, new Set(seen))) return "helper-returned-id";
    }
  }
  if (ts.isConditionalExpression(expr)) {
    return resolvedIdReason(expr.whenTrue, sf, new Set(seen)) ||
      resolvedIdReason(expr.whenFalse, sf, new Set(seen))
      ? "branch-id"
      : null;
  }
  if (ts.isBinaryExpression(expr)) {
    const renderedReason =
      expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? resolvedIdReason(expr.right, sf, new Set(seen))
        : resolvedIdReason(expr.left, sf, new Set(seen)) ||
          resolvedIdReason(expr.right, sf, new Set(seen));
    return renderedReason
      ? "branch-id"
      : null;
  }
  return null;
}

function enclosingTag(expression, sf) {
  const parent = expression.parent;
  if (ts.isJsxElement(parent)) return parent.openingElement.tagName.getText(sf);
  return null;
}

function normalizeExpression(node, sf) {
  return node.getText(sf).replace(/\s+/g, " ").trim();
}

function enclosingFunctionName(node) {
  const fn = enclosingFunction(node);
  if (!fn) return "(top-level)";
  if ("name" in fn && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const parent = fn.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return "(anonymous)";
}

function structuralLocation(node, sf) {
  const segments = [];
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (ts.isFunctionLike(parent)) {
      segments.push("function-body");
      break;
    }
    if (ts.isSourceFile(parent) || ts.isBlock(parent)) {
      const statements = parent.statements;
      const index = statements.indexOf(current);
      if (index >= 0) segments.push(`statement:${index}`);
    } else if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) {
      const index = parent.children.indexOf(current);
      if (index >= 0) segments.push(`jsx-child:${index}`);
    } else if (ts.isCallExpression(parent)) {
      const index = parent.arguments.indexOf(current);
      segments.push(index >= 0 ? `call-argument:${index}` : "call-target");
    } else if (ts.isPropertyAssignment(parent)) {
      segments.push(`property:${parent.name.getText(sf)}`);
    } else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      segments.push(`variable:${parent.name.text}`);
    } else if (ts.isReturnStatement(parent)) {
      segments.push("return-expression");
    } else if (ts.isConditionalExpression(parent)) {
      segments.push(
        current === parent.condition
          ? "conditional:condition"
          : current === parent.whenTrue
            ? "conditional:true"
            : "conditional:false",
      );
    } else if (ts.isBinaryExpression(parent)) {
      segments.push(current === parent.left ? "binary:left" : "binary:right");
    } else if (ts.isArrayLiteralExpression(parent)) {
      segments.push(`array-element:${parent.elements.indexOf(current)}`);
    } else if (ts.isJsxAttribute(parent)) {
      segments.push(`jsx-attribute:${parent.name.text}`);
    } else {
      const siblings = parent.getChildren(sf).filter((child) => child.kind === current.kind);
      segments.push(`${ts.SyntaxKind[parent.kind]}:${siblings.indexOf(current)}`);
    }
  }
  return segments.reverse().join("/");
}

export function scanSource(file, source) {
  const sf = parse(file, source);
  const findings = [];
  function visit(node) {
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      const tag = enclosingTag(node, sf);
      if (!tag || !LINK_TAGS.has(tag)) {
        const reason = resolvedIdReason(node.expression, sf);
        if (reason) {
          const position = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          findings.push({
            file: path.relative(ROOT, file),
            line: position.line + 1,
            tag: tag ?? "(fragment/expression)",
            reason,
            scope: enclosingFunctionName(node),
            location: structuralLocation(node, sf),
            expression: normalizeExpression(node.expression, sf),
            text: node.getText(sf).replace(/\s+/g, " ").trim().slice(0, 100),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return findings;
}

function scanTree() {
  return walkFiles(FRONTEND_ROOT).flatMap((file) =>
    scanSource(file, fs.readFileSync(file, "utf8")),
  );
}

function findingKey(finding) {
  return [finding.file, finding.scope, finding.location, finding.tag, finding.reason, finding.expression].join("|");
}

function findingFingerprint(finding) {
  return crypto.createHash("sha256").update(findingKey(finding)).digest("hex");
}

function findingCounts(findings) {
  const counts = {};
  const labels = new Map();
  for (const finding of findings) {
    const key = findingFingerprint(finding);
    const label = findingKey(finding);
    if (labels.has(key) && labels.get(key) !== label) {
      throw new Error(`finding fingerprint collision: ${key}`);
    }
    labels.set(key, label);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function baselineDifferences(current, baseline) {
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  return [...keys]
    .filter((key) => current[key] !== baseline[key])
    .sort()
    .map((key) => ({ key, current: current[key] ?? 0, baseline: baseline[key] ?? 0 }));
}

function runSelftest() {
  const cases = [
    ["direct-id", `const T=({row})=><td>{row.vendor_id}</td>`, 1],
    ["computed-id", `const T=({row})=><td>{row["vendor_id"]}</td>`, 1],
    ["alias-naked-id", `const T=({row})=>{const value=row.vendor_id;return <td>{value}</td>}`, 1],
    ["later-assigned-id", `const T=({row})=>{let value="safe";value=row.vendor_id;return <td>{value}</td>}`, 1],
    ["uninitialized-later-assigned-id", `const T=({row})=>{let value;value=row.vendor_id;return <td>{value}</td>}`, 1],
    ["later-safe-overwrite", `const T=({row})=>{let value=row.vendor_id;value="safe";return <td>{value}</td>}`, 0],
    ["destructured-alias", `const T=({row})=>{const {vendor_id:value}=row;return <td>{value}</td>}`, 1],
    ["computed-key-alias", `const T=({row})=>{const key="vendor_id";const value=row[key];return <td>{value}</td>}`, 1],
    ["later-destructured-assignment", `const T=({row})=>{let value="safe";({vendor_id:value}=row);return <td>{value}</td>}`, 1],
    ["multi-hop-destructured-alias", `const T=({row})=>{const {vendor_id:first}=row;const value=first;return <td>{value}</td>}`, 1],
    ["multi-hop-computed-key-alias", `const T=({row})=>{const first="vendor_id";const key=first;const value=row[key];return <td>{value}</td>}`, 1],
    ["multi-hop-later-destructured", `const T=({row})=>{let first;({vendor_id:first}=row);const value=first;return <td>{value}</td>}`, 1],
    ["conditional-sanitization", `const T=({row,flag})=>{let value=row.vendor_id;if(flag)value="safe";return <td>{value}</td>}`, 1],
    ["if-else-reaching-id", `const T=({row,flag})=>{let value="safe";if(flag)value=row.vendor_id;else value="safe";return <td>{value}</td>}`, 1],
    ["if-else-all-sanitized", `const T=({row,flag})=>{let value=row.vendor_id;if(flag)value="safe-a";else value="safe-b";return <td>{value}</td>}`, 0],
    ["ternary-reaching-id", `const T=({row,flag})=>{let value="safe";flag?(value=row.vendor_id):(value="safe");return <td>{value}</td>}`, 1],
    ["ternary-all-sanitized", `const T=({row,flag})=>{let value=row.vendor_id;flag?(value="safe-a"):(value="safe-b");return <td>{value}</td>}`, 0],
    ["loop-reaching-id", `const T=({row,flag})=>{let value="safe";while(flag){value=row.vendor_id}return <td>{value}</td>}`, 1],
    ["loop-conditional-sanitization", `const T=({row,flag})=>{let value=row.vendor_id;while(flag){value="safe"}return <td>{value}</td>}`, 1],
    ["switch-reaching-id", `const T=({row,mode})=>{let value="safe";switch(mode){case "id":value=row.vendor_id;break;case "safe":value="safe";break;default:value="safe"}return <td>{value}</td>}`, 1],
    ["switch-all-sanitized", `const T=({row,mode})=>{let value=row.vendor_id;switch(mode){case "a":value="safe-a";break;case "b":value="safe-b";break;default:value="safe-c"}return <td>{value}</td>}`, 0],
    ["helper-returned-id", `function pick(row){return row.vendor_id}const T=({row})=><td>{pick(row)}</td>`, 1],
    ["helper-with-id-argument", `const T=({row})=><td>{show(row.vendor_id)}</td>`, 1],
    ["direct-entity-link", `const T=({row})=><td><EntityLink kind="vendor" id={row.vendor_id}/></td>`, 0],
    ["conditional-links", `const T=({row,ok})=><td>{ok?<EntityLink kind="vendor" id={row.vendor_id}/>:<Link to="/vendors"/>}</td>`, 0],
    ["short-circuit-link", `const T=({row,ok})=><td>{ok&&<EntityLink kind="vendor" id={row.vendor_id}/>}</td>`, 0],
    ["fallback-link", `const T=({row})=><td>{row.vendor_id?<EntityLink kind="vendor" id={row.vendor_id}/>:null}</td>`, 0],
    ["direct-label", `const T=({row})=><td>{row.vendor_name}</td>`, 0],
    ["comment-string-decoy", `// {row.vendor_id}\nconst x="{row.vendor_id}";const T=()=>null`, 0],
    ["parse-error", `const T=()=> <td>{`, "throws"],
  ];
  const problems = [];
  for (const [name, source, expected] of cases) {
    try {
      const count = scanSource(`${name}.tsx`, source).length;
      if (expected === "throws" || count !== expected) {
        problems.push(`${name}: expected ${expected}, received ${count}`);
      }
    } catch {
      if (expected !== "throws") problems.push(`${name}: unexpectedly failed parsing`);
    }
  }
  const baseline = findingCounts(scanSource("baseline.tsx", `const A=({row})=><td>{row.vendor_id}</td>`));
  const offsetCurrent = findingCounts(scanSource("baseline.tsx", `const A=({row})=><td>{row.driver_id}</td>`));
  if (Object.keys(baseline).length !== 1 || Object.keys(offsetCurrent).length !== 1 || baselineDifferences(offsetCurrent, baseline).length !== 2) {
    problems.push("offset-cancellation: remove-one/add-different must fail even when total count is unchanged");
  }
  const [knownFingerprint] = Object.keys(baseline);
  if (baselineDifferences(baseline, { ...baseline, [knownFingerprint]: baseline[knownFingerprint] + 1000 }).length !== 1) {
    problems.push("baseline-inflation: an arbitrary count increase must fail");
  }
  if (baselineDifferences(baseline, { ...baseline, ["9".repeat(64)]: 1 }).length !== 1) {
    problems.push("baseline-extra: an unknown fingerprint must fail");
  }
  const originalLocation = findingCounts(
    scanSource("move.tsx", `const T=({row})=><section><div>{row.vendor_id}</div><div /></section>`),
  );
  const movedLocation = findingCounts(
    scanSource("move.tsx", `const T=({row})=><section><div /><div>{row.vendor_id}</div></section>`),
  );
  if (baselineDifferences(movedLocation, originalLocation).length !== 2) {
    problems.push("move-one-location-cancellation: moving an identical naked ID must create distinct structural fingerprints");
  }
  if (problems.length) {
    console.error(`verify:entity-link-adoption --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`verify:entity-link-adoption --selftest PASS cases=${cases.map(([name]) => name).join(",")}; baseline-rejects=offset-cancellation,move-one-location-cancellation,inflated-count,unknown-hash`);
}

function main() {
  if (process.argv.includes("--selftest")) return runSelftest();
  let findings;
  try {
    findings = scanTree();
  } catch (error) {
    console.error(`verify:entity-link-adoption FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const current = findingCounts(findings);
  if (process.argv.includes("--print-baseline")) {
    process.stdout.write(`${JSON.stringify({ version: 2, findings: current }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--update-baseline")) {
    if (process.env.UPDATE_ENTITY_LINK_ADOPTION_BASELINE !== "1") {
      console.error("verify:entity-link-adoption FAIL — --update-baseline requires UPDATE_ENTITY_LINK_ADOPTION_BASELINE=1");
      process.exit(1);
    }
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({ version: 2, findings: current }, null, 2)}\n`);
    console.log(`verify:entity-link-adoption updated exact structural baseline at ${path.relative(ROOT, BASELINE_FILE)}`);
    return;
  }
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error("verify:entity-link-adoption FAIL — scripts/entity-link-adoption-baseline.json is missing");
    process.exit(1);
  }
  let baselineDocument;
  try {
    baselineDocument = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  } catch (error) {
    console.error(`verify:entity-link-adoption FAIL — baseline parse failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  if (baselineDocument?.version !== 2 || !baselineDocument.findings || typeof baselineDocument.findings !== "object") {
    console.error("verify:entity-link-adoption FAIL — baseline must have version 2 and a findings object");
    process.exit(1);
  }
  const malformedBaseline = Object.entries(baselineDocument.findings).filter(
    ([fingerprint, count]) => !/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isInteger(count) || count < 1,
  );
  if (malformedBaseline.length) {
    console.error("verify:entity-link-adoption FAIL — baseline fingerprints must be SHA-256 hex with positive integer counts");
    process.exit(1);
  }
  const differences = baselineDifferences(current, baselineDocument.findings);
  console.log(`verify:entity-link-adoption scanned ${findings.length} narrow ID findings across ${Object.keys(current).length} stable keys`);
  if (differences.length) {
    for (const difference of differences) {
      const finding = findings.find((candidate) => findingFingerprint(candidate) === difference.key);
      console.error(`  DRIFT ${difference.key} current=${difference.current} baseline=${difference.baseline} ${finding ? findingKey(finding) : ""}`);
    }
    console.error("verify:entity-link-adoption FAIL — baseline must exactly equal current per-finding fingerprints/counts; regenerate intentionally after removals");
    process.exit(1);
  }
  console.log("verify:entity-link-adoption PASS — exact stable finding-key baseline (no extras, inflation, removal, or cancellation)");
}

main();
