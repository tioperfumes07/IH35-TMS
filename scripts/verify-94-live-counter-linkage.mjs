#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const TARGET_FILES = ["apps/backend/src/reports/library.routes.ts"];

function fail(messages) {
  console.error("verify:94-live-counter-linkage — FAILED");
  for (const message of messages) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

function stringValue(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("${}");
  }
  return null;
}

function isPropertyCall(node, objectName, methodName) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText() === objectName &&
    node.expression.name.text === methodName
  );
}

function isConstFalse(node) {
  return node.kind === ts.SyntaxKind.FalseKeyword;
}

// The selected callback is known to execute. Nested function bodies are declarations/values,
// not proof of execution. Constant-false branches are unreachable and must not satisfy a guard.
function walkReachable(root, visitor) {
  function visit(node) {
    if (node !== root && ts.isFunctionLike(node)) return;
    visitor(node);
    if (ts.isIfStatement(node) && isConstFalse(node.expression)) {
      if (node.elseStatement) visit(node.elseStatement);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isConstFalse(node.left)
    ) {
      visit(node.left);
      return;
    }
    if (ts.isConditionalExpression(node) && isConstFalse(node.condition)) {
      visit(node.condition);
      visit(node.whenFalse);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
}

function findRouteCallback(sf) {
  let routeCallback = null;
  function visit(node) {
    if (
      isPropertyCall(node, "app", "get") &&
      stringValue(node.arguments[0]) === "/api/v1/reports/home-fleet-snapshot"
    ) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        routeCallback = callback;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return routeCallback;
}

function findScopedSnapshot(routeCallback, sf) {
  let result = null;
  walkReachable(routeCallback, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "snapshot" &&
      node.initializer &&
      ts.isAwaitExpression(node.initializer) &&
      ts.isCallExpression(node.initializer.expression) &&
      node.initializer.expression.expression.getText(sf) === "withCompanyScope"
    ) {
      const callback = node.initializer.expression.arguments[2];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        result = { declaration: node, callback };
      }
    }
  });
  return result;
}

function hasReturnedSnapshot(routeCallback, sf) {
  let found = false;
  walkReachable(routeCallback, (node) => {
    if (ts.isReturnStatement(node) && node.expression?.getText(sf) === "snapshot") found = true;
  });
  return found;
}

function hasSamsaraLiveResult(scopeCallback, sf) {
  let found = false;
  walkReachable(scopeCallback, (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sf) === "samsara_live" &&
      node.initializer.getText(sf) === "samsaraLive"
    ) {
      found = true;
    }
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === "samsara_live") {
      found = true;
    }
  });
  return found;
}

