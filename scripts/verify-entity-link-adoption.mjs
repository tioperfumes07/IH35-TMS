#!/usr/bin/env node
/**
 * Syntactic EntityLink adoption ratchet.
 *
 * This guard intentionally does not infer alias semantics. Outside a recognized link element,
 * directly rendered id-shaped properties and opaque bare identifier/helper expressions are
 * non-canonical findings. Existing findings are ratcheted; new code should render IDs through
 * a direct EntityLink/Link/NavLink/a expression. Canonical conditional/short-circuit link
 * expressions are accepted.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const SKIP_RE = /(\/__tests__\/|\.test\.(tsx|ts)$|\.deprecated\.|test-setup\.ts$)/;
const LEGACY_BASELINE = 76;
const CANONICAL_EXPRESSION_BASELINE = 7839;
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

function containsIdProperty(node) {
  let found = false;
  function visit(candidate) {
    const name = propertyName(candidate);
    if (name && ID_NAME_RE.test(name)) found = true;
    ts.forEachChild(candidate, visit);
  }
  visit(node);
  return found;
}

function legacyCandidate(expr) {
  if (ts.isIdentifier(expr)) return ID_NAME_RE.test(expr.text);
  const name = propertyName(expr);
  if (name) return ID_NAME_RE.test(name);
  if (ts.isParenthesizedExpression(expr)) return legacyCandidate(expr.expression);
  if (
    ts.isBinaryExpression(expr) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expr.operatorToken.kind)
  ) {
    return legacyCandidate(expr.left);
  }
  return false;
}

function canonicalCandidate(expr, sf) {
  if (isCanonicalLinkExpression(expr, sf)) return null;
  if (containsIdProperty(expr)) return "direct-id";
  if (ts.isIdentifier(expr)) return "opaque-alias";
  if (ts.isCallExpression(expr)) return "opaque-helper";
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    return canonicalCandidate(expr.expression, sf);
  }
  if (
    ts.isBinaryExpression(expr) ||
    ts.isConditionalExpression(expr)
  ) {
    return "opaque-branch";
  }
  return null;
}

function enclosingTag(expression, sf) {
  const parent = expression.parent;
  if (ts.isJsxElement(parent)) return parent.openingElement.tagName.getText(sf);
  return null;
}

export function scanSource(file, source, mode = "canonical") {
  const sf = parse(file, source);
  const findings = [];
  function visit(node) {
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      const tag = enclosingTag(node, sf);
      if (!tag || !LINK_TAGS.has(tag)) {
        const reason = mode === "legacy"
          ? (legacyCandidate(node.expression) ? "legacy-id" : null)
          : canonicalCandidate(node.expression, sf);
        if (reason) {
          const position = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          findings.push({
            file: path.relative(ROOT, file),
            line: position.line + 1,
            tag: tag ?? "(fragment/expression)",
            reason,
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

function scanTree(mode) {
  return walkFiles(FRONTEND_ROOT).flatMap((file) =>
    scanSource(file, fs.readFileSync(file, "utf8"), mode),
  );
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
  if (problems.length) {
    console.error(`verify:entity-link-adoption --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`verify:entity-link-adoption --selftest PASS ${cases.length} canonical syntax cases`);
}

function main() {
  if (process.argv.includes("--selftest")) return runSelftest();
  let legacy;
  let canonical;
  try {
    legacy = scanTree("legacy");
    canonical = scanTree("canonical");
  } catch (error) {
    console.error(`verify:entity-link-adoption FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.log(
    `verify:entity-link-adoption scanned ${legacy.length} legacy (max ${LEGACY_BASELINE}) and ` +
      `${canonical.length} canonical-expression findings (max ${CANONICAL_EXPRESSION_BASELINE})`,
  );
  if (legacy.length > LEGACY_BASELINE || canonical.length > CANONICAL_EXPRESSION_BASELINE) {
    for (const finding of canonical) {
      console.error(`  ${finding.file}:${finding.line} <${finding.tag}> [${finding.reason}] ${finding.text}`);
    }
    console.error("verify:entity-link-adoption FAIL — canonical syntax ratchet increased");
    process.exit(1);
  }
  console.log("verify:entity-link-adoption PASS — syntactic ratchets preserved (no alias-semantics claim)");
}

main();
