#!/usr/bin/env node
// verify-entity-link-adoption.mjs
//
// Fail-closed linkage-adoption ratchet, built alongside the shared <EntityLink> drill-through primitive
// (apps/frontend/src/components/shared/EntityLink.tsx) in service of the LAW OF THE LAND / total-
// connectivity mandate (root CLAUDE.md §10a — every id a screen shows should be a forward drill-through
// to its entity).
//
// It scans apps/frontend/src for JSX child expressions that render an id-shaped value (e.g.
// `{row.vendor_id}`, `{tx.driver_id || "-"}`, bare `{id}`) directly as text — i.e. NOT wrapped in
// <EntityLink>, <Link>, <NavLink>, or a plain <a> — and prints them as a findings report.
//
// Existing debt is baselined at 76 AST findings (origin/main 9a984941a). The guard fails when the count
// rises, so adoption can proceed additively without allowing a new plain-text id regression. Parsing is
// AST-based and parse errors fail closed; comments and string literals cannot satisfy or suppress it.
//
// Heuristic, not exhaustive: it is a static AST shape scan, not a type-aware analysis. The baseline is a
// ratchet, not a claim that every current candidate is a real entity reference.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const SKIP_RE = /(\/__tests__\/|\.test\.(tsx|ts)$|\.deprecated\.|test-setup\.ts$)/;
const MAX_BASELINE_FINDINGS = 76;
// Newly visible debt from String(...) and conditional wrappers at exact-head review.
// Kept as a separate ratchet so the original 76-finding contract remains intact.
const MAX_EXTENDED_FINDINGS = 24;

// Matches property/identifier names shaped like an entity id: vendor_id, matched_bill_id, driverId,
// unitId, or a bare `id`. Case-sensitive on the "Id" suffix so words like "valid"/"paid" don't match.
const ID_NAME_RE = /(^|_)id$|[a-z]Id$/;

// Tags that already provide (or intentionally opt out of) drill-through; expressions rendered inside
// these are considered already-adopted and are not reported.
const LINK_TAGS = new Set(["EntityLink", "Link", "NavLink", "a"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(entry.name) && !SKIP_RE.test(p.replace(/\\/g, "/"))) out.push(p);
  }
  return out;
}

// Resolves every directly rendered identifier name from common id-rendering shapes:
//   {row.vendor_id}                -> "vendor_id"
//   {row.vendor_id || "-"}         -> "vendor_id"  (unwraps || / ?? fallback)
//   {row.vendor_id ?? "-"}         -> "vendor_id"
//   {(row.vendor_id)}              -> "vendor_id"  (unwraps parens)
//   {String(row.vendor_id)}         -> "vendor_id"
//   {ok ? row.vendor_id : alt.id}  -> "vendor_id", "id"
// JSX link branches produce no direct identifier candidate, so adopted ternaries remain clean.
export function identifierNames(expr) {
  if (!expr) return [];
  if (ts.isIdentifier(expr)) return [expr.text];
  if (ts.isPropertyAccessExpression(expr)) return [expr.name.text];
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    return identifierNames(expr.expression);
  }
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return identifierNames(expr.left);
  }
  if (ts.isConditionalExpression(expr)) {
    return [...identifierNames(expr.whenTrue), ...identifierNames(expr.whenFalse)];
  }
  if (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "String" &&
    expr.arguments.length === 1
  ) {
    return identifierNames(expr.arguments[0]);
  }
  return [];
}

export function identifierName(expr) {
  if (!expr) return null;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isParenthesizedExpression(expr)) return identifierName(expr.expression);
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return identifierName(expr.left);
  }
  return null;
}

