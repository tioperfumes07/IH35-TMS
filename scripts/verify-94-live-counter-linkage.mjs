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

  let routeCallback = null;
  function findRoute(node) {
    if (
      isPropertyCall(node, "app", "get") &&
      stringValue(node.arguments[0]) === "/api/v1/reports/home-fleet-snapshot"
    ) {
      const callback = node.arguments[1];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        routeCallback = callback;
      }
    }
    ts.forEachChild(node, findRoute);
  }
  findRoute(sf);
  if (!routeCallback) {
    failures.push(`${relativePath}:1 could not locate /api/v1/reports/home-fleet-snapshot route`);
    return failures;
  }

  let relationCheck = false;
  const samsaraQueries = [];
  function inspectRoute(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "relationExists" &&
      stringValue(node.arguments[1]) === "integrations.samsara_vehicles"
    ) {
      relationCheck = true;
    }
    if (isPropertyCall(node, "client", "query")) {
      const sql = stringValue(node.arguments[0]);
      if (sql && /\bFROM\s+integrations\.samsara_vehicles\b/i.test(sql.replace(/--.*$/gm, ""))) {
        samsaraQueries.push(sql.replace(/--.*$/gm, ""));
      }
    }
    ts.forEachChild(node, inspectRoute);
  }
  inspectRoute(routeCallback);

  if (!relationCheck) {
    failures.push(`${relativePath}: missing executable relationExists check for integrations.samsara_vehicles`);
  }
  if (samsaraQueries.length !== 1) {
    failures.push(`${relativePath}: expected exactly one executable samsara counter query, found ${samsaraQueries.length}`);
    return failures;
  }
  const sql = samsaraQueries[0];
  if (!/\bWHERE\s+operating_company_id\s*=\s*current_setting\(/i.test(sql)) {
    failures.push(`${relativePath}: samsara counter query must scope operating_company_id via current_setting`);
  }
  if (!/\bcount\s*\(\s*DISTINCT\s+local_unit_id\s*\)/i.test(sql)) {
    failures.push(`${relativePath}: samsara counter query must count DISTINCT local_unit_id`);
  }
  if (!/\blocal_unit_id\s+IS\s+NOT\s+NULL\b/i.test(sql)) {
    failures.push(`${relativePath}: samsara counter query must exclude NULL local_unit_id`);
  }
  return failures;
}

function runSelftest() {
  const good = `
    app.get("/api/v1/reports/home-fleet-snapshot", async () => {
      if (await relationExists(client, "integrations.samsara_vehicles")) {
        await client.query(\`SELECT count(DISTINCT local_unit_id)
          FROM integrations.samsara_vehicles
          WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
          AND local_unit_id IS NOT NULL\`);
      }
    });
  `;
  const decoy = `
    app.get("/api/v1/reports/home-fleet-snapshot", async () => {
      // relationExists(client, "integrations.samsara_vehicles")
      const fake = "FROM integrations.samsara_vehicles WHERE operating_company_id local_unit_id";
      await client.query("SELECT count(*) FROM mdata.units");
    });
  `;
  const goodFailures = assertLiveCounterSource("good.ts", good);
  const decoyFailures = assertLiveCounterSource("decoy.ts", decoy);
  if (goodFailures.length > 0 || decoyFailures.length < 2) {
    console.error("verify:94-live-counter-linkage --selftest FAIL", { goodFailures, decoyFailures });
    process.exit(1);
  }
  console.log("verify:94-live-counter-linkage --selftest PASS (AST/SQL semantics reject decoys)");
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
