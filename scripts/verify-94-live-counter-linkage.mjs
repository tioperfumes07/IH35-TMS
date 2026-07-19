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

function isExecutedCallback(node) {
  return ts.isCallExpression(node.parent) && node.parent.arguments.includes(node);
}

function walkExecutable(root, visitor) {
  function visit(node) {
    if (node !== root && ts.isFunctionLike(node) && !isExecutedCallback(node)) return;
    visitor(node);
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
  walkExecutable(routeCallback, (node) => {
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
  walkExecutable(routeCallback, (node) => {
    if (ts.isReturnStatement(node) && node.expression?.getText(sf) === "snapshot") found = true;
  });
  return found;
}

function hasSamsaraLiveResult(scopeCallback, sf) {
  let found = false;
  walkExecutable(scopeCallback, (node) => {
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
  const samsaraQueries = [];
  walkExecutable(scopedSnapshot.callback, (node) => {
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
        samsaraQueries.push(sql.replace(/--.*$/gm, ""));
      }
    }
  });

  if (!relationCheck) {
    failures.push(`${relativePath}: missing reachable relationExists(client, integrations.samsara_vehicles) check`);
  }
  if (!companyGuc) {
    failures.push(`${relativePath}: missing reachable client.query set_config for app.operating_company_id`);
  }
  if (samsaraQueries.length !== 1) {
    failures.push(`${relativePath}: expected exactly one reachable client samsara counter query, found ${samsaraQueries.length}`);
    return failures;
  }
  const sql = samsaraQueries[0];
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
          await client.query(\`SELECT count(DISTINCT local_unit_id)
            FROM integrations.samsara_vehicles
            WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
            AND local_unit_id IS NOT NULL\`);
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
  const goodFailures = assertLiveCounterSource("good.ts", good);
  const decoyFailures = assertLiveCounterSource("decoy.ts", decoy);
  const deadFunctionFailures = assertLiveCounterSource("dead-function.ts", deadFunction);
  const wrongClientFailures = assertLiveCounterSource("wrong-client.ts", wrongClient);
  const wrongGucFailures = assertLiveCounterSource("wrong-guc.ts", wrongGuc);
  const hardcodedResultFailures = assertLiveCounterSource("hardcoded-result.ts", hardcodedResult);
  if (
    goodFailures.length > 0 ||
    decoyFailures.length < 3 ||
    !deadFunctionFailures.some((failure) => failure.includes("relationExists")) ||
    !deadFunctionFailures.some((failure) => failure.includes("counter query")) ||
    !wrongClientFailures.some((failure) => failure.includes("relationExists")) ||
    !wrongClientFailures.some((failure) => failure.includes("counter query")) ||
    !wrongGucFailures.some((failure) => failure.includes("app.operating_company_id")) ||
    !hardcodedResultFailures.some((failure) => failure.includes("return samsara_live"))
  ) {
    console.error("verify:94-live-counter-linkage --selftest FAIL", {
      goodFailures,
      decoyFailures,
      deadFunctionFailures,
      wrongClientFailures,
      wrongGucFailures,
      hardcodedResultFailures,
    });
    process.exit(1);
  }
  console.log("verify:94-live-counter-linkage --selftest PASS never-called query/relation helper rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS wrong relation/query client rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS wrong set_config/current_setting GUC rejected");
  console.log("verify:94-live-counter-linkage --selftest PASS hardcoded samsara_live result rejected");
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