export function scanSource(file, source, extended = true) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  if (sf.parseDiagnostics.length > 0) {
    const details = sf.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ");
    throw new Error(`${file}: TypeScript parse failed: ${details}`);
  }
  const findings = [];
  function visit(node) {
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      const names = extended ? identifierNames(node.expression) : [identifierName(node.expression)].filter(Boolean);
      if (names.some((name) => ID_NAME_RE.test(name))) {
        const enclosingTag = ts.isJsxElement(node.parent)
          ? node.parent.openingElement.tagName.getText()
          : null;
        if (!enclosingTag || !LINK_TAGS.has(enclosingTag)) {
          const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          findings.push({
            file: path.relative(ROOT, file),
            line: pos.line + 1,
            tag: enclosingTag ?? "(fragment/expression)",
            text: node.getText(sf).replace(/\s+/g, " ").trim().slice(0, 90),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return findings;
}

export function scanTree(frontendRoot = FRONTEND_ROOT, extended = true) {
  const findings = [];
  for (const file of walk(frontendRoot)) {
    findings.push(...scanSource(file, fs.readFileSync(file, "utf8"), extended));
  }
  return findings;
}

function runSelftest() {
  const plain = scanSource("plain.tsx", `export const T = ({ row }) => <td>{row.vendor_id}</td>;`);
  const linked = scanSource(
    "linked.tsx",
    `export const T = ({ row }) => <td><EntityLink kind="vendor" id={row.vendor_id} /></td>;`,
  );
  const decoy = scanSource(
    "decoy.tsx",
    `// <EntityLink kind="vendor" id={row.vendor_id} />\nconst fake = "{row.vendor_id}";\nexport const T = ({ row }) => <td>{row.vendor_id}</td>;`,
  );
  const stringWrapped = scanSource(
    "string-wrapped.tsx",
    `export const T = ({ row }) => <td>{String(row.vendor_id)}</td>;`,
  );
  const ternaryPlain = scanSource(
    "ternary-plain.tsx",
    `export const T = ({ row, ok }) => <td>{ok ? row.vendor_id : row.driverId}</td>;`,
  );
  const ternaryLinked = scanSource(
    "ternary-linked.tsx",
    `export const T = ({ row, ok }) => <td>{ok ? <EntityLink kind="vendor" id={row.vendor_id}/> : <EntityLink kind="driver" id={row.driverId}/>}</td>;`,
  );
  if (
    plain.length !== 1 ||
    linked.length !== 0 ||
    decoy.length !== 1 ||
    stringWrapped.length !== 1 ||
    ternaryPlain.length !== 1 ||
    ternaryLinked.length !== 0
  ) {
    console.error(
      "verify:entity-link-adoption --selftest FAIL",
      {
        plain: plain.length,
        linked: linked.length,
        decoy: decoy.length,
        stringWrapped: stringWrapped.length,
        ternaryPlain: ternaryPlain.length,
        ternaryLinked: ternaryLinked.length,
      },
    );
    process.exit(1);
  }
  console.log("verify:entity-link-adoption --selftest PASS String(row.vendor_id) rejected");
  console.log("verify:entity-link-adoption --selftest PASS plain ternary IDs rejected");
  console.log("verify:entity-link-adoption --selftest PASS EntityLink ternary branches accepted");
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }

  const legacyFindings = scanTree(FRONTEND_ROOT, false);
  const allFindings = scanTree(FRONTEND_ROOT, true);
  const legacyKeys = new Set(legacyFindings.map((finding) => `${finding.file}:${finding.line}:${finding.text}`));
  const extendedFindings = allFindings.filter(
    (finding) => !legacyKeys.has(`${finding.file}:${finding.line}:${finding.text}`),
  );
  console.log("verify:entity-link-adoption (fail-closed ratchet)");
  console.log("Scanned apps/frontend/src for id-shaped values rendered without <EntityLink>/<Link>.");
  console.log(
    `Found ${legacyFindings.length} legacy candidate(s) (max ${MAX_BASELINE_FINDINGS}) and ` +
      `${extendedFindings.length} String/ternary candidate(s) (max ${MAX_EXTENDED_FINDINGS}).`,
  );

  if (
    legacyFindings.length > MAX_BASELINE_FINDINGS ||
    extendedFindings.length > MAX_EXTENDED_FINDINGS
  ) {
    for (const f of [...legacyFindings, ...extendedFindings]) {
      console.error(`  ${f.file}:${f.line}  <${f.tag}>  ${f.text}`);
    }
    const legacyIncrease = Math.max(0, legacyFindings.length - MAX_BASELINE_FINDINGS);
    const extendedIncrease = Math.max(0, extendedFindings.length - MAX_EXTENDED_FINDINGS);
    console.error(`verify:entity-link-adoption FAIL — ${legacyIncrease + extendedIncrease} new candidate(s) exceed locked baselines`);
    process.exit(1);
  }

  console.log(
    `verify:entity-link-adoption PASS — no regression (` +
      `${MAX_BASELINE_FINDINGS - legacyFindings.length} legacy and ` +
      `${MAX_EXTENDED_FINDINGS - extendedFindings.length} extended finding(s) below baseline)`,
  );
}

main();
