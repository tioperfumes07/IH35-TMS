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

function directRouteCallback(sf) {
  let callback = null;
  walk(sf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "app" &&
      node.expression.name.text === "get" &&
      stringLiteral(node.arguments[0]) === ROUTE
    ) {
      const candidate = node.arguments[1];
      if (candidate && (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))) {
        callback = candidate;
      }
    }
  });
  return callback;
}

function directScopedCallback(route) {
  let callback = null;
  let snapshotDeclaration = null;
  walk(route, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "snapshot" &&
      node.initializer &&
      ts.isAwaitExpression(node.initializer) &&
      ts.isCallExpression(node.initializer.expression) &&
      ts.isIdentifier(node.initializer.expression.expression) &&
      node.initializer.expression.expression.text === "withCompanyScope"
    ) {
      const candidate = node.initializer.expression.arguments[2];
      if (candidate && (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))) {
        snapshotDeclaration = node;
        callback = candidate;
      }
    }
  });
  return { callback, snapshotDeclaration };
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
  const route = directRouteCallback(sf);
  if (!route) {
    return [`${file}: use canonical direct app.get("${ROUTE}", async (...) => ...) form; route aliases/wrappers are forbidden`];
  }

  const { callback: scoped, snapshotDeclaration } = directScopedCallback(route);
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

  const routeText = route.getText(sf);
  const scopedText = scoped.body.getText(sf);
  if (!/\breturn\s+snapshot\s*;/.test(routeText)) {
    failures.push(`${file}: canonical route must directly return snapshot`);
  }
  if (assignmentCount(route, "snapshot") !== 0) {
    failures.push(`${file}: snapshot reassignment is forbidden; keep the canonical direct return`);
  }
  if (!/\bconst\s+companyId\s*=\s*query\.data\.operating_company_id\s*;/.test(scopedText)) {
    failures.push(`${file}: canonical companyId must directly bind query.data.operating_company_id`);
  }

  let gucCall = false;
  let relationIf = null;
  let liveQueryDeclaration = null;
  let finalReturn = null;
  walk(scoped.body, (node) => {
    if (directQueryCall(node, "client", "set_config('app.operating_company_id', $1, true)")) {
      const args = node.arguments[1];
      gucCall =
        Boolean(args) &&
        ts.isArrayLiteralExpression(args) &&
        args.elements.length === 1 &&
        ts.isIdentifier(args.elements[0]) &&
        args.elements[0].text === "companyId";
    }
    if (
      ts.isIfStatement(node) &&
      ts.isAwaitExpression(node.expression) &&
      ts.isCallExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === "relationExists" &&
      ts.isIdentifier(node.expression.expression.arguments[0]) &&
      node.expression.expression.arguments[0].text === "client" &&
      stringLiteral(node.expression.expression.arguments[1]) === RELATION
    ) {
      relationIf = node;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "samsaraRes" &&
      node.initializer &&
      ts.isAwaitExpression(node.initializer) &&
      directQueryCall(node.initializer.expression, "client", "FROM integrations.samsara_vehicles")
    ) {
      liveQueryDeclaration = node;
    }
    if (ts.isReturnStatement(node) && ts.isObjectLiteralExpression(node.expression)) {
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
  });

  if (!gucCall) {
    failures.push(`${file}: canonical scoped client must directly set app.operating_company_id from companyId`);
  }
  if (!relationIf) {
    failures.push(`${file}: canonical direct await relationExists(client, "${RELATION}") branch is required`);
  }
  if (!liveQueryDeclaration || !relationIf || liveQueryDeclaration.pos < relationIf.thenStatement.pos || liveQueryDeclaration.end > relationIf.thenStatement.end) {
    failures.push(`${file}: canonical samsaraRes query must be directly inside the Samsara relation true branch`);
  } else {
    const sql = stringLiteral(
      (liveQueryDeclaration.initializer).expression.arguments[0],
    ) ?? "";
    for (const requirement of [
      [/\bcount\s*\(\s*DISTINCT\s+local_unit_id\s*\)/i, "count DISTINCT local_unit_id"],
      [/\blocal_unit_id\s+IS\s+NOT\s+NULL\b/i, "exclude NULL local_unit_id"],
      [/operating_company_id\s*=\s*current_setting\(\s*'app\.operating_company_id'\s*,\s*true\s*\)::uuid/i, "scope by the company GUC"],
    ]) {
      if (!requirement[0].test(sql)) failures.push(`${file}: canonical Samsara SQL must ${requirement[1]}`);
    }
  }
  if (!/\blet\s+samsaraLive\s*=\s*0\s*;/.test(scopedText)) {
    failures.push(`${file}: canonical counter must initialize directly to zero`);
  }
  if (
    !/\bsamsaraLive\s*=\s*Number\s*\(\s*\(\s*samsaraRes\.rows\[0\]\s+as\s+\{\s*samsara_live\?\s*:\s*string\s*\}\s*\|\s*undefined\s*\)\?\.samsara_live\s*\?\?\s*0\s*\)\s*;/.test(scopedText)
  ) {
    failures.push(`${file}: canonical counter must directly assign Number(samsaraRes.rows[0]?.samsara_live ?? 0); aliases/dynamic values are forbidden`);
  }
  if (assignmentCount(scoped.body, "client") !== 0 || assignmentCount(scoped.body, "samsaraRes") !== 0) {
    failures.push(`${file}: client and samsaraRes reassignment are forbidden by the canonical contract`);
  }
  const counterAssignments = [];
  walk(scoped.body, (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === "samsaraLive"
    ) {
      counterAssignments.push(node);
    }
  });
  if (
    !relationIf ||
    counterAssignments.some(
      (assignment) =>
        !isInside(assignment, relationIf.thenStatement) &&
        !(relationIf.elseStatement && isInside(assignment, relationIf.elseStatement)),
    )
  ) {
    failures.push(`${file}: samsaraLive may only be assigned inside the canonical relation branch/fallback; later overwrites are forbidden`);
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
          await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
          let samsaraLive = 0;
          if (await relationExists(client, "${RELATION}")) {
            const samsaraRes = await client.query(\`SELECT count(DISTINCT local_unit_id)::text AS samsara_live
              FROM integrations.samsara_vehicles
              WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
                AND local_unit_id IS NOT NULL\`);
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
    ["scope-alias", good.replace("await withCompanyScope(", "await scoped(")],
    ["reassigned-snapshot", good.replace("return snapshot;", "snapshot = fake; return snapshot;")],
    ["reassigned-query-result", good.replace("const samsaraRes =", "let samsaraRes =").replace("samsaraLive = Number", "samsaraRes = fake; samsaraLive = Number")],
    ["dynamic-return", good.replace("samsara_live: samsaraLive", "samsara_live: flag ? samsaraLive : 999")],
    ["hardcoded-return", good.replace("samsara_live: samsaraLive", "samsara_live: 999")],
    ["overwritten-counter", good.replace("return { samsara_live", "samsaraLive = 999; return { samsara_live")],
    ["wrong-company-guc", good.replace("[companyId]", "[otherCompanyId]")],
    ["dead-relation", good.replace(`if (await relationExists(client, "${RELATION}"))`, `if (false && await relationExists(client, "${RELATION}"))`)],
    ["wrong-relation", good.replace(RELATION, "integrations.other")],
    ["query-outside-branch", good.replace(`if (await relationExists(client, "${RELATION}")) {`, `if (await relationExists(client, "${RELATION}")) {}\n{`)],
    ["unknown-query-wrapper", good.replace("await client.query(`SELECT count", "await runQuery(client, `SELECT count")],
    ["parse-error", `${good}\nconst broken = {`],
  ];
  const problems = [];
  const goodFailures = assertLiveCounterSource("canonical.ts", good);
  if (goodFailures.length) problems.push(`canonical unexpectedly failed: ${goodFailures.join(" | ")}`);
  for (const [name, source] of invalid) {
    if (assertLiveCounterSource(`${name}.ts`, source).length === 0) problems.push(`${name} unexpectedly passed`);
  }
  if (problems.length) {
    console.error(`verify:94-live-counter-linkage --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`verify:94-live-counter-linkage --selftest PASS canonical control + ${invalid.length} historical/metamorphic rejects`);
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