export function assertLiveCounterSource(relativePath, text) {
  const failures = [];
  const sf = ts.createSourceFile(relativePath, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length > 0) {
    return [
      `${relativePath}:1 TypeScript parse failed: ${sf.parseDiagnostics
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
        .join("; ")}`,
    ];
  }

  const routeCallback = findRouteCallback(sf);
  if (!routeCallback) {
    failures.push(`${relativePath}:1 could not locate /api/v1/reports/home-fleet-snapshot route`);
    return failures;
  }

  const scopedSnapshot = findScopedSnapshot(routeCallback, sf);
  if (!scopedSnapshot) {
    failures.push(`${relativePath}: home fleet snapshot must execute through withCompanyScope`);
    return failures;
  }
  if (!hasReturnedSnapshot(routeCallback, sf)) {
    failures.push(`${relativePath}: route must return the scoped snapshot result`);
  }

  let relationCheck = false;
  let companyGuc = false;
  let clientReassigned = false;
  let samsaraLiveStartsAtZero = false;
  let samsaraLiveDeclarations = 0;
  const samsaraQueries = [];
  walkReachable(scopedSnapshot.callback, (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(sf) === "client"
    ) {
      clientReassigned = true;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sf) === "samsaraLive"
    ) {
      samsaraLiveDeclarations += 1;
      if (node.initializer?.getText(sf) === "0") samsaraLiveStartsAtZero = true;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "relationExists" &&
      node.arguments[0]?.getText(sf) === "client" &&
      stringValue(node.arguments[1]) === "integrations.samsara_vehicles"
    ) {
      relationCheck = true;
    }
    if (
      isPropertyCall(node, "client", "query") &&
      stringValue(node.arguments[0])?.includes("set_config('app.operating_company_id', $1, true)") &&
      node.arguments[1]?.getText(sf) === "[companyId]"
    ) {
      companyGuc = true;
    }
    if (isPropertyCall(node, "client", "query")) {
      const sql = stringValue(node.arguments[0]);
      if (sql && /\bFROM\s+integrations\.samsara_vehicles\b/i.test(sql.replace(/--.*$/gm, ""))) {
        const awaitExpression = ts.isAwaitExpression(node.parent) ? node.parent : null;
        const declaration = awaitExpression && ts.isVariableDeclaration(awaitExpression.parent)
          ? awaitExpression.parent
          : null;
        samsaraQueries.push({
          sql: sql.replace(/--.*$/gm, ""),
          resultName: declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : null,
          position: node.getStart(sf),
          node,
        });
      }
    }
  });

  if (!relationCheck) {
    failures.push(`${relativePath}: missing reachable relationExists(client, integrations.samsara_vehicles) check`);
  }
  if (!companyGuc) {
    failures.push(`${relativePath}: missing reachable client.query set_config for app.operating_company_id`);
  }
  if (clientReassigned) {
    failures.push(`${relativePath}: scoped client must not be reassigned`);
  }
  if (!samsaraLiveStartsAtZero) {
    failures.push(`${relativePath}: samsaraLive must initialize to zero before the live query`);
  }
  if (samsaraLiveDeclarations !== 1) {
    failures.push(`${relativePath}: expected exactly one reachable samsaraLive declaration`);
  }
  if (samsaraQueries.length !== 1) {
    failures.push(`${relativePath}: expected exactly one reachable client samsara counter query, found ${samsaraQueries.length}`);
    return failures;
  }
  const { sql, resultName, position: queryPosition, node: queryNode } = samsaraQueries[0];
  if (!resultName) {
    failures.push(`${relativePath}: samsara counter query result must be captured`);
  } else {
    let queryBranch = null;
    let queryControl = null;
    for (let ancestor = queryNode.parent; ancestor && ancestor !== scopedSnapshot.callback; ancestor = ancestor.parent) {
      if (ts.isIfStatement(ancestor) && ancestor.thenStatement.pos <= queryNode.pos && ancestor.thenStatement.end >= queryNode.end) {
        queryBranch = ancestor.thenStatement;
        queryControl = ancestor;
        break;
      }
    }
    const resultReassignments = [];
    const counterAssignments = [];
    walkReachable(queryBranch ?? scopedSnapshot.callback, (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.getStart(sf) > queryPosition
      ) {
        if (node.left.getText(sf) === resultName) resultReassignments.push(node);
        if (node.left.getText(sf) === "samsaraLive") counterAssignments.push(node);
      }
    });
    if (resultReassignments.length > 0) {
      failures.push(`${relativePath}: captured samsara query result must not be reassigned`);
    }
    const correctAssignments = counterAssignments.filter((node) => {
      const value = node.right.getText(sf);
      return value.includes(resultName) && value.includes("samsara_live");
    });
    if (counterAssignments.length !== 1 || correctAssignments.length !== 1) {
      failures.push(`${relativePath}: samsaraLive must derive from the captured query result's samsara_live field`);
    }
    if (queryBranch) {
      let overwrittenAfterBranch = false;
      walkReachable(scopedSnapshot.callback, (node) => {
        let insideQueryControl = false;
        for (let ancestor = node.parent; ancestor && ancestor !== scopedSnapshot.callback; ancestor = ancestor.parent) {
          if (ancestor === queryControl) {
            insideQueryControl = true;
            break;
          }
        }
        if (
          !insideQueryControl &&
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          node.left.getText(sf) === "samsaraLive" &&
          node.getStart(sf) > queryBranch.end
        ) {
          overwrittenAfterBranch = true;
        }
      });
      if (overwrittenAfterBranch) {
        failures.push(`${relativePath}: samsaraLive must not be overwritten after the scoped live-query branch`);
      }
    }
  }
  if (
    !/\bWHERE\s+operating_company_id\s*=\s*current_setting\(\s*'app\.operating_company_id'\s*,\s*true\s*\)::uuid/i.test(sql)
  ) {
    failures.push(`${relativePath}: samsara counter query must use the app.operating_company_id GUC`);
  }
  if (!/\bcount\s*\(\s*DISTINCT\s+local_unit_id\s*\)/i.test(sql)) {
    failures.push(`${relativePath}: samsara counter query must count DISTINCT local_unit_id`);
  }
  if (!/\blocal_unit_id\s+IS\s+NOT\s+NULL\b/i.test(sql)) {
    failures.push(`${relativePath}: samsara counter query must exclude NULL local_unit_id`);
  }
  if (!hasSamsaraLiveResult(scopedSnapshot.callback, sf)) {
    failures.push(`${relativePath}: scoped snapshot must return samsara_live from samsaraLive`);
  }
  return failures;
}

