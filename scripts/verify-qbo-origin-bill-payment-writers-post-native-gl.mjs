#!/usr/bin/env node
/** 443.117 9b — native bill-payment writers post through the shared engine, independent of QBO provenance. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  bills: "apps/backend/src/accounting/bills.service.ts",
  vendor: "apps/backend/src/accounting/vendor-bill-payments.routes.ts",
  apApplication: "apps/backend/src/ap/payment-application.routes.ts",
  settlement: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  engine: "apps/backend/src/accounting/posting-engine.service.ts",
  liveVerifier: "scripts/verify-no-bill-payment-without-postings.mjs",
};

function parse(text, name) {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function getFunctions(text, name) {
  const sourceFile = parse(text, name);
  const functions = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { sourceFile, functions };
}

function walk(root, fn) {
  const visit = (node) => {
    fn(node);
    ts.forEachChild(node, visit);
  };
  if (root) visit(root);
}

function sourceOf(text, node) {
  return node ? text.slice(node.getStart(), node.end) : "";
}

function callName(node) {
  if (!ts.isCallExpression(node)) return "";
  return ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
}

function memberPath(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${memberPath(node.expression)}.${node.name.text}`;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && (ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression))) {
    return `${memberPath(node.expression)}[${node.argumentExpression.text}]`;
  }
  return "";
}

function propertyAssignment(objectLiteral, propertyName) {
  if (!objectLiteral || !ts.isObjectLiteralExpression(objectLiteral)) return null;
  return objectLiteral.properties.find((property) =>
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
    ((ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) && property.name.text === propertyName)
  ) ?? null;
}

function propertyValue(objectLiteral, propertyName) {
  const property = propertyAssignment(objectLiteral, propertyName);
  return property && ts.isPropertyAssignment(property) ? property.initializer : null;
}

function literalText(node) {
  return ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ? node.text :
    node.kind === ts.SyntaxKind.TrueKeyword ? "true" : node.kind === ts.SyntaxKind.FalseKeyword ? "false" : null;
}

function hasPositiveFlag(condition, expectedPath) {
  if (ts.isParenthesizedExpression(condition)) return hasPositiveFlag(condition.expression, expectedPath);
  if (ts.isPrefixUnaryExpression(condition) && condition.operator === ts.SyntaxKind.ExclamationToken) return false;
  if (ts.isBinaryExpression(condition) && condition.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return hasPositiveFlag(condition.left, expectedPath) || hasPositiveFlag(condition.right, expectedPath);
  }
  return (ts.isIdentifier(condition) || ts.isPropertyAccessExpression(condition) || ts.isElementAccessExpression(condition)) && memberPath(condition) === expectedPath;
}

function findCalls(fnNode, desiredName) {
  const found = [];
  walk(fnNode, (node) => {
    if (ts.isCallExpression(node) && callName(node) === desiredName) found.push(node);
  });
  return found;
}

function awaited(call) {
  let parent = call.parent;
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
  return !!parent && ts.isAwaitExpression(parent);
}

function unwrapTypeAssertions(node) {
  while (node && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

function enclosingIfWithPositiveFlag(call, fnNode, flagPath) {
  let match = false;
  walk(fnNode, (node) => {
    if (!ts.isIfStatement(node) || !node.thenStatement) return;
    if (call.getStart() >= node.thenStatement.getStart() && call.end <= node.thenStatement.end && hasPositiveFlag(node.expression, flagPath)) match = true;
  });
  return match;
}

function inThenBranch(call, fnNode, conditionCheck) {
  let match = false;
  walk(fnNode, (node) => {
    if (ts.isIfStatement(node) && call.getStart() >= node.thenStatement.getStart() && call.end <= node.thenStatement.end && conditionCheck(node.expression)) match = true;
  });
  return match;
}

function objectArgForType(call, type) {
  for (const arg of call.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    const value = propertyValue(arg, "source_transaction_type");
    if (value && ts.isStringLiteralLike(value) && value.text === type) return arg;
  }
  return null;
}

function isQboOriginRead(fnNode) {
  let evidence = null;
  const qboField = (name) => name === "source_system" || /^qbo_[a-z0-9_]+$/i.test(name);
  const aliases = new Set();
  walk(fnNode, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (ts.isObjectBindingPattern(node.name)) {
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name;
        if ((ts.isIdentifier(key) || ts.isStringLiteralLike(key)) && qboField(key.text) && ts.isIdentifier(element.name)) aliases.add(element.name.text);
      }
    }
    if (ts.isIdentifier(node.name) && node.initializer) {
      let derivesFromQbo = false;
      walk(node.initializer, (initializerNode) => {
        if (ts.isPropertyAccessExpression(initializerNode) && qboField(initializerNode.name.text)) derivesFromQbo = true;
        if (ts.isElementAccessExpression(initializerNode) && initializerNode.argumentExpression && ts.isStringLiteralLike(initializerNode.argumentExpression) && qboField(initializerNode.argumentExpression.text)) derivesFromQbo = true;
        if (ts.isStringLiteralLike(initializerNode) && initializerNode.text.toLowerCase() === "qbo") derivesFromQbo = true;
      });
      if (derivesFromQbo) aliases.add(node.name.text);
    }
  });
  walk(fnNode, (node) => {
    if (evidence) return;
    if (ts.isIfStatement(node)) {
      let qboCondition = null;
      walk(node.expression, (conditionNode) => {
        if (qboCondition) return;
        if (ts.isPropertyAccessExpression(conditionNode) && qboField(conditionNode.name.text)) qboCondition = conditionNode.name.text;
        if (ts.isElementAccessExpression(conditionNode) && conditionNode.argumentExpression && ts.isStringLiteralLike(conditionNode.argumentExpression) && qboField(conditionNode.argumentExpression.text)) qboCondition = conditionNode.argumentExpression.text;
        if (ts.isIdentifier(conditionNode) && aliases.has(conditionNode.text)) qboCondition = conditionNode.text;
        if (ts.isCallExpression(conditionNode) && callName(conditionNode) === "isQboBill") qboCondition = "isQboBill()";
        if (ts.isStringLiteralLike(conditionNode) && /qbo/i.test(conditionNode.text)) qboCondition = conditionNode.text;
      });
      let exits = false;
      walk(node.thenStatement, (branchNode) => {
        if (ts.isReturnStatement(branchNode) || ts.isThrowStatement(branchNode)) exits = true;
      });
      if (qboCondition && exits) evidence = qboCondition;
    }
  });
  return evidence;
}

function hasNoncashPassInSettlement(text) {
  const { sourceFile } = getFunctions(text, FILES.settlement);
  let found = false;
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node) || callName(node) !== "payBill" || !node.arguments[0] || !ts.isObjectLiteralExpression(node.arguments[0])) return;
    const value = propertyValue(node.arguments[0], "settlementDeductionNoncash");
    if (value?.kind === ts.SyntaxKind.TrueKeyword) found = true;
  });
  return found;
}

function engineHasBillFirstControl(text) {
  const { functions } = getFunctions(text, FILES.engine);
  const fn = functions.get("buildBillPaymentLines");
  if (!fn) return false;
  const hasGetter = findCalls(fn, "getPostingBySource").some(awaited);
  let orderedRefusal = false;
  walk(fn, (node) => {
    if (!ts.isIfStatement(node)) return;
    const conditionText = node.expression.getText();
    if (!/billPosting\.result\s*!==\s*["']already_posted["']/.test(conditionText)) return;
    let hasError = false;
    walk(node.thenStatement, (child) => {
      if (!ts.isNewExpression(child) || !ts.isIdentifier(child.expression) || child.expression.text !== "PostingEngineError") return;
      const code = child.arguments?.[0];
      if (code && ts.isStringLiteralLike(code) && code.text === "BILL_AP_NOT_POSTED") hasError = true;
    });
    if (hasError) orderedRefusal = true;
  });
  return hasGetter && orderedRefusal;
}

function extractUnpostedCashSql(text) {
  const sourceFile = parse(text, FILES.liveVerifier);
  if (sourceFile.parseDiagnostics.length) return null;
  let sql = null;
  walk(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== "UNPOSTED_CASH_SQL") return;
    if (node.initializer && ts.isNoSubstitutionTemplateLiteral(node.initializer)) sql = node.initializer.text;
  });
  return sql;
}

function analyzeLiveSql(text) {
  const sql = extractUnpostedCashSql(text);
  if (!sql) return ["verify-no-bill-payment-without-postings.mjs must export parseable UNPOSTED_CASH_SQL"];
  const failures = [];
  if (/\b(?:source_system|qbo_bill_payment_id)\b/i.test(sql)) failures.push("UNPOSTED_CASH_SQL must not exempt QBO-origin bill payments");
  if (!/bp\.operating_company_id\s*=\s*\$1::uuid/i.test(sql)) failures.push("UNPOSTED_CASH_SQL must bind the selected operating company");
  if (!/bp\.operating_company_id\s*=\s*\$1::uuid\s+OR\s+bp\.operating_company_id\s+IS\s+NULL/i.test(sql)) failures.push("UNPOSTED_CASH_SQL must include NULL-company rows in the fail-closed audit");
  if (!/AND\s*\(\s*bp\.operating_company_id\s+IS\s+NULL\s+OR\s*\(/i.test(sql)) failures.push("UNPOSTED_CASH_SQL must fail closed for NULL-company payments");
  if (!/p\.operating_company_id\s*=\s*bp\.operating_company_id/i.test(sql)) failures.push("UNPOSTED_CASH_SQL posting existence check must match the payment company");
  return failures;
}

function analyzeCallWriter(text, filename, functionName, flagPath, expectedIdPath) {
  const failures = [];
  const { sourceFile, functions } = getFunctions(text, filename);
  if (sourceFile.parseDiagnostics.length) return [`${functionName} source has TypeScript parse errors`];
  const fn = functions.get(functionName);
  if (!fn) return [`missing ${functionName}`];
  const origin = isQboOriginRead(fn);
  if (origin) failures.push(`${functionName} contains QBO-origin provenance gate (${origin})`);
  const posterCalls = findCalls(fn, "postSourceTransactionInClientTx").filter((call) => objectArgForType(call, "bill_payment"));
  if (!posterCalls.length) failures.push(`${functionName} does not post bill_payment through postSourceTransactionInClientTx`);
  for (const call of posterCalls) {
    if (!awaited(call)) failures.push(`${functionName} bill_payment poster is not awaited`);
    const clientArg = unwrapTypeAssertions(call.arguments[0]);
    if (!clientArg || !ts.isIdentifier(clientArg) || clientArg.text !== "client") {
      failures.push(`${functionName} bill_payment poster must use the same client`);
    }
    if (!enclosingIfWithPositiveFlag(call, fn, flagPath)) failures.push(`${functionName} bill_payment poster lost positive ${flagPath} feature-flag gate`);
    if (expectedIdPath) {
      const object = objectArgForType(call, "bill_payment");
      const sourceId = propertyValue(object, "source_transaction_id");
      if (!sourceId || memberPath(sourceId) !== expectedIdPath) failures.push(`${functionName} bill_payment poster is not linked to its created payment id`);
    }
  }
  if (functionName === "payBillRowInClientTx") {
    for (const call of posterCalls) {
      const noncashGate = inThenBranch(call, fn, (condition) => /input\.settlementDeductionNoncash\s*!==\s*true/.test(condition.getText()));
      if (!noncashGate) failures.push("payBillRowInClientTx must keep non-cash settlement payments out of cash GL posting");
    }
  }
  return failures;
}

function analyze(sources) {
  const failures = [
    ...analyzeCallWriter(sources.bills, FILES.bills, "payBillRowInClientTx", "flags.glPostingEnabled", "paymentRes.rows[0].id"),
    ...analyzeCallWriter(sources.vendor, FILES.vendor, "applyVendorBillPaymentBatch", "glPostingEnabled", "paymentId"),
    ...analyzeCallWriter(sources.apApplication, FILES.apApplication, "registerApPaymentApplicationRoutes", "glPostingEnabled", "paymentId"),
  ];
  if (!engineHasBillFirstControl(sources.engine)) failures.push("shared buildBillPaymentLines bill-first A/P guard is missing");
  if (!hasNoncashPassInSettlement(sources.settlement)) failures.push("settlement deduction payBill call must pass settlementDeductionNoncash: true directly");
  failures.push(...analyzeLiveSql(sources.liveVerifier));
  return failures;
}

function insertAtFunctionBody(source, filename, functionName, code) {
  const { functions } = getFunctions(source, filename);
  const fn = functions.get(functionName);
  if (!fn?.body) return null;
  const position = fn.body.getStart() + 1;
  return source.slice(0, position) + code + source.slice(position);
}

function replaceFirst(source, from, to) {
  const index = source.indexOf(from);
  return index < 0 ? null : source.slice(0, index) + to + source.slice(index + from.length);
}

function mutateTargetPoster(source, filename, functionName, mutation) {
  const { functions } = getFunctions(source, filename);
  const fn = functions.get(functionName);
  const call = fn && findCalls(fn, "postSourceTransactionInClientTx").find((candidate) => objectArgForType(candidate, "bill_payment"));
  if (!call) return null;
  return mutation(source, call);
}

function mutateExecutorFlag(source, filename, functionName, flagPath) {
  const { functions } = getFunctions(source, filename);
  const fn = functions.get(functionName);
  let target = null;
  walk(fn, (node) => {
    if (target || !ts.isIfStatement(node) || !hasPositiveFlag(node.expression, flagPath)) return;
    const hasPoster = findCalls(node.thenStatement, "postSourceTransactionInClientTx").some((call) => !!objectArgForType(call, "bill_payment"));
    if (hasPoster) target = node.expression;
  });
  return target ? source.slice(0, target.getStart()) + `!(${target.getText()})` + source.slice(target.end) : null;
}

function mutateExecutorFlagBypass(source, filename, functionName, flagPath) {
  const { functions } = getFunctions(source, filename);
  const fn = functions.get(functionName);
  let target = null;
  walk(fn, (node) => {
    if (target || !ts.isIfStatement(node) || !hasPositiveFlag(node.expression, flagPath)) return;
    if (findCalls(node.thenStatement, "postSourceTransactionInClientTx").some((call) => !!objectArgForType(call, "bill_payment"))) target = node.expression;
  });
  return target ? source.slice(0, target.getStart()) + `(${flagPath} || true)` + source.slice(target.end) : null;
}

function runSelftest(sources) {
  const cases = [];
  const check = (label, altered, expected) => cases.push([label, !!altered && analyze(altered).some((failure) => failure.includes(expected))]);
  cases.push(["real source baseline accepted", analyze(sources).length === 0]);
  for (const [key, sourceKey, filename, functionName] of [
    ["payBillRowInClientTx", "bills", FILES.bills, "payBillRowInClientTx"],
    ["applyVendorBillPaymentBatch", "vendor", FILES.vendor, "applyVendorBillPaymentBatch"],
    ["registerApPaymentApplicationRoutes", "apApplication", FILES.apApplication, "registerApPaymentApplicationRoutes"],
  ]) {
    const originInjected = (code) => {
      const mutated = insertAtFunctionBody(sources[sourceKey], filename, functionName, code);
      return { ...sources, [sourceKey]: mutated };
    };
    check(`${key} property QBO skip mutation rejected`, originInjected('if (bill.source_system === "qbo") return;'), functionName);
    check(`${key} bracket QBO skip mutation rejected`, originInjected('if (bill["qbo_origin"]) return;'), functionName);
    check(`${key} destructured QBO skip mutation rejected`, originInjected('const { source_system: origin } = bill; if (origin === "qbo") return;'), functionName);
    check(`${key} inverted QBO condition skip mutation rejected`, originInjected('if (bill.source_system !== "qbo") return;'), functionName);
    check(`${key} QBO throw mutation rejected`, originInjected('if (bill["qbo_payment_id"]) throw new Error("qbo");'), functionName);
    const fakeTokens = insertAtFunctionBody(sources[sourceKey], filename, functionName,
      '// if (bill.source_system === "qbo") return;\nconst marker = "bill.qbo_origin skip";\n');
    cases.push([`${key} comments and strings are not origin gates`, !!fakeTokens && analyze({ ...sources, [sourceKey]: fakeTokens }).length === 0]);
    const nonAwaited = mutateTargetPoster(sources[sourceKey], filename, functionName, (source, call) => {
      let parent = call.parent;
      while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
      return parent && ts.isAwaitExpression(parent)
        ? source.slice(0, parent.getStart()) + source.slice(parent.expression.getStart())
        : null;
    });
    check(`${key} non-awaited poster mutation rejected`, nonAwaited ? { ...sources, [sourceKey]: nonAwaited } : null, functionName);
    check(`${key} wrong-client poster mutation rejected`, (() => {
      const changed = mutateTargetPoster(sources[sourceKey], filename, functionName, (source, call) => {
        const clientArg = call.arguments[0];
        return clientArg ? source.slice(0, clientArg.getStart()) + "otherClient" + source.slice(clientArg.end) : null;
      });
      return changed ? { ...sources, [sourceKey]: changed } : null;
    })(), functionName);
    const flag = key === "payBillRowInClientTx" ? "flags.glPostingEnabled" : "glPostingEnabled";
    const invertedFlag = mutateExecutorFlag(sources[sourceKey], filename, functionName, flag);
    check(`${key} inverted feature flag mutation rejected`, invertedFlag ? { ...sources, [sourceKey]: invertedFlag } : null, functionName);
    const bypassFlag = mutateExecutorFlagBypass(sources[sourceKey], filename, functionName, flag);
    check(`${key} OR-bypassed feature flag mutation rejected`, bypassFlag ? { ...sources, [sourceKey]: bypassFlag } : null, functionName);
  }

  const engine = getFunctions(sources.engine, FILES.engine);
  const billPayment = engine.functions.get("buildBillPaymentLines");
  let billFirstIf = null;
  walk(billPayment, (node) => {
    if (billFirstIf || !ts.isIfStatement(node) || !/billPosting\.result\s*!==\s*["']already_posted["']/.test(node.expression.getText())) return;
    billFirstIf = node;
  });
  if (billFirstIf) {
    const alteredEngine = sources.engine.slice(0, billFirstIf.getStart()) + sources.engine.slice(billFirstIf.end);
    check("shared bill-first A/P guard removal rejected", { ...sources, engine: alteredEngine }, "bill-first A/P guard");
  } else cases.push(["found bill-first guard for mutation", false]);

  const settlementSource = sources.settlement;
  const settlementAst = parse(settlementSource, FILES.settlement);
  let noncashValue = null;
  walk(settlementAst, (node) => {
    if (!ts.isCallExpression(node) || callName(node) !== "payBill" || !ts.isObjectLiteralExpression(node.arguments[0])) return;
    const value = propertyValue(node.arguments[0], "settlementDeductionNoncash");
    if (value?.kind === ts.SyntaxKind.TrueKeyword) noncashValue = value;
  });
  if (noncashValue) {
    const falseValue = settlementSource.slice(0, noncashValue.getStart()) + "false" + settlementSource.slice(noncashValue.end);
    check("settlement noncash true-to-false mutation rejected", { ...sources, settlement: falseValue }, "settlementDeductionNoncash: true");
    const without = settlementSource.slice(0, noncashValue.parent.getStart()) + settlementSource.slice(noncashValue.parent.end);
    check("settlement noncash property removal rejected", { ...sources, settlement: without }, "settlementDeductionNoncash: true");
  } else cases.push(["found noncash property for mutation", false]);

  const liveSql = sources.liveVerifier;
  const sqlMutations = [
    ["live SQL restored QBO exemption rejected", "AND (bp.operating_company_id IS NULL OR (", "AND (bp.operating_company_id IS NULL OR (bp.source_system IS DISTINCT FROM 'qbo' OR bp.qbo_bill_payment_id IS NULL) AND ("],
    ["live SQL missing company scope rejected", "bp.operating_company_id = $1::uuid", "bp.operating_company_id = $2::uuid"],
    ["live SQL missing NULL-company fail path rejected", "AND (bp.operating_company_id IS NULL OR (", "AND ("],
    ["live SQL wrong-company posting join rejected", "p.operating_company_id = bp.operating_company_id", "p.operating_company_id = $1::uuid"],
  ];
  for (const [label, before, after] of sqlMutations) {
    const changed = replaceFirst(liveSql, before, after);
    cases.push([label, !!changed && analyze({ ...sources, liveVerifier: changed }).some((failure) => failure.startsWith("UNPOSTED_CASH_SQL"))]);
  }

  return cases;
}

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, relative]) => [key, fs.readFileSync(path.join(ROOT, relative), "utf8")]));
}

const sources = readSources();
if (process.argv.includes("--selftest")) {
  const cases = runSelftest(sources);
  const failed = cases.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-qbo-origin-bill-payment-writers-post-native-gl --selftest: FAIL");
    for (const [name] of failed) console.error(`- ${name}`);
    process.exit(1);
  }
  console.log(`verify-qbo-origin-bill-payment-writers-post-native-gl --selftest: PASS (${cases.length} baseline/mutation checks)`);
  process.exit(0);
}
const failures = analyze(sources);
if (failures.length) {
  console.error("verify-qbo-origin-bill-payment-writers-post-native-gl: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-qbo-origin-bill-payment-writers-post-native-gl: PASS (native GL posting, feature gates, shared bill-first control, and noncash settlement input)");
