#!/usr/bin/env node
// verify-entity-link-adoption.mjs
//
// REPORT-ONLY linkage-adoption guard, built alongside the shared <EntityLink> drill-through primitive
// (apps/frontend/src/components/shared/EntityLink.tsx) in service of the LAW OF THE LAND / total-
// connectivity mandate (root CLAUDE.md §10a — every id a screen shows should be a forward drill-through
// to its entity).
//
// It scans apps/frontend/src for JSX child expressions that render an id-shaped value (e.g.
// `{row.vendor_id}`, `{tx.driver_id || "-"}`, bare `{id}`) directly as text — i.e. NOT wrapped in
// <EntityLink>, <Link>, <NavLink>, or a plain <a> — and prints them as a findings report.
//
// *** THIS SCRIPT IS REPORT-ONLY AND ALWAYS EXITS 0. *** Adoption of <EntityLink> is intentionally
// phased across many concurrently in-flight PRs (Cascade's accounting/dispatch/fleet lanes + Claude's
// banking lane) — hard-failing CI on every existing plain-text id cell would break in-flight, unrelated
// work. It is a standalone script, NOT wired into `verify:pre-commit` or any CI gate yet.
//
// TODO(flip-to-enforce): once EntityLink adoption is complete (or an explicit allowlist of accepted
// legacy plain-text cells is authored), change the tail of this script to
// `process.exit(findings.length > 0 ? 1 : 0)` and add it to the CI verify chain.
//
// Heuristic, not exhaustive: it is a static-text-shape scan, not a type-aware analysis, so it will have
// both false positives (e.g. a bare `{id}` used for a non-entity purpose) and false negatives (ids
// rendered via more complex expressions). That's acceptable for a report-only adoption tracker — triage
// findings manually.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const SKIP_RE = /(\/__tests__\/|\.test\.(tsx|ts)$|\.deprecated\.|test-setup\.ts$)/;

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

// Resolves the "innermost identifier name" of common id-rendering shapes:
//   {row.vendor_id}                -> "vendor_id"
//   {row.vendor_id || "-"}         -> "vendor_id"  (unwraps || / ?? fallback)
//   {row.vendor_id ?? "-"}         -> "vendor_id"
//   {(row.vendor_id)}              -> "vendor_id"  (unwraps parens)
// Deliberately does NOT unwrap ternaries/conditionals — a conditional whose branches already contain
// <EntityLink>/<Link> (the adopted pattern used in this PR) would otherwise be flagged as unadopted.
function identifierName(expr) {
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

const findings = [];

for (const file of walk(FRONTEND_ROOT)) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      const name = identifierName(node.expression);
      if (name && ID_NAME_RE.test(name)) {
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
}

console.log("verify:entity-link-adoption (REPORT-ONLY — always exits 0)");
console.log(`Scanned apps/frontend/src for id-shaped values rendered without <EntityLink>/<Link>.`);
console.log(`Found ${findings.length} candidate cell(s) for EntityLink adoption:\n`);

for (const f of findings) {
  console.log(`  ${f.file}:${f.line}  <${f.tag}>  ${f.text}`);
}

console.log(
  "\nNo action required — this is a phased-adoption tracker, not a CI gate. See header comment for the flip-to-enforce plan.",
);
process.exit(0);
