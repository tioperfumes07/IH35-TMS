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

function lexicalDeclarations(sf, identifier) {
  const useFunction = enclosingFunction(identifier);
  const candidates = [];
  walk(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier.text &&
      node.initializer &&
      node.pos < identifier.pos &&
      enclosingFunction(node) === useFunction
    ) {
      const scope = enclosingLexicalScope(node);
      if (scope && isInside(identifier, scope)) candidates.push(node);
    }
  });
  return candidates.sort((a, b) => b.pos - a.pos);
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
  if (isDirectIdProperty(expr)) return "direct-id";
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
    const declaration = lexicalDeclarations(sf, expr)[0];
    return declaration?.initializer && resolvedIdReason(declaration.initializer, sf, seen)
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
  return [finding.file, finding.scope, finding.tag, finding.reason, finding.expression].join("|");
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

function newFindingKeys(current, baseline) {
  return Object.entries(current)
    .filter(([key, count]) => count > (baseline[key] ?? 0))
    .map(([key, count]) => ({ key, count, baseline: baseline[key] ?? 0 }));
}

function runSelftest() {
  const cases = [
    ["direct-id", `const T=({row})=><td>{row.vendor_id}</td>`, 1],
    ["computed-id", `const T=({row})=><td>{row["vendor_id"]}</td>`, 1],
    ["alias-naked-id", `const T=({row})=>{const value=row.vendor_id;return <td>{value}</td>}`, 1],
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
  if (Object.keys(baseline).length !== 1 || Object.keys(offsetCurrent).length !== 1 || newFindingKeys(offsetCurrent, baseline).length !== 1) {
    problems.push("offset-cancellation: remove-one/add-different must fail even when total count is unchanged");
  }
  if (problems.length) {
    console.error(`verify:entity-link-adoption --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`verify:entity-link-adoption --selftest PASS ${cases.length} canonical syntax cases + offset-cancellation reject`);
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
    process.stdout.write(`${JSON.stringify({ version: 1, findings: current }, null, 2)}\n`);
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
  if (baselineDocument?.version !== 1 || !baselineDocument.findings || typeof baselineDocument.findings !== "object") {
    console.error("verify:entity-link-adoption FAIL — baseline must have version 1 and a findings object");
    process.exit(1);
  }
  const additions = newFindingKeys(current, baselineDocument.findings);
  console.log(`verify:entity-link-adoption scanned ${findings.length} narrow ID findings across ${Object.keys(current).length} stable keys`);
  if (additions.length) {
    for (const addition of additions) {
      const finding = findings.find((candidate) => findingFingerprint(candidate) === addition.key);
      console.error(`  NEW ${addition.key} count=${addition.count} baseline=${addition.baseline} ${finding ? findingKey(finding) : ""}`);
    }
    console.error("verify:entity-link-adoption FAIL — new per-file/per-rule finding key detected");
    process.exit(1);
  }
  console.log("verify:entity-link-adoption PASS — no new stable finding keys (removals cannot offset additions)");
}

main();
