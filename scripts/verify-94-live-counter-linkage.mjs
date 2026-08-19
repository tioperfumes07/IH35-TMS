#!/usr/bin/env node
/**
 * Narrow structural contract for the one production Samsara live-counter route.
 *
 * This guard intentionally does not infer aliases, wrappers, or arbitrary JavaScript flow.
 * The handler must keep the canonical direct form below. Behavior is proved separately by
 * library.routes.live-counter.test.ts through Fastify injection against the production route.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const TARGET = "apps/backend/src/reports/library.routes.ts";
const ROUTE = "/api/v1/reports/home-fleet-snapshot";
const RELATION = "integrations.samsara_vehicles";

function parse(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) {
    const details = sf.parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
      .join("; ");
    throw new Error(`${file}: TypeScript parse failed: ${details}`);
  }
  return sf;
}

function stringLiteral(node) {
  return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function walk(root, visit) {
  visit(root);
  ts.forEachChild(root, (child) => walk(child, visit));
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function topLevelRegisterFunction(sf) {
  const matches = sf.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "registerReportsLibraryRoutes" &&
      isExported(node),
  );
  return matches.length === 1 ? matches[0] : null;
}

function routeHandlerFromGetCall(call) {
  for (let i = 1; i < call.arguments.length; i++) {
    const candidate = call.arguments[i];
    if (
      candidate &&
      (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate)) &&
      ts.isBlock(candidate.body)
    ) {
      return candidate;
    }
  }
  return null;
}

function directRouteCallback(register) {
  if (!register.body) return null;
  const matches = register.body.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return [];
    const call = statement.expression;
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      !ts.isIdentifier(call.expression.expression) ||
      call.expression.expression.text !== "app" ||
      call.expression.name.text !== "get" ||
      stringLiteral(call.arguments[0]) !== ROUTE
    ) {
      return [];
    }
    const handler = routeHandlerFromGetCall(call);
    return handler ? [handler] : [];
  });
  return matches.length === 1 ? matches[0] : null;
}

function directScopedCallback(route) {
  if (!ts.isBlock(route.body)) return { callback: null, snapshotDeclaration: null, handlerBlock: null };
  const tryStatements = route.body.statements.filter(ts.isTryStatement);
  const handlerBlock = tryStatements.length === 1 ? tryStatements[0].tryBlock : route.body;
  const matches = [];
  for (const statement of handlerBlock.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const node of statement.declarationList.declarations) {
      if (
      ts.isIdentifier(node.name) &&
      node.name.text === "snapshot" &&
      node.initializer &&
      ts.isAwaitExpression(node.initializer) &&
      ts.isCallExpression(node.initializer.expression) &&
      ts.isIdentifier(node.initializer.expression.expression) &&
      node.initializer.expression.expression.text === "withCompanyScope" &&
      node.initializer.expression.arguments.length === 3
    ) {
      const candidate = node.initializer.expression.arguments[2];
        if (
          candidate &&
          (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate)) &&
          ts.isBlock(candidate.body)
        ) {
          matches.push({ callback: candidate, snapshotDeclaration: node, handlerBlock });
        }
      }
    }
  }
  return matches.length === 1
    ? matches[0]
    : { callback: null, snapshotDeclaration: null, handlerBlock: null };
}

function directQueryCall(node, receiver, sqlFragment) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !ts.isIdentifier(node.expression.expression) ||
    node.expression.expression.text !== receiver ||
    node.expression.name.text !== "query"
  ) {
    return false;
  }
  const sql = stringLiteral(node.arguments[0]);
  return typeof sql === "string" && sql.includes(sqlFragment);
}

function stripSqlComments(sql) {
  let output = "";
  let index = 0;
  let quote = null;
  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];
    if (quote) {
      output += current;
      if (current === quote) {
        if (next === quote) {
          output += next;
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }
    if (current === "'" || current === '"') {
      quote = current;
      output += current;
      index += 1;
      continue;
    }
    if (current === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (current === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) throw new Error("unterminated SQL block comment");
      output += " ";
      index = end + 2;
      continue;
    }
    output += current;
    index += 1;
  }
  if (quote) throw new Error("unterminated SQL quote");
  return output;
}

function tokenizeSql(sql) {
  const source = stripSqlComments(sql);
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const current = source[index];
    if (/\s/.test(current)) {
      index += 1;
      continue;
    }
    if (current === "'") {
      let value = "";
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        if (source[index] === "'") {
          closed = true;
          index += 1;
          break;
        }
        value += source[index];
        index += 1;
      }
      if (!closed) throw new Error("unterminated SQL string");
      tokens.push(`'${value}'`);
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (["::", ">=", "<=", "<>", "!="].includes(pair)) {
      tokens.push(pair);
      index += 2;
      continue;
    }
    if (/[A-Za-z_]/.test(current)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) end += 1;
      tokens.push(source.slice(index, end).toLowerCase());
      index = end;
      continue;
    }
    if (/[0-9]/.test(current)) {
      let end = index + 1;
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      tokens.push(source.slice(index, end));
      index = end;
      continue;
    }
    if (current === "$" && /[0-9]/.test(source[index + 1] ?? "")) {
      let end = index + 2;
      while (end < source.length && /[0-9]/.test(source[end])) end += 1;
      tokens.push(source.slice(index, end));
      index = end;
      continue;
    }
    if ("(),.;=*+-/<>".includes(current)) {
      tokens.push(current);
      index += 1;
      continue;
    }
    throw new Error(`unsupported SQL token ${JSON.stringify(current)}`);
  }
  return tokens;
}

function topLevelIndex(tokens, value, start = 0) {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index] === "(") depth += 1;
    if (tokens[index] === ")") depth -= 1;
    if (depth === 0 && tokens[index] === value) return index;
  }
  return -1;
}

export function assertCompanyGucSql(sql) {
  let tokens;
  try {
    tokens = tokenizeSql(sql);
  } catch (error) {
    return [`GUC SQL parse failed: ${error instanceof Error ? error.message : String(error)}`];
  }
  const joined = tokens.join(" ");
  // ACCT-F5543 (2026-08-19): verify-systemic-42p18-set-config-text.mjs established `$1::text` as the
  // codebase-wide required cast on every set_config('app.operating_company_id', ...) call site (guards
  // against Postgres 42P18 — could not determine data type of parameter). Both the cast and uncast forms
  // are accepted here so this narrower route-specific contract does not fight that systemic law.
  const ok =
    joined === "select set_config ( 'app.operating_company_id' , $1 , true )" ||
    joined === "select set_config ( 'app.operating_company_id' , $1 :: text , true )";
  return ok
    ? []
    : ["GUC SQL must execute SELECT set_config('app.operating_company_id', $1, true) (optionally $1::text per verify-systemic-42p18-set-config-text.mjs)"];
}

function splitTopLevel(tokens, separator) {
  const groups = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === "(") depth += 1;
    if (tokens[index] === ")") depth -= 1;
    if (depth === 0 && tokens[index] === separator) {
      groups.push(tokens.slice(start, index));
      start = index + 1;
    }
  }
  groups.push(tokens.slice(start));
  return groups;
}

export function assertSamsaraSelectSql(sql) {
  let tokens;
  try {
    tokens = tokenizeSql(sql);
  } catch (error) {
    return [`SQL parse failed: ${error instanceof Error ? error.message : String(error)}`];
  }
  const failures = [];
  const fromIndex = topLevelIndex(tokens, "from", 1);
  const whereIndex = topLevelIndex(tokens, "where", fromIndex + 1);
  const joinIndexes = tokens
    .map((token, index) => token === "join" && topLevelIndex(tokens, "join", index) === index ? index : -1)
    .filter((index) => index >= 0);
  if (tokens[0] !== "select" || fromIndex < 0 || whereIndex < 0) {
    return ["SQL must parse as one SELECT ... FROM ... WHERE statement"];
  }
  if (tokens.includes(";") || tokens.includes("union")) failures.push("SQL must be one SELECT without UNION or extra statements");
  const signature = (parts) => parts.join(" ");
  if (signature(tokens.slice(1, fromIndex)) !== "count ( distinct local_unit_id ) :: text as samsara_live") {
    failures.push("SELECT must derive samsara_live from count(DISTINCT local_unit_id)");
  }
  if (signature(tokens.slice(fromIndex + 1, whereIndex)) !== "integrations . samsara_vehicles") {
    failures.push("FROM must directly target integrations.samsara_vehicles");
  }
  if (joinIndexes.length !== 0) failures.push("Samsara counter query must not add JOIN semantics");
  const predicates = splitTopLevel(tokens.slice(whereIndex + 1), "and").map(signature);
  for (const predicate of [
    "operating_company_id = current_setting ( 'app.operating_company_id' , true ) :: uuid",
    "local_unit_id is not null",
    "last_seen_at >= now ( ) - interval '6 hours'",
  ]) {
    if (!predicates.includes(predicate)) failures.push(`WHERE must directly include: ${predicate}`);
  }
  return failures;
}

function assignmentCount(root, identifier) {
  let count = 0;
  walk(root, (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === identifier
    ) {
      count += 1;
    }
  });
  return count;
}

function destructuringTargetContains(node, identifier) {
  let target = node;
  while (ts.isParenthesizedExpression(target)) target = target.expression;
  if (ts.isIdentifier(target)) return target.text === identifier;
  if (
    ts.isBinaryExpression(target) &&
    target.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    return destructuringTargetContains(target.left, identifier);
  }
  if (ts.isObjectLiteralExpression(target)) {
    return target.properties.some(
      (property) =>
        (ts.isPropertyAssignment(property) &&
          destructuringTargetContains(property.initializer, identifier)) ||
        (ts.isShorthandPropertyAssignment(property) && property.name.text === identifier) ||
        (ts.isSpreadAssignment(property) &&
          destructuringTargetContains(property.expression, identifier)),
    );
  }
  if (ts.isArrayLiteralExpression(target)) {
    return target.elements.some((element) =>
      ts.isSpreadElement(element)
        ? destructuringTargetContains(element.expression, identifier)
        : destructuringTargetContains(element, identifier),
    );
  }
  return false;
}

function bindingPatternContains(name, identifier) {
  if (ts.isIdentifier(name)) return name.text === identifier;
  return name.elements.some((element) =>
    ts.isOmittedExpression(element) ? false : bindingPatternContains(element.name, identifier),
  );
}

function collectIdentifierWrites(root, identifier) {
  const writes = [];
  walk(root, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      (
        (ts.isIdentifier(node.name) && node.name.text === identifier) ||
        (
          (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name)) &&
          bindingPatternContains(node.name, identifier)
        )
      )
    ) {
      writes.push(node);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      (
        (ts.isIdentifier(node.left) && node.left.text === identifier) ||
        destructuringTargetContains(node.left, identifier)
      )
    ) {
      writes.push(node);
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator) &&
      ts.isIdentifier(node.operand) &&
      node.operand.text === identifier
    ) {
      writes.push(node);
    }
  });
  return writes;
}

function isInside(node, container) {
  for (let current = node; current; current = current.parent) {
    if (current === container) return true;
  }
  return false;
}

export function assertLiveCounterSource(file, source) {
  let sf;
  try {
    sf = parse(file, source);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  const failures = [];
  const register = topLevelRegisterFunction(sf);
  if (!register) {
    return [`${file}: require exactly one exported top-level registerReportsLibraryRoutes function`];
  }
  const route = directRouteCallback(register);
  if (!route) {
    return [`${file}: use canonical direct app.get("${ROUTE}", [options, ] async (...) => ...) form; route aliases/wrappers are forbidden`];
  }

  const { callback: scoped, snapshotDeclaration, handlerBlock } = directScopedCallback(route);
  if (!scoped || !snapshotDeclaration || !ts.isBlock(scoped.body)) {
    return [`${file}: use canonical const snapshot = await withCompanyScope(..., async (client) => { ... }) form; aliases/wrappers are forbidden`];
  }
  if (
    scoped.parameters.length !== 1 ||
    !ts.isIdentifier(scoped.parameters[0].name) ||
    scoped.parameters[0].name.text !== "client"
  ) {
    failures.push(`${file}: canonical scoped callback parameter must be named client`);
  }

  const routeReturns = handlerBlock.statements.filter(ts.isReturnStatement);
  if (
    routeReturns.length !== 1 ||
    !routeReturns[0].expression ||
    !ts.isIdentifier(routeReturns[0].expression) ||
    routeReturns[0].expression.text !== "snapshot"
  ) {
    failures.push(`${file}: canonical route must directly return snapshot`);
  }
  if (assignmentCount(route, "snapshot") !== 0) {
    failures.push(`${file}: snapshot reassignment is forbidden; keep the canonical direct return`);
  }
  const directVariable = (name) =>
    scoped.body.statements.flatMap((statement) =>
      ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.filter(
          (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
        )
        : [],
    );
  const companyDeclarations = directVariable("companyId");
  if (
    companyDeclarations.length !== 1 ||
    companyDeclarations[0].initializer?.getText(sf) !== "query.data.operating_company_id"
  ) {
    failures.push(`${file}: canonical companyId must directly bind query.data.operating_company_id`);
  }

  const gucStatements = scoped.body.statements.filter((statement) => {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isAwaitExpression(statement.expression) ||
      !ts.isCallExpression(statement.expression.expression) ||
      !ts.isPropertyAccessExpression(statement.expression.expression.expression) ||
      statement.expression.expression.expression.expression.getText(sf) !== "client" ||
      statement.expression.expression.expression.name.text !== "query"
    ) {
      return false;
    }
    const queryCall = statement.expression.expression;
    const sql = stringLiteral(queryCall.arguments[0]) ?? "";
    const args = queryCall.arguments[1];
    return (
      assertCompanyGucSql(sql).length === 0 &&
      Boolean(args) &&
      ts.isArrayLiteralExpression(args) &&
      args.elements.length === 1 &&
      ts.isIdentifier(args.elements[0]) &&
      args.elements[0].text === "companyId"
    );
  });
  const gucCall = gucStatements.length === 1;
  const relationStatements = scoped.body.statements.filter(
    (node) =>
      ts.isIfStatement(node) &&
      ts.isAwaitExpression(node.expression) &&
      ts.isCallExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === "relationExists" &&
      ts.isIdentifier(node.expression.expression.arguments[0]) &&
      node.expression.expression.arguments[0].text === "client" &&
      stringLiteral(node.expression.expression.arguments[1]) === RELATION
  );
  const relationIf = relationStatements.length === 1 ? relationStatements[0] : null;
  const liveQueryDeclarations =
    relationIf && ts.isBlock(relationIf.thenStatement)
      ? relationIf.thenStatement.statements.flatMap((statement) =>
        ts.isVariableStatement(statement)
          ? statement.declarationList.declarations.filter(
            (node) =>
      ts.isIdentifier(node.name) &&
      node.name.text === "samsaraRes" &&
      node.initializer &&
      ts.isAwaitExpression(node.initializer) &&
              directQueryCall(node.initializer.expression, "client", "FROM integrations.samsara_vehicles"),
          )
          : [],
      )
      : [];
  const liveQueryDeclaration = liveQueryDeclarations.length === 1 ? liveQueryDeclarations[0] : null;
  const directReturns = scoped.body.statements.filter(
    (node) => ts.isReturnStatement(node) && ts.isObjectLiteralExpression(node.expression),
  );
  let finalReturn = null;
  if (directReturns.length === 1) {
    const node = directReturns[0];
      const property = node.expression.properties.find(
        (candidate) =>
          ts.isPropertyAssignment(candidate) &&
          candidate.name.getText(sf) === "samsara_live",
      );
      if (
        property &&
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.initializer) &&
        property.initializer.text === "samsaraLive"
      ) {
        finalReturn = node;
      }
  }

  if (!gucCall) {
    failures.push(`${file}: canonical scoped client must directly execute set_config SQL with the current immutable companyId`);
  }
  if (!relationIf) {
    failures.push(`${file}: canonical direct await relationExists(client, "${RELATION}") branch is required`);
  }
  if (!liveQueryDeclaration || !relationIf) {
    failures.push(`${file}: canonical samsaraRes query must be directly inside the Samsara relation true branch`);
  } else {
    const sql = stringLiteral(
      (liveQueryDeclaration.initializer).expression.arguments[0],
    ) ?? "";
    for (const failure of assertSamsaraSelectSql(sql)) failures.push(`${file}: ${failure}`);
  }
  const counterDeclarations = directVariable("samsaraLive");
  if (
    counterDeclarations.length !== 1 ||
    counterDeclarations[0].parent.flags & ts.NodeFlags.Const ||
    counterDeclarations[0].initializer?.getText(sf) !== "0"
  ) {
    failures.push(`${file}: canonical counter must initialize directly to zero`);
  }
  const primaryCounterAssignments =
    relationIf && ts.isBlock(relationIf.thenStatement)
      ? relationIf.thenStatement.statements.filter(
        (statement) =>
          ts.isExpressionStatement(statement) &&
          ts.isBinaryExpression(statement.expression) &&
          statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(statement.expression.left) &&
          statement.expression.left.text === "samsaraLive" &&
          /^samsaraLive\s*=\s*Number\s*\(\s*\(\s*samsaraRes\.rows\[0\]\s+as\s+\{\s*samsara_live\?\s*:\s*string\s*\}\s*\|\s*undefined\s*\)\?\.samsara_live\s*\?\?\s*0\s*\)$/.test(
            statement.expression.getText(sf),
          ),
      )
      : [];
  if (primaryCounterAssignments.length !== 1) {
    failures.push(`${file}: canonical counter must directly assign Number(samsaraRes.rows[0]?.samsara_live ?? 0); aliases/dynamic values are forbidden`);
  }
  if (assignmentCount(scoped.body, "client") !== 0 || assignmentCount(scoped.body, "samsaraRes") !== 0) {
    failures.push(`${file}: client and samsaraRes reassignment are forbidden by the canonical contract`);
  }
  const counterWrites = collectIdentifierWrites(scoped.body, "samsaraLive");
  if (
    !relationIf ||
    counterWrites.length !== 2 ||
    counterDeclarations.length !== 1 ||
    counterWrites[0] !== counterDeclarations[0] ||
    primaryCounterAssignments.length !== 1 ||
    counterWrites[1] !== primaryCounterAssignments[0].expression
  ) {
    failures.push(`${file}: samsaraLive must have only the canonical zero declaration and one causal samsaraRes assignment; direct, compound, increment, or destructuring writes are forbidden`);
  }
  if (!finalReturn) {
    failures.push(`${file}: canonical scoped callback must directly return samsara_live: samsaraLive`);
  }

  return failures;
}

function canonicalFixture() {
  return `
    export async function registerReportsLibraryRoutes(app) {
      app.get("${ROUTE}", async () => {
        const snapshot = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
          const companyId = query.data.operating_company_id;
          await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
          let samsaraLive = 0;
          if (await relationExists(client, "${RELATION}")) {
            const samsaraRes = await client.query(\`SELECT count(DISTINCT local_unit_id)::text AS samsara_live
              FROM integrations.samsara_vehicles
              WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
                AND local_unit_id IS NOT NULL
                AND last_seen_at >= now() - interval '6 hours'\`);
            samsaraLive = Number((samsaraRes.rows[0] as { samsara_live?: string } | undefined)?.samsara_live ?? 0);
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
  const invalid = [
    ["route-alias", good.replace("app.get(", "const get = app.get; get(")],
    ["dead-route-wrapper", good.replace(`app.get("${ROUTE}",`, `if (false) { app.get("${ROUTE}",`).replace("      });\n    }\n  ", "      }); }\n    }\n  ")],
    ["nested-route-helper", good.replace(`app.get("${ROUTE}",`, `function mountDecoy() { app.get("${ROUTE}",`).replace("      });\n    }\n  ", "      }); }\n    }\n  ")],
    ["scope-alias", good.replace("await withCompanyScope(", "await scoped(")],
    ["reassigned-snapshot", good.replace("return snapshot;", "snapshot = fake; return snapshot;")],
    ["reassigned-query-result", good.replace("const samsaraRes =", "let samsaraRes =").replace("samsaraLive = Number", "samsaraRes = fake; samsaraLive = Number")],
    ["dynamic-return", good.replace("samsara_live: samsaraLive", "samsara_live: flag ? samsaraLive : 999")],
    ["hardcoded-return", good.replace("samsara_live: samsaraLive", "samsara_live: 999")],
    ["overwritten-counter", good.replace("return { samsara_live", "samsaraLive = 999; return { samsara_live")],
    ["wrong-company-guc", good.replace("[companyId]", "[otherCompanyId]")],
    ["comment-decoy-guc", good.replace(
      `"SELECT set_config('app.operating_company_id', $1::text, true)"`,
      `"SELECT 1 /* set_config('app.operating_company_id', $1::text, true) */"`,
    )],
    ["dead-guc-helper", good.replace(
      `await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);`,
      `async function deadProof() { await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]); }`,
    )],
    ["dead-relation", good.replace(`if (await relationExists(client, "${RELATION}"))`, `if (false && await relationExists(client, "${RELATION}"))`)],
    ["wrong-relation", good.replace(RELATION, "integrations.other")],
    ["query-outside-branch", good.replace(`if (await relationExists(client, "${RELATION}")) {`, `if (await relationExists(client, "${RELATION}")) {}\n{`)],
    ["unknown-query-wrapper", good.replace("await client.query(`SELECT count", "await runQuery(client, `SELECT count")],
    ["comment-decoy-hardcoded-select", good.replace(
      `\`SELECT count(DISTINCT local_unit_id)::text AS samsara_live
              FROM integrations.samsara_vehicles
              WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
                AND local_unit_id IS NOT NULL
                AND last_seen_at >= now() - interval '6 hours'\``,
      `\`SELECT '999' AS samsara_live
              /* SELECT count(DISTINCT local_unit_id)::text AS samsara_live
                 FROM integrations.samsara_vehicles
                 WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
                   AND local_unit_id IS NOT NULL
                   AND last_seen_at >= now() - interval '6 hours' */\``,
    )],
    ["javascript-comment-decoy-hardcoded-select", good.replace(
      `\`SELECT count(DISTINCT local_unit_id)::text AS samsara_live
              FROM integrations.samsara_vehicles
              WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
                AND local_unit_id IS NOT NULL
                AND last_seen_at >= now() - interval '6 hours'\``,
      `\`SELECT '999' AS samsara_live\` /* SELECT count(DISTINCT local_unit_id)
        FROM integrations.samsara_vehicles
        WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
          AND local_unit_id IS NOT NULL
          AND last_seen_at >= now() - interval '6 hours' */`,
    )],
    ["nested-counter-proof", good.replace(
      "samsaraLive = Number((samsaraRes.rows[0] as { samsara_live?: string } | undefined)?.samsara_live ?? 0);",
      "function deadCounterProof() { samsaraLive = Number((samsaraRes.rows[0] as { samsara_live?: string } | undefined)?.samsara_live ?? 0); } samsaraLive = 999;",
    )],
    ["same-branch-extra-counter", good.replace("samsaraLive = Number", "samsaraLive = 77;\n            samsaraLive = Number")],
    ["conditional-extra-counter", good.replace("samsaraLive = Number", "if (flag) samsaraLive = 88;\n            samsaraLive = Number")],
    ["object-destructured-counter", good.replace("samsaraLive = Number", "({ value: samsaraLive } = payload);\n            samsaraLive = Number")],
    ["computed-destructured-counter", good.replace("samsaraLive = Number", "({ [counterKey]: samsaraLive } = payload);\n            samsaraLive = Number")],
    ["later-destructured-counter", good.replace("return { samsara_live", "({ value: samsaraLive } = payload);\n          return { samsara_live")],
    ["conditional-destructured-counter", good.replace("return { samsara_live", "if (companyId === fifthCompany) ({ value: samsaraLive } = payload);\n          return { samsara_live")],
    ["destructured-counter-declaration", good.replace("let samsaraLive = 0;", "let samsaraLive = 0;\n          const { value: samsaraLive } = payload;")],
    ["nested-object-destructured-counter", good.replace("return { samsara_live", "({ outer: { inner: samsaraLive } } = payload);\n          return { samsara_live")],
    ["nested-array-destructured-counter", good.replace("return { samsara_live", "([first, [samsaraLive]] = payload);\n          return { samsara_live")],
    ["rest-destructured-counter", good.replace("return { samsara_live", "({ value, ...samsaraLive } = payload);\n          return { samsara_live")],
    ["default-destructured-counter", good.replace("return { samsara_live", "({ value: samsaraLive = 0 } = payload);\n          return { samsara_live")],
    ["computed-nested-destructured-counter", good.replace("return { samsara_live", "({ [outerKey]: { [innerKey]: samsaraLive } } = payload);\n          return { samsara_live")],
    ["nested-destructured-counter-declaration", good.replace("let samsaraLive = 0;", "let samsaraLive = 0;\n          const { outer: { inner: samsaraLive } } = payload;")],
    ["dead-proof-actual-999", good.replace(
      "return { samsara_live: samsaraLive };",
      "function deadProof() { return { samsara_live: samsaraLive }; } return { samsara_live: 999 };",
    )],
    ["parse-error", `${good}\nconst broken = {`],
  ];
  const problems = [];
  const goodFailures = assertLiveCounterSource("canonical.ts", good);
  if (goodFailures.length) problems.push(`canonical unexpectedly failed: ${goodFailures.join(" | ")}`);
  const rateLimitGood = good.replace(
    `app.get("${ROUTE}", async`,
    `app.get("${ROUTE}", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async`,
  );
  const rateLimitFailures = assertLiveCounterSource("rate-limit-options.ts", rateLimitGood);
  if (rateLimitFailures.length) {
    problems.push(`rate-limit-options unexpectedly failed: ${rateLimitFailures.join(" | ")}`);
  }
  for (const [name, source] of invalid) {
    if (assertLiveCounterSource(`${name}.ts`, source).length === 0) problems.push(`${name} unexpectedly passed`);
  }
  if (problems.length) {
    console.error(`verify:94-live-counter-linkage --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`verify:94-live-counter-linkage --selftest PASS canonical control; rejects=${invalid.map(([name]) => name).join(",")}`);
}

function main() {
  if (process.argv.includes("--selftest")) return runSelftest();
  const absolute = path.join(ROOT, TARGET);
  if (!fs.existsSync(absolute)) {
    console.error(`verify:94-live-counter-linkage FAIL — ${TARGET} is missing`);
    process.exit(1);
  }
  const failures = assertLiveCounterSource(TARGET, fs.readFileSync(absolute, "utf8"));
  if (failures.length) {
    console.error("verify:94-live-counter-linkage FAIL");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("verify:94-live-counter-linkage PASS — canonical route shape; behavior covered by Fastify injection tests");
}

main();
