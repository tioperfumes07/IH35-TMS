#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(".");
const cliArgs = process.argv.slice(2);
const srcRootArgIdx = cliArgs.indexOf("--src-root");
const registryArgIdx = cliArgs.indexOf("--registry");
const SRC_ROOT = path.resolve(
  ROOT,
  srcRootArgIdx >= 0 && cliArgs[srcRootArgIdx + 1] ? cliArgs[srcRootArgIdx + 1] : "apps/backend/src"
);
const REGISTRY_PATH = path.resolve(
  ROOT,
  registryArgIdx >= 0 && cliArgs[registryArgIdx + 1] ? cliArgs[registryArgIdx + 1] : "apps/backend/src/outbox/handlers/registry.ts"
);
const INSERT_PATTERN = /INSERT\s+INTO\s+outbox\.events/i;
const ANNOTATION_PATTERN = /outbox-handler-parity:\s*literal-types=\[([^\]]*)\]/i;

function walkTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function sourceText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseSource(filePath) {
  return ts.createSourceFile(filePath, sourceText(filePath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function parseAnnotationFromStatement(sourceFile, statement) {
  const text = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, statement.getFullStart()) ?? [];
  for (const range of ranges) {
    const comment = text.slice(range.pos, range.end);
    const m = comment.match(ANNOTATION_PATTERN);
    if (!m) continue;
    return m[1]
      .split(",")
      .map((v) => v.trim().replace(/^["'`]/, "").replace(/["'`]$/, ""))
      .filter(Boolean);
  }
  return null;
}

function buildConstStringMap(sourceFile) {
  const map = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text;
      const values = evaluateExpression(node.initializer, map);
      if (values?.size) map.set(name, values);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return map;
}

function evaluateExpression(expr, constMap) {
  if (ts.isStringLiteralLike(expr)) return new Set([expr.text]);

  if (ts.isNoSubstitutionTemplateLiteral(expr)) return new Set([expr.text]);

  if (ts.isTemplateExpression(expr)) {
    let current = new Set([expr.head.text]);
    for (const span of expr.templateSpans) {
      const exprValues = evaluateExpression(span.expression, constMap);
      if (!exprValues) return null;
      const next = new Set();
      for (const base of current) {
        for (const value of exprValues) {
          next.add(base + value + span.literal.text);
        }
      }
      current = next;
    }
    return current;
  }

  if (ts.isIdentifier(expr)) {
    const known = constMap.get(expr.text);
    return known ? new Set(known) : null;
  }

  if (ts.isArrayLiteralExpression(expr)) {
    const values = new Set();
    for (const element of expr.elements) {
      const v = evaluateExpression(element, constMap);
      if (!v) return null;
      for (const item of v) values.add(item);
    }
    return values;
  }

  if (ts.isConditionalExpression(expr)) {
    const whenTrue = evaluateExpression(expr.whenTrue, constMap);
    const whenFalse = evaluateExpression(expr.whenFalse, constMap);
    if (!whenTrue || !whenFalse) return null;
    return new Set([...whenTrue, ...whenFalse]);
  }

  if (ts.isParenthesizedExpression(expr)) return evaluateExpression(expr.expression, constMap);

  if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) return evaluateExpression(expr.expression, constMap);

  return null;
}

function readHandlerTypes() {
  const registryDir = path.dirname(REGISTRY_PATH);
  const handlerFiles = walkTsFiles(registryDir);
  const out = new Set();
  for (const filePath of handlerFiles) {
    const text = sourceText(filePath);
    const matches = text.matchAll(/eventType\s*=\s*["'`]([^"'`]+)["'`]/g);
    for (const match of matches) {
      if (match[1]) out.add(match[1]);
    }
    const ctorMatches = text.matchAll(/new\s+[A-Za-z0-9_]+\(\s*["'`]([^"'`]+)["'`]\s*\)/g);
    for (const match of ctorMatches) {
      if (match[1]) out.add(match[1]);
    }
  }
  return out;
}

function findStatementForNode(node) {
  let cur = node;
  while (cur && !ts.isStatement(cur)) cur = cur.parent;
  return cur ?? node;
}

function collectEmitters(filePath) {
  const sf = parseSource(filePath);
  const constMap = buildConstStringMap(sf);
  const emitters = [];
  const dynamicFailures = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "query") {
      const [sqlArg, valuesArg] = node.arguments;
      if (!sqlArg || !valuesArg) return ts.forEachChild(node, visit);
      const sqlText = ts.isStringLiteralLike(sqlArg) || ts.isNoSubstitutionTemplateLiteral(sqlArg) ? sqlArg.text : null;
      if (!sqlText || !INSERT_PATTERN.test(sqlText)) return ts.forEachChild(node, visit);
      if (!ts.isArrayLiteralExpression(valuesArg) || valuesArg.elements.length === 0) return ts.forEachChild(node, visit);

      const eventExpr = valuesArg.elements[0];
      const evaluated = evaluateExpression(eventExpr, constMap);
      const stmt = findStatementForNode(node);
      if (!evaluated || evaluated.size === 0) {
        const annotation = parseAnnotationFromStatement(sf, stmt);
        if (!annotation || annotation.length === 0) {
          dynamicFailures.push({
            filePath,
            line: lineOf(sf, node),
            reason: "dynamic event_type without annotation",
          });
        } else {
          for (const eventType of annotation) {
            emitters.push({ filePath, line: lineOf(sf, node), eventType, viaAnnotation: true });
          }
        }
      } else {
        for (const eventType of evaluated) {
          emitters.push({ filePath, line: lineOf(sf, node), eventType, viaAnnotation: false });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return { emitters, dynamicFailures };
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

const handlers = readHandlerTypes();
const files = walkTsFiles(SRC_ROOT);
const allEmitters = [];
const allDynamicFailures = [];

for (const filePath of files) {
  const { emitters, dynamicFailures } = collectEmitters(filePath);
  allEmitters.push(...emitters);
  allDynamicFailures.push(...dynamicFailures);
}

const missingHandlers = allEmitters.filter((item) => !handlers.has(item.eventType));

if (allDynamicFailures.length > 0 || missingHandlers.length > 0) {
  console.error("verify:outbox-handler-parity FAILED");
  if (allDynamicFailures.length > 0) {
    console.error("Dynamic emitters missing annotation:");
    for (const failure of allDynamicFailures) {
      console.error(` - ${rel(failure.filePath)}:${failure.line} (${failure.reason})`);
    }
    console.error("   Add comment above call: /* outbox-handler-parity: literal-types=[\"type.a\",\"type.b\"] */");
  }
  if (missingHandlers.length > 0) {
    console.error("Emitter event_types with no registered handler:");
    for (const missing of missingHandlers) {
      console.error(` - ${missing.eventType} @ ${rel(missing.filePath)}:${missing.line}`);
    }
  }
  process.exit(1);
}

console.log(`verify:outbox-handler-parity OK — emitters=${allEmitters.length} handlers=${handlers.size}`);