function runSelftest() {
  const good = `
    app.get("/api/v1/reports/home-fleet-snapshot", async () => {
      const snapshot = await withCompanyScope(user.uuid, companyId, async (client) => {
        await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
        let samsaraLive = 0;
        if (await relationExists(client, "integrations.samsara_vehicles")) {
          const samsaraRes = await client.query(\`SELECT count(DISTINCT local_unit_id)
            FROM integrations.samsara_vehicles
            WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
            AND local_unit_id IS NOT NULL\`);
          samsaraLive = Number(samsaraRes.rows[0]?.samsara_live ?? 0);
        }
        return { samsara_live: samsaraLive };
      });
      return snapshot;
    });
  `;
  const decoy = `
    app.get("/api/v1/reports/home-fleet-snapshot", async () => {
      const snapshot = await withCompanyScope(user.uuid, companyId, async (client) => {
        await client.query("SELECT set_config('wrong.guc', $1, true)", [companyId]);
      // relationExists(client, "integrations.samsara_vehicles")
      const fake = "FROM integrations.samsara_vehicles WHERE operating_company_id local_unit_id";
      await client.query("SELECT count(*) FROM mdata.units");
        return { samsara_live: 999 };
      });
      return snapshot;
    });
  `;
  const deadFunction = `
    app.get("/api/v1/reports/home-fleet-snapshot", async () => {
      const snapshot = await withCompanyScope(user.uuid, companyId, async (client) => {
        await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
        let samsaraLive = 0;
        function neverCalled() {
          relationExists(client, "integrations.samsara_vehicles");
          client.query(\`SELECT count(DISTINCT local_unit_id)
            FROM integrations.samsara_vehicles
            WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
            AND local_unit_id IS NOT NULL\`);
        }
        return { samsara_live: samsaraLive };
      });
      return snapshot;
    });
  `;
  const wrongClient = good
    .replace(`relationExists(client, "integrations.samsara_vehicles")`, `relationExists(wrongClient, "integrations.samsara_vehicles")`)
    .replace("await client.query(`SELECT count(DISTINCT local_unit_id)", "await wrongClient.query(`SELECT count(DISTINCT local_unit_id)");
  const wrongGuc = good.replaceAll("app.operating_company_id", "wrong.guc");
  const hardcodedResult = good.replace("samsara_live: samsaraLive", "samsara_live: 999");
  const constantFalse = good.replace(
    `if (await relationExists(client, "integrations.samsara_vehicles")) {`,
    `if (false) { relationExists(client, "integrations.samsara_vehicles");`,
  );
  const inertCallback = good.replace(
    `if (await relationExists(client, "integrations.samsara_vehicles")) {`,
    `const inert = () => { relationExists(client, "integrations.samsara_vehicles");`,
  ).replace(
    `        }\n        return { samsara_live: samsaraLive };`,
    `        };\n        return { samsara_live: samsaraLive };`,
  );
  const reassignedClient = good.replace(
    "let samsaraLive = 0;",
    "let samsaraLive = 0; client = wrongClient;",
  );
  const ignoredResult = good
    .replace("const samsaraRes = await client.query", "await client.query")
    .replace("samsaraLive = Number(samsaraRes.rows[0]?.samsara_live ?? 0);", "samsaraLive = 0;");
  const poisonedInitialValue = good.replace("let samsaraLive = 0;", "let samsaraLive = 999;");
  const reassignedQueryResult = good
    .replace("const samsaraRes = await client.query", "let samsaraRes = await client.query")
    .replace(
      "samsaraLive = Number(samsaraRes.rows[0]?.samsara_live ?? 0);",
      "samsaraRes = fakeResult; samsaraLive = Number(samsaraRes.rows[0]?.samsara_live ?? 0);",
    );
  const overwrittenCounter = good.replace(
    "return { samsara_live: samsaraLive };",
    "samsaraLive = 999; return { samsara_live: samsaraLive };",
  );
  const goodFailures = assertLiveCounterSource("good.ts", good);
  const decoyFailures = assertLiveCounterSource("decoy.ts", decoy);
  const deadFunctionFailures = assertLiveCounterSource("dead-function.ts", deadFunction);
  const wrongClientFailures = assertLiveCounterSource("wrong-client.ts", wrongClient);
  const wrongGucFailures = assertLiveCounterSource("wrong-guc.ts", wrongGuc);
  const hardcodedResultFailures = assertLiveCounterSource("hardcoded-result.ts", hardcodedResult);
  const constantFalseFailures = assertLiveCounterSource("constant-false.ts", constantFalse);
  const inertCallbackFailures = assertLiveCounterSource("inert-callback.ts", inertCallback);
  const reassignedClientFailures = assertLiveCounterSource("reassigned-client.ts", reassignedClient);
  const ignoredResultFailures = assertLiveCounterSource("ignored-result.ts", ignoredResult);
  const poisonedInitialValueFailures = assertLiveCounterSource("poisoned-initial-value.ts", poisonedInitialValue);
  const reassignedQueryResultFailures = assertLiveCounterSource("reassigned-query-result.ts", reassignedQueryResult);
  const overwrittenCounterFailures = assertLiveCounterSource("overwritten-counter.ts", overwrittenCounter);
  if (
    goodFailures.length > 0 ||
    decoyFailures.length < 3 ||
    !deadFunctionFailures.some((failure) => failure.includes("relationExists")) ||
    !deadFunctionFailures.some((failure) => failure.includes("counter query")) ||
    !wrongClientFailures.some((failure) => failure.includes("relationExists")) ||
    !wrongClientFailures.some((failure) => failure.includes("counter query")) ||
    !wrongGucFailures.some((failure) => failure.includes("app.operating_company_id")) ||
    !hardcodedResultFailures.some((failure) => failure.includes("return samsara_live")) ||
    !constantFalseFailures.some((failure) => failure.includes("relationExists")) ||
    !constantFalseFailures.some((failure) => failure.includes("counter query")) ||
    !inertCallbackFailures.some((failure) => failure.includes("relationExists")) ||
    !inertCallbackFailures.some((failure) => failure.includes("counter query")) ||
    !reassignedClientFailures.some((failure) => failure.includes("must not be reassigned")) ||
    !ignoredResultFailures.some((failure) => failure.includes("result must be captured")) ||
    !poisonedInitialValueFailures.some((failure) => failure.includes("initialize to zero")) ||
    !reassignedQueryResultFailures.some((failure) => failure.includes("result must not be reassigned")) ||
    !overwrittenCounterFailures.some((failure) => failure.includes("must not be overwritten"))
  ) {
    console.error("verify:94-live-counter-linkage --selftest FAIL", {
      goodFailures,
      decoyFailures,
      deadFunctionFailures,
      wrongClientFailures,
      wrongGucFailures,
      hardcodedResultFailures,
      constantFalseFailures,
      inertCallbackFailures,
      reassignedClientFailures,
      ignoredResultFailures,
      poisonedInitialValueFailures,
      reassignedQueryResultFailures,
      overwrittenCounterFailures,
    });
    process.exit(1);
  }
  console.log("verify:94-live-counter-linkage --selftest PASS never-called query/relation helper rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS wrong relation/query client rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS wrong set_config/current_setting GUC rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS hardcoded samsara_live result rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS constant-false query branch rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS inert callback query wrapper rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS reassigned scoped client rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS ignored query result rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS poisoned samsaraLive initializer rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS reassigned query result rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS overwritten returned counter rejected");
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }

  const failures = [];
  for (const relativePath of TARGET_FILES) {
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`${relativePath}:1 target file missing`);
      continue;
    }
    failures.push(...assertLiveCounterSource(relativePath, fs.readFileSync(absolutePath, "utf8")));
  }
  if (failures.length > 0) fail(failures);
  console.log("verify:94-live-counter-linkage — OK");
}

main();
