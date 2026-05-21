#!/usr/bin/env node
/**
 * DS-REMEDIATE-1 static guard:
 * - Scope (narrow): admin route files + integration route files under backend src.
 * - Blocks known synchronous external-call primitives in request-path handlers.
 * - Allows explicit, documented exceptions only.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ADMIN_ROUTES = path.join(ROOT, "apps", "backend", "src", "admin");
const INTEGRATIONS_ROUTES = path.join(ROOT, "apps", "backend", "src", "integrations");

const ALLOWLIST = [
  {
    filePath: "apps/backend/src/integrations/plaid/link.routes.ts",
    functionName: "registerPlaidLinkRoutes",
    justification: "Explicit owner-triggered Plaid disconnect flow must revoke token immediately.",
    referenceId: "DS-AUDIT-B-016",
  },
];

const FORBIDDEN_IDENTIFIERS = new Set([
  "fetch",
  "runQboCdcIngest",
  "qboQuery",
  "runAdminDeepHealthProbe",
  "runSamsaraHealthCheckForRow",
  "getPlaidClient",
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && entry.name.endsWith(".routes.ts")) out.push(abs);
  }
  return out;
}

function toRel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function isAllowlisted(relPath, functionName) {
  return ALLOWLIST.some((entry) => entry.filePath === relPath && entry.functionName === functionName);
}

function validateAllowlistEntry(entry) {
  const missing = [];
  if (!entry.filePath?.trim()) missing.push("filePath");
  if (!entry.functionName?.trim()) missing.push("functionName");
  if (!entry.justification?.trim()) missing.push("justification");
  if (!entry.referenceId?.trim()) missing.push("referenceId");
  return missing;
}

function getEnclosingFunctionName(node) {
  let cur = node;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name?.text) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
    if (ts.isFunctionExpression(cur) || ts.isArrowFunction(cur)) {
      const parent = cur.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    }
    cur = cur.parent;
  }
  return "<anonymous>";
}

let failed = false;

for (const entry of ALLOWLIST) {
  const missing = validateAllowlistEntry(entry);
  if (missing.length > 0) {
    console.error(`verify-ds-admin-route-boundary: invalid allowlist entry missing [${missing.join(", ")}]`);
    failed = true;
    continue;
  }
  const abs = path.join(ROOT, entry.filePath);
  if (!fs.existsSync(abs)) {
    console.error(`verify-ds-admin-route-boundary: allowlist file does not exist: ${entry.filePath}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(abs, "utf8");
  if (!text.includes("CI-ALLOWLIST:") || !text.includes(entry.referenceId)) {
    console.error(
      `verify-ds-admin-route-boundary: allowlist entry requires inline CI-ALLOWLIST comment with reference ${entry.referenceId} in ${entry.filePath}`
    );
    failed = true;
  }
}

const targets = [...walk(ADMIN_ROUTES), ...walk(INTEGRATIONS_ROUTES)];
for (const file of targets) {
  const rel = toRel(file);
  const sourceText = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const importedForbiddenAliases = new Set();

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings || !ts.isNamedImports(stmt.importClause.namedBindings)) continue;
    for (const element of stmt.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (FORBIDDEN_IDENTIFIERS.has(importedName)) {
        importedForbiddenAliases.add(element.name.text);
      }
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      let calleeName = null;
      if (ts.isIdentifier(node.expression)) {
        calleeName = node.expression.text;
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "axios"
      ) {
        calleeName = "axios";
      }

      const isForbidden =
        calleeName === "axios" ||
        (calleeName != null &&
          (FORBIDDEN_IDENTIFIERS.has(calleeName) || importedForbiddenAliases.has(calleeName)));

      if (isForbidden) {
        const functionName = getEnclosingFunctionName(node);
        if (!isAllowlisted(rel, functionName)) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          console.error(
            `verify-ds-admin-route-boundary: forbidden request-path external call in ${rel}:${pos.line + 1}:${pos.character + 1} (${functionName}, ${calleeName})`
          );
          failed = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

process.exit(failed ? 1 : 0);
