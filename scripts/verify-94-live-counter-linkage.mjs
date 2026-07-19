#!/usr/bin/env node
/**
 * Branch-aware proof for the Reports 94 Samsara live counter.
 *
 * This is a small abstract interpreter, not a source-shape search. It follows lexical bindings,
 * assignments, destructuring, constant-folded control flow, and value taint from the scoped query
 * into the returned `samsara_live` property. Query proof is created only inside the true branch of
 * the matching relationExists condition after the company GUC is set on the same scoped client.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const TARGET = "apps/backend/src/reports/library.routes.ts";
const ROUTE = "/api/v1/reports/home-fleet-snapshot";
const RELATION = "integrations.samsara_vehicles";
const TAINT = {
  CLIENT: "client",
  COMPANY: "company",
  RELATION: "relation-condition",
  QUERY: "samsara-query",
  COUNT: "samsara-count",
};

function fail(messages) {
  console.error("verify:94-live-counter-linkage — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

function parse(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) {
    throw new Error(
      `${file}: TypeScript parse failed: ${sf.parseDiagnostics
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
        .join("; ")}`,
    );
  }
  return sf;
}

function stringValue(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node) && node.templateSpans.length === 0) return node.head.text;
  return null;
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return null;
}

function constantBoolean(node) {
  if (!node) return null;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isParenthesizedExpression(node)) return constantBoolean(node.expression);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    const value = constantBoolean(node.operand);
    return value == null ? null : !value;
  }
  if (ts.isConditionalExpression(node)) {
    const condition = constantBoolean(node.condition);
    if (condition === true) return constantBoolean(node.whenTrue);
    if (condition === false) return constantBoolean(node.whenFalse);
    const left = constantBoolean(node.whenTrue);
    const right = constantBoolean(node.whenFalse);
    return left === right ? left : null;
  }
  if (ts.isBinaryExpression(node)) {
    const left = constantBoolean(node.left);
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (left === false) return false;
      const right = constantBoolean(node.right);
      return left === true ? right : right === false ? false : null;
    }
    if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      if (left === true) return true;
      const right = constantBoolean(node.right);
      return left === false ? right : right === true ? true : null;
    }
  }
  return null;
}

function emptyValue() {
  return { taint: new Set(), object: null, functionName: null, literal: null };
}

function value({ taint = [], object = null, functionName = null, literal = null } = {}) {
  return { taint: new Set(taint), object, functionName, literal };
}

function mergeValues(...values) {
  return value({ taint: values.flatMap((entry) => [...entry.taint]) });
}

function cloneState(state) {
  return {
    env: new Map(state.env),
    guc: state.guc,
    relation: state.relation,
    proofs: [...state.proofs],
    failures: [...state.failures],
    returns: [...state.returns],
    terminated: state.terminated,
  };
}

function initialState() {
  return {
    env: new Map(),
    guc: false,
    relation: false,
    proofs: [],
    failures: [],
    returns: [],
    terminated: false,
  };
}

function evalExpression(node, state, sf) {
  if (!node) return emptyValue();
  if (ts.isIdentifier(node)) {
    if (node.text === "relationExists" || node.text === "withCompanyScope") {
      return value({ functionName: node.text });
    }
    return state.env.get(node.text) ?? emptyValue();
  }
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return value({ literal: node.text });
  }
  if (ts.isNumericLiteral(node)) return value({ literal: Number(node.text) });
  if (node.kind === ts.SyntaxKind.TrueKeyword) return value({ literal: true });
  if (node.kind === ts.SyntaxKind.FalseKeyword) return value({ literal: false });
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isAwaitExpression(node)
  ) {
    return evalExpression(node.expression, state, sf);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    if (node.getText(sf).endsWith(".operating_company_id")) {
      return value({ taint: [TAINT.COMPANY] });
    }
    const base = evalExpression(node.expression, state, sf);
    const name = propertyName(node);
    if (base.object && name && base.object.has(name)) return base.object.get(name);
    if (base.taint.has(TAINT.QUERY)) {
      return value({ taint: name === "samsara_live" ? [TAINT.QUERY, TAINT.COUNT] : [TAINT.QUERY] });
    }
    return base;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const object = new Map();
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name) ?? property.name.getText(sf).replace(/^["']|["']$/g, "");
        object.set(name, evalExpression(property.initializer, state, sf));
      } else if (ts.isShorthandPropertyAssignment(property)) {
        object.set(property.name.text, evalExpression(property.name, state, sf));
      }
    }
    return value({ object });
  }
  if (ts.isConditionalExpression(node)) {
    const condition = constantBoolean(node.condition);
    if (condition === true) return evalExpression(node.whenTrue, state, sf);
    if (condition === false) return evalExpression(node.whenFalse, state, sf);
    return mergeValues(
      evalExpression(node.whenTrue, cloneState(state), sf),
      evalExpression(node.whenFalse, cloneState(state), sf),
    );
  }
  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      return mergeValues(evalExpression(node.left, state, sf), evalExpression(node.right, state, sf));
    }
    if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const folded = constantBoolean(node);
      if (folded != null) return value({ literal: folded });
      return mergeValues(evalExpression(node.left, state, sf), evalExpression(node.right, state, sf));
    }
  }
  if (ts.isCallExpression(node)) {
    const callee = evalExpression(node.expression, state, sf);
    if (callee.functionName === "relationExists") {
      const client = evalExpression(node.arguments[0], state, sf);
      const relation = stringValue(node.arguments[1]);
      if (client.taint.has(TAINT.CLIENT) && relation === RELATION) {
        return value({ taint: [TAINT.RELATION] });
      }
      return emptyValue();
    }
    const method = propertyName(node.expression);
    if (method === "query" && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
      const receiver = evalExpression(node.expression.expression, state, sf);
      if (!receiver.taint.has(TAINT.CLIENT)) return emptyValue();
      const sql = stringValue(node.arguments[0]);
      if (!sql) {
        return emptyValue();
      }
      const normalized = sql.replace(/--.*$/gm, "");
      if (normalized.includes("set_config('app.operating_company_id', $1, true)")) {
        const args = node.arguments[1];
        const company = args && ts.isArrayLiteralExpression(args)
          ? evalExpression(args.elements[0], state, sf)
          : emptyValue();
        if (company.taint.has(TAINT.COMPANY)) state.guc = true;
        return emptyValue();
      }
      if (/\bFROM\s+integrations\.samsara_vehicles\b/i.test(normalized)) {
        const sqlValid =
          /\bcount\s*\(\s*DISTINCT\s+local_unit_id\s*\)/i.test(normalized) &&
          /\blocal_unit_id\s+IS\s+NOT\s+NULL\b/i.test(normalized) &&
          /\boperating_company_id\s*=\s*current_setting\(\s*'app\.operating_company_id'\s*,\s*true\s*\)::uuid/i.test(normalized);
        if (!state.guc) state.failures.push("Samsara query is not causally after the company GUC");
        if (!state.relation) state.failures.push("Samsara query is not inside the matching relationExists true branch");
        if (!sqlValid) state.failures.push("Samsara query SQL does not enforce DISTINCT linked units and company GUC scope");
        if (state.guc && state.relation && sqlValid) return value({ taint: [TAINT.QUERY] });
        return emptyValue();
      }
      return emptyValue();
    }
    // Number(), optional chaining helpers, and other pure wrappers preserve evidence but cannot create it.
    return mergeValues(...node.arguments.map((argument) => evalExpression(argument, state, sf)));
  }
  if (ts.isArrayLiteralExpression(node)) {
    return mergeValues(...node.elements.map((element) => evalExpression(element, state, sf)));
  }
  return emptyValue();
}

function bindPattern(pattern, sourceValue, state, sf) {
  if (ts.isIdentifier(pattern)) {
    state.env.set(pattern.text, sourceValue);
    return;
  }
  if (ts.isObjectBindingPattern(pattern)) {
    for (const element of pattern.elements) {
      const nameNode = element.propertyName ?? element.name;
      const key = ts.isIdentifier(nameNode) || ts.isStringLiteralLike(nameNode)
        ? nameNode.text
        : ts.isComputedPropertyName(nameNode) && ts.isStringLiteralLike(nameNode.expression)
          ? nameNode.expression.text
          : null;
      const selected = key && sourceValue.object?.get(key)
        ? sourceValue.object.get(key)
        : sourceValue.taint.has(TAINT.QUERY)
          ? value({ taint: [TAINT.QUERY] })
          : emptyValue();
      bindPattern(element.name, selected, state, sf);
    }
  }
}

function relationCondition(node, state, sf) {
  const evaluated = evalExpression(node, state, sf);
  return evaluated.taint.has(TAINT.RELATION);
}

function executeStatement(statement, state, sf) {
  if (state.terminated) return [state];
  if (ts.isBlock(statement)) return executeStatements(statement.statements, [state], sf);
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      bindPattern(declaration.name, evalExpression(declaration.initializer, state, sf), state, sf);
    }
    return [state];
  }
  if (ts.isExpressionStatement(statement)) {
    const expression = statement.expression;
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const assigned = evalExpression(expression.right, state, sf);
      if (ts.isIdentifier(expression.left)) state.env.set(expression.left.text, assigned);
      else if (ts.isObjectLiteralExpression(expression.left)) {
        // Object assignment patterns are represented as object literals by the parser.
        for (const property of expression.left.properties) {
          if (ts.isShorthandPropertyAssignment(property)) {
            const selected = assigned.object?.get(property.name.text) ?? assigned;
            state.env.set(property.name.text, selected);
          }
        }
      }
    } else {
      evalExpression(expression, state, sf);
    }
    return [state];
  }
  if (ts.isIfStatement(statement)) {
    const folded = constantBoolean(statement.expression);
    if (folded === true) return executeStatement(statement.thenStatement, state, sf);
    if (folded === false) {
      return statement.elseStatement ? executeStatement(statement.elseStatement, state, sf) : [state];
    }
    const isRelation = relationCondition(statement.expression, cloneState(state), sf);
    const trueState = cloneState(state);
    const falseState = cloneState(state);
    if (isRelation) {
      trueState.relation = true;
      falseState.relation = false;
    }
    return [
      ...executeStatement(statement.thenStatement, trueState, sf),
      ...(statement.elseStatement ? executeStatement(statement.elseStatement, falseState, sf) : [falseState]),
    ];
  }
  if (ts.isTryStatement(statement)) {
    const paths = executeStatement(statement.tryBlock, state, sf);
    if (!statement.finallyBlock) return paths;
    return paths.flatMap((pathState) => executeStatement(statement.finallyBlock, pathState, sf));
  }
  if (ts.isReturnStatement(statement)) {
    const returned = evalExpression(statement.expression, state, sf);
    state.returns.push(returned);
    if (returned.object?.get("samsara_live")?.taint.has(TAINT.COUNT)) {
      state.proofs.push("returned-query-count");
    }
    state.terminated = true;
    return [state];
  }
  if (ts.isForOfStatement(statement) || ts.isForStatement(statement) || ts.isWhileStatement(statement)) {
    // Loops are irrelevant to the canonical counter proof; evaluate at most one reachable body pass.
    return executeStatement(statement.statement, state, sf);
  }
  return [state];
}

function executeStatements(statements, states, sf) {
  let paths = states;
  for (const statement of statements) {
    paths = paths.flatMap((state) => executeStatement(statement, state, sf));
  }
  return paths;
}

function walkReachable(root, visitor) {
  function visit(node) {
    if (node !== root && ts.isFunctionLike(node)) return;
    visitor(node);
    if (ts.isIfStatement(node)) {
      visit(node.expression);
      const folded = constantBoolean(node.expression);
      if (folded !== false) visit(node.thenStatement);
      if (folded !== true && node.elseStatement) visit(node.elseStatement);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition);
      const folded = constantBoolean(node.condition);
      if (folded !== false) visit(node.whenTrue);
      if (folded !== true) visit(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      visit(node.left);
      if (constantBoolean(node.left) !== false) visit(node.right);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
}

function findNamedFunction(sf, name) {
  let found = null;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}

function findRouteCallback(sf) {
  const register = findNamedFunction(sf, "registerReportsLibraryRoutes");
  if (!register) return null;
  let found = null;
  walkReachable(register, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sf) === "app" &&
      node.expression.name.text === "get" &&
      stringValue(node.arguments[0]) === ROUTE
    ) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) found = callback;
    }
  });
  return found;
}

function findScopedCallback(route, sf) {
  const aliases = new Map([["withCompanyScope", "withCompanyScope"]]);
  let callback = null;
  let resultName = null;
  walkReachable(route, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (ts.isIdentifier(node.initializer)) {
        const target = aliases.get(node.initializer.text);
        if (target) aliases.set(node.name.text, target);
      }
      const awaited = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isCallExpression(awaited) && ts.isIdentifier(awaited.expression)) {
        if (aliases.get(awaited.expression.text) === "withCompanyScope") {
          const candidate = awaited.arguments[2];
          if (candidate && (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))) {
            callback = candidate;
            resultName = node.name.text;
          }
        }
      }
    }
  });
  if (!callback || !resultName) return null;
  const resultAliases = new Set([resultName]);
  walkReachable(route, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      resultAliases.has(node.initializer.text)
    ) {
      resultAliases.add(node.name.text);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isIdentifier(node.right) &&
      resultAliases.has(node.right.text)
    ) {
      resultAliases.add(node.left.text);
    }
  });
  let returned = false;
  walkReachable(route, (node) => {
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isIdentifier(node.expression) &&
      resultAliases.has(node.expression.text)
    ) {
      returned = true;
    }
  });
  return { callback, returned };
}

export function assertLiveCounterSource(file, source) {
  let sf;
  try {
    sf = parse(file, source);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const route = findRouteCallback(sf);
  if (!route) return [`${file}: reachable inline ${ROUTE} route callback is missing`];
  const scoped = findScopedCallback(route, sf);
  if (!scoped) return [`${file}: route must capture an invoked inline withCompanyScope callback`];
  if (!scoped.returned) return [`${file}: route must return the captured withCompanyScope result`];

  const state = initialState();
  const clientParameter = scoped.callback.parameters[0];
  if (!clientParameter || !ts.isIdentifier(clientParameter.name)) {
    return [`${file}: withCompanyScope callback must declare a lexical client parameter`];
  }
  state.env.set(clientParameter.name.text, value({ taint: [TAINT.CLIENT] }));
  // The canonical company id may be introduced inside the callback; seed its source expression.
  state.env.set("companyId", value({ taint: [TAINT.COMPANY] }));
  const body = scoped.callback.body;
  if (!ts.isBlock(body)) return [`${file}: withCompanyScope callback must use a block body`];
  const paths = executeStatements(body.statements, [state], sf);
  const failures = [...new Set(paths.flatMap((pathState) => pathState.failures))];
  if (!paths.some((pathState) => pathState.proofs.includes("returned-query-count"))) {
    failures.push(`${file}: no reachable relation/GUC/query path flows into returned samsara_live`);
  }
  return failures;
}

function canonicalFixture() {
  return `
    export async function registerReportsLibraryRoutes(app) {
      app.get("${ROUTE}", async () => {
        const snapshot = await withCompanyScope(user.uuid, companyId, async (client) => {
          await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
          let samsaraLive = 0;
          if (await relationExists(client, "${RELATION}")) {
            const result = await client.query(\`SELECT count(DISTINCT local_unit_id)::text AS samsara_live
              FROM integrations.samsara_vehicles
              WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
                AND local_unit_id IS NOT NULL\`);
            samsaraLive = Number(result.rows[0]?.samsara_live ?? 0);
          }
          return { samsara_live: samsaraLive };
        });
        return snapshot;
      });
    }
  `;
}

function runSelftest() {
  const good = canonicalFixture();
  const valid = [
    ["canonical", good],
    ["function-and-result-aliases", good
      .replace("const snapshot = await withCompanyScope", "const scoped = withCompanyScope; const snapshot = await scoped")
      .replace("if (await relationExists", "const exists = relationExists; if (await exists")
      .replace("const result = await client.query", "const db = client; const result = await db.query")
      .replace("return snapshot;", "const response = snapshot; return response;")],
    ["later-assignment-alias", good
      .replace("const result = await client.query", "let result; result = await client.query")],
    ["destructured-result", good
      .replace("const result = await client.query", "const result = await client.query")
      .replace(
        "samsaraLive = Number(result.rows[0]?.samsara_live ?? 0);",
        "const { rows } = result; samsaraLive = Number(rows[0]?.[\"samsara_live\"] ?? 0);",
      )],
  ];
  const invalid = [
    ["false-and-flag", good.replace(`if (await relationExists(client, "${RELATION}"))`, `if (false && flag)`)],
    ["false-conditional", good.replace(`if (await relationExists(client, "${RELATION}"))`, `if (false ? true : false)`)],
    ["unreachable-else", good.replace(
      `if (await relationExists(client, "${RELATION}")) {`,
      `if (true) { samsaraLive = 0; } else { if (await relationExists(client, "${RELATION}")) {`,
    ).replace(
      `          }\n          return { samsara_live: samsaraLive };`,
      `          } }\n          return { samsara_live: samsaraLive };`,
    )],
    ["unrelated-relation", good.replace(
      `if (await relationExists(client, "${RELATION}")) {`,
      `if (await relationExists(client, "${RELATION}")) { void 0; }\n          {`,
    )],
    ["discarded-correct-object", good.replace(
      "return { samsara_live: samsaraLive };",
      "({ samsara_live: samsaraLive }); return { samsara_live: 999 };",
    )],
    ["hardcoded-return", good.replace("return { samsara_live: samsaraLive };", "return { samsara_live: 999 };")],
    ["ignored-query-result", good
      .replace("const result = await client.query", "await client.query")
      .replace("samsaraLive = Number(result.rows[0]?.samsara_live ?? 0);", "samsaraLive = 0;")],
    ["wrong-client", good.replace("const result = await client.query", "const result = await wrongClient.query")],
    ["wrong-guc", good.replaceAll("app.operating_company_id", "wrong.guc")],
    ["dead-helper", good.replace(
      `if (await relationExists(client, "${RELATION}")) {`,
      `function dead(){ if (relationExists(client, "${RELATION}")) {`,
    ).replace(
      `          }\n          return { samsara_live: samsaraLive };`,
      `          } }\n          return { samsara_live: samsaraLive };`,
    )],
    ["unknown-wrapper", good.replace(
      "const snapshot = await withCompanyScope",
      "const snapshot = await unknownWrapper(withCompanyScope)",
    )],
  ];
  const problems = [];
  for (const [name, source] of valid) {
    const failures = assertLiveCounterSource(`${name}.ts`, source);
    if (failures.length) problems.push(`${name} unexpectedly failed: ${failures.join(" | ")}`);
  }
  for (const [name, source] of invalid) {
    const failures = assertLiveCounterSource(`${name}.ts`, source);
    if (!failures.length) problems.push(`${name} unexpectedly passed`);
  }
  if (problems.length) {
    console.error(`verify:94-live-counter-linkage --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`verify:94-live-counter-linkage --selftest PASS ${valid.length} valid and ${invalid.length} VETO/metamorphic cases`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }
  const absolute = path.join(ROOT, TARGET);
  if (!fs.existsSync(absolute)) fail([`${TARGET}: target file missing`]);
  const failures = assertLiveCounterSource(TARGET, fs.readFileSync(absolute, "utf8"));
  if (failures.length) fail(failures);
  console.log("verify:94-live-counter-linkage — OK branch-aware query-to-response proof");
}

main();
