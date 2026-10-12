/**
 * Native-document GL contract for R443.117 9a.
 * QBO metadata may describe provenance, but it does not make the native
 * document ineligible for the TMS book. Keep each builder's real accounting
 * eligibility and sequencing controls while rejecting origin-based GL blocks.
 */
export const NATIVE_DOCUMENT_BUILDERS = {
  invoice: {
    name: "buildInvoiceLines",
    calls: ["revrecLatchOwnsLoad", "loadReachedDeliveryEvidence"],
    guards: [{ fields: ["invoice.status"], call: "INVOICE_ELIGIBLE_STATUSES.has", callNegated: true, code: "INVOICE_NOT_POSTING_ELIGIBLE" }],
  },
  bill: {
    name: "buildBillLines",
    guards: [
      { fields: ["bill.revoked_at", "bill.status"], truthy: ["bill.revoked_at"], comparisons: [{ field: "bill.status", operator: "===", value: "void" }, { field: "bill.status", operator: "===", value: "voided" }], code: "BILL_NOT_POSTING_ELIGIBLE" },
      { fields: ["bill.status"], comparisons: [{ field: "bill.status", operator: "===", value: "draft" }], code: "BILL_NOT_POSTING_ELIGIBLE" },
    ],
  },
  expense: {
    name: "buildExpenseLines",
    guards: [{ fields: ["exp.status", "exp.posting_status"], comparisons: [{ field: "exp.status", operator: "===", value: "void" }, { field: "exp.posting_status", operator: "===", value: "reversed" }], code: "EXPENSE_NOT_POSTING_ELIGIBLE" }],
  },
  customer_payment: {
    name: "buildCustomerPaymentLines",
    guards: [{ fields: ["payment.voided_at"], truthy: ["payment.voided_at"], code: "PAYMENT_NOT_POSTING_ELIGIBLE" }],
  },
  customer_payment_deposit: {
    name: "buildCustomerPaymentDepositSweepLines",
    guards: [
      { fields: ["payment.voided_at"], truthy: ["payment.voided_at"], code: "PAYMENT_NOT_POSTING_ELIGIBLE" },
      { fields: ["alreadyDeposited.rows[0]"], truthy: ["alreadyDeposited.rows[0]"], code: "DEPOSIT_ALREADY_AT_BANK" },
      { fields: ["payment.source_bank_transaction_id"], absent: ["payment.source_bank_transaction_id"], code: "PAYMENT_NOT_POSTING_ELIGIBLE" },
    ],
  },
  factoring_advance_deposit: {
    name: "buildFactoringAdvanceDepositSweepLines",
    guards: [
      { fields: ["advance.voided_at"], truthy: ["advance.voided_at"], code: "PAYMENT_NOT_POSTING_ELIGIBLE" },
      { fields: ["alreadyDeposited.rows[0]"], truthy: ["alreadyDeposited.rows[0]"], code: "DEPOSIT_ALREADY_AT_BANK" },
      { fields: ["bankLedgerAccountId"], absent: ["bankLedgerAccountId"], code: "PAYMENT_NOT_POSTING_ELIGIBLE" },
    ],
  },
  bill_payment: {
    name: "buildBillPaymentLines",
    calls: ["getPostingBySource"],
    guards: [
      { fields: ["payment.revoked_at", "payment.status"], truthy: ["payment.revoked_at"], comparisons: [{ field: "payment.status", operator: "===", value: "void" }], code: "PAYMENT_NOT_POSTING_ELIGIBLE" },
      { fields: ["payment.settlement_deduction_noncash"], comparisons: [{ field: "payment.settlement_deduction_noncash", operator: "===", value: "true" }], code: "PAYMENT_NOT_POSTING_ELIGIBLE" },
      { fields: ["payment.bill_id"], absent: ["payment.bill_id"], code: "BILL_AP_NOT_POSTED" },
      { fields: ["billPosting", "billPosting.result"], absent: ["billPosting"], comparisons: [{ field: "billPosting.result", operator: "!==", value: "already_posted" }], code: "BILL_AP_NOT_POSTED" },
    ],
  },
  credit_memo: {
    name: "buildCreditMemoLines",
    guards: [
      { fields: ["memo.voided_at", "memo.status"], truthy: ["memo.voided_at"], comparisons: [{ field: "memo.status", operator: "===", value: "voided" }], code: "PAYMENT_NOT_POSTING_ELIGIBLE" },
      { fields: ["memo.account_id"], absent: ["memo.account_id"], code: "CREDIT_MEMO_NO_ACCOUNT" },
      { fields: ["amount"], comparisons: [{ field: "amount", operator: "<=", value: "0" }], code: "UNBALANCED_ENTRY" },
    ],
  },
};

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

function parse(source) {
  return ts.createSourceFile("posting-engine.service.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function collectFunctions(sourceFile) {
  const functions = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return functions;
}

function sourceOf(source, node) {
  return node ? source.slice(node.getStart(), node.end) : null;
}

export function extractBuilder(source, functionName) {
  const sourceFile = parse(source);
  return sourceOf(source, collectFunctions(sourceFile).get(functionName));
}

function accessPath(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${accessPath(node.expression)}.${node.name.text}`;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringOrNumericLiteralLike(node.argumentExpression)) {
    return `${accessPath(node.expression)}[${node.argumentExpression.text}]`;
  }
  return "";
}

function hasAccessPath(root, expected) {
  let found = false;
  const visit = (node) => {
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && accessPath(node) === expected) found = true;
    if (ts.isIdentifier(node) && node.text === expected) found = true;
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function callNames(root) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) names.add(node.expression.text);
      else if (ts.isPropertyAccessExpression(node.expression)) names.add(node.expression.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

function containsThrowCode(root, code) {
  let found = false;
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) && node.text === code) found = true;
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function literalValue(node) {
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (node.kind === ts.SyntaxKind.FalseKeyword) return "false";
  return null;
}

function hasComparisons(condition, comparisons = []) {
  const observed = new Set();
  const visit = (node) => {
    if (ts.isBinaryExpression(node)) {
      for (const [literal, expression] of [[node.left, node.right], [node.right, node.left]]) {
        const value = literalValue(literal);
        if (value !== null) observed.add(`${accessPath(expression)}|${node.operatorToken.getText()}|${value}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(condition);
  return comparisons.every(({ field, operator, value }) => observed.has(`${field}|${operator}|${value}`));
}

function hasTruthiness(condition, expected, negated) {
  let found = false;
  const visit = (node, underNot = false) => {
    if (ts.isParenthesizedExpression(node)) {
      visit(node.expression, underNot);
      return;
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      visit(node.operand, !underNot);
      return;
    }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) {
      visit(node.left, underNot);
      visit(node.right, underNot);
      return;
    }
    const isPath = (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && accessPath(node) === expected;
    if (isPath && underNot === negated) found = true;
  };
  visit(condition);
  return found;
}

function callHasNegation(root, expected, negated) {
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && accessPath(node.expression) === expected) {
      let parent = node.parent;
      while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
      const isNegated = !!parent && ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken;
      if (isNegated === negated) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function throwingIfGuards(fnNode, guard) {
  const matches = [];
  const visit = (node) => {
    if (ts.isIfStatement(node)) {
      const fieldsMatch = guard.fields.every((field) => hasAccessPath(node.expression, field));
      const callMatch = !guard.call || callHasNegation(node.expression, guard.call, !!guard.callNegated);
      const truthyMatch = (guard.truthy ?? []).every((field) => hasTruthiness(node.expression, field, false));
      const absentMatch = (guard.absent ?? []).every((field) => hasTruthiness(node.expression, field, true));
      const comparisonsMatch = hasComparisons(node.expression, guard.comparisons);
      if (fieldsMatch && callMatch && truthyMatch && absentMatch && comparisonsMatch && containsThrowCode(node.thenStatement, guard.code)) matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(fnNode);
  return matches;
}

function invertGuardMutation(source, spec, guard) {
  const fn = collectFunctions(parse(source)).get(spec.name);
  const guardedIf = throwingIfGuards(fn, guard)[0];
  if (!guardedIf) return null;
  const condition = guardedIf.expression;
  if (guard.truthy?.length || guard.absent?.length) {
    return source.slice(0, condition.getStart()) + `!(${condition.getText()})` + source.slice(condition.end);
  }
  if (guard.call) {
    const replacement = ts.isPrefixUnaryExpression(condition) && condition.operator === ts.SyntaxKind.ExclamationToken
      ? condition.operand.getText()
      : `!(${condition.getText()})`;
    return source.slice(0, condition.getStart()) + replacement + source.slice(condition.end);
  }
  let target = null;
  const find = (node) => {
    if (target || !ts.isBinaryExpression(node)) return;
    for (const comparison of guard.comparisons ?? []) {
      const sidesMatch =
        (accessPath(node.left) === comparison.field && literalValue(node.right) === comparison.value) ||
        (accessPath(node.right) === comparison.field && literalValue(node.left) === comparison.value);
      if (sidesMatch && node.operatorToken.getText() === comparison.operator) {
        target = { start: node.operatorToken.getStart(), end: node.operatorToken.end, operator: comparison.operator };
        return;
      }
    }
    ts.forEachChild(node, find);
  };
  find(condition);
  if (!target) return null;
  const opposite = { "===": "!==", "==": "!=", "!==": "===", "!=": "==", "<": ">=", "<=": ">", ">": "<=", ">=": "<" }[target.operator];
  return source.slice(0, target.start) + opposite + source.slice(target.end);
}

function containsOriginMetadata(fnNode) {
  const fields = new Set(["source_system", "qbo_purchase_id", "qbo_payment_id"]);
  const accesses = [];
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && fields.has(node.name.text)) accesses.push(node.name.text);
    if (ts.isElementAccessExpression(node) && node.argumentExpression && fields.has(node.argumentExpression.text)) accesses.push(node.argumentExpression.text);
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      const key = node.propertyName ?? node.name;
      if (ts.isIdentifier(key) && fields.has(key.text)) accesses.push(key.text);
      if (ts.isStringLiteralLike(key) && fields.has(key.text)) accesses.push(key.text);
    }
    if (ts.isStringLiteralLike(node) && /QBO_[A-Z0-9_]*(?:REFUSED|POST_GL)/i.test(node.text)) accesses.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(fnNode);
  return [...new Set(accesses)];
}

export function analyzeNativeDocumentGl(source, { synthetic = false } = {}) {
  const failures = [];
  const sourceFile = parse(source);
  if (sourceFile.parseDiagnostics.length) {
    failures.push(`posting-engine.service.ts has TypeScript parse errors (${sourceFile.parseDiagnostics.length})`);
    return failures;
  }
  const functions = collectFunctions(sourceFile);
  const printer = ts.createPrinter({ removeComments: true });
  for (const [sourceType, spec] of Object.entries(NATIVE_DOCUMENT_BUILDERS)) {
    const fnNode = functions.get(spec.name);
    const builder = fnNode ? printer.printNode(ts.EmitHint.Unspecified, fnNode, sourceFile).replaceAll('\\"', '"') : null;
    if (!builder) {
      failures.push(`${sourceType}: missing ${spec.name}`);
      continue;
    }
    const executableOriginReads = containsOriginMetadata(fnNode);
    if (executableOriginReads.length) failures.push(`${sourceType}: ${spec.name} contains executable QBO-origin gating/refusal (${[...new Set(executableOriginReads)].join(", ")})`);
    for (const call of spec.calls ?? []) {
      if (!callNames(fnNode).has(call)) failures.push(`${sourceType}: ${spec.name} lost required call ${call}`);
    }
    for (const guard of spec.guards ?? []) {
      if (!throwingIfGuards(fnNode, guard).length) failures.push(`${sourceType}: ${spec.name} lost throwing eligibility check for ${guard.fields.join(" / ")} (${guard.code})`);
    }
  }
  if (!synthetic && !/sourceType\s*===\s*["']bill["'][\s\S]*?buildBillLines/.test(source)) {
    failures.push("posting dispatcher no longer routes bill documents to buildBillLines");
  }
  if (!synthetic) {
    const executor = sourceOf(source, functions.get("executePostingOnClient"));
    const executorCalls = executor ? callNames(functions.get("executePostingOnClient")) : new Set();
    for (const required of ["ensureOpenPeriod", "assertBalanced", "getExistingPostingResultByIdempotencyKey"]) {
      if (!executorCalls.has(required)) failures.push(`executePostingOnClient lost posting integrity control ${required}`);
    }
    if (!executor?.includes("idempotency_key") || !executor?.includes("idempotencyKey")) {
      failures.push("executePostingOnClient lost posting integrity control idempotency_key/idempotencyKey");
    }
  }
  return failures;
}

export function runNativeDocumentGlSelftest(realSource = null) {
  const base = createNativeDocumentFixture();
  const results = [];
  results.push(["baseline accepted", analyzeNativeDocumentGl(base, { synthetic: true }).length === 0]);
  for (const [key, spec] of Object.entries(NATIVE_DOCUMENT_BUILDERS)) {
    const mutation = base.replace(
      `async function ${spec.name}(client) {`,
      `async function ${spec.name}(client) { if ((source.source_system ?? "").toLowerCase() === "qbo") throw new PostingEngineError("QBO_${key.toUpperCase()}_POST_GL_REFUSED");`
    );
    results.push([`${key} origin-refusal mutation rejected`, analyzeNativeDocumentGl(mutation, { synthetic: true }).some((f) => f.startsWith(`${key}:`))]);
    if (realSource) {
      const realStart = realSource.indexOf(`async function ${spec.name}(`);
      const realFn = extractBuilder(realSource, spec.name);
      const bodyOpen = realFn?.indexOf("{") ?? -1;
      const field = ({ expense: "qbo_purchase_id", customer_payment: "qbo_payment_id", customer_payment_deposit: "qbo_payment_id" })[key] ?? "source_system";
      for (const [label, injected] of [
        ["throw", `if ((doc.${field} ?? "").toString().toLowerCase() === "qbo") throw new PostingEngineError("QBO_${key.toUpperCase()}_POST_GL_REFUSED");`],
        ["early-return", `if ((doc.${field} ?? "").toString().toLowerCase() === "qbo") return {} as PostingDraft;`],
        ["bracket-throw", `if (doc["${field}"]) throw new PostingEngineError("PAYMENT_NOT_POSTING_ELIGIBLE", "QBO");`],
        ["destructure-throw", `const { ${field} } = doc; if (${field}) throw new PostingEngineError("PAYMENT_NOT_POSTING_ELIGIBLE", "QBO");`],
      ]) {
        if (realStart >= 0 && bodyOpen >= 0) {
          const alteredFn = realFn.slice(0, bodyOpen + 1) + injected + realFn.slice(bodyOpen + 1);
          const altered = realSource.slice(0, realStart) + alteredFn + realSource.slice(realStart + realFn.length);
          results.push([`${key} real-source ${label} refusal mutation rejected`, analyzeNativeDocumentGl(altered).some((f) => f.startsWith(`${key}:`))]);
        }
      }
    }
    if (realSource) {
      const fn = collectFunctions(parse(realSource)).get(spec.name);
      for (const guard of spec.guards ?? []) {
        const guardedIf = throwingIfGuards(fn, guard)[0];
        if (guardedIf) {
          const guardStart = guardedIf.getStart();
          const guardEnd = guardedIf.end;
          const bait = `const __fake_guard = ${JSON.stringify(`${guard.fields.join(" ")} ${guard.code}`)};`;
          const altered = realSource.slice(0, guardStart) + bait + realSource.slice(guardEnd);
          results.push([`${key} fake-token-only guard mutation rejected`, analyzeNativeDocumentGl(altered).some((f) => f.startsWith(`${key}:`) && f.includes(guard.code))]);
        }
        const inverted = invertGuardMutation(realSource, spec, guard);
        if (inverted) {
          results.push([`${key} real-source inverted eligibility condition rejected`, analyzeNativeDocumentGl(inverted).some((f) => f.startsWith(`${key}:`) && f.includes(guard.code))]);
        }
      }
    }
  }
  if (realSource) {
    const executorName = "executePostingOnClient";
    const executorStart = realSource.indexOf(`async function ${executorName}(`);
    const executor = extractBuilder(realSource, executorName);
    for (const protection of ["ensureOpenPeriod", "assertBalanced", "getExistingPostingResultByIdempotencyKey", "idempotency_key"]) {
      const mutatedExecutor = executor?.split(protection).join("__removed_executor_control__");
      if (executorStart >= 0 && mutatedExecutor) {
        const altered = realSource.slice(0, executorStart) + mutatedExecutor + realSource.slice(executorStart + executor.length);
        results.push([`executor real-source ${protection} removal rejected`, analyzeNativeDocumentGl(altered).some((f) => f.includes(`integrity control ${protection}`))]);
      }
    }
  }
  if (realSource) results.push(["real source satisfies contract", analyzeNativeDocumentGl(realSource).length === 0]);
  return results;
}

export function createNativeDocumentFixture() {
  const builders = Object.entries(NATIVE_DOCUMENT_BUILDERS).map(([, spec]) => {
    const calls = (spec.calls ?? []).map((name) => `${name}();`).join(" ");
    const conditions = (spec.guards ?? []).map((guard) => {
      if (guard.call) return `if (!INVOICE_ELIGIBLE_STATUSES.has(invoice.status)) throw new PostingEngineError("${guard.code}", "blocked");`;
      const terms = [
        ...(guard.truthy ?? []),
        ...(guard.absent ?? []).map((field) => `!${field}`),
        ...(guard.comparisons ?? []).map(({ field, operator, value }) => `${field} ${operator} ${JSON.stringify(value)}`),
      ];
      return `if (${terms.join(" || ")}) throw new PostingEngineError("${guard.code}", "blocked");`;
    }).join(" ");
    return `async function ${spec.name}(client) { ${calls} ${conditions} return {}; }`;
  }).join("\n");
  return `${builders}\nasync function executePostingOnClient() { getExistingPostingResultByIdempotencyKey(idempotencyKey); ensureOpenPeriod(); assertBalanced(); query("idempotency_key"); }\nfunction dispatch(sourceType) { if (sourceType === "bill") return buildBillLines(); }`;
}
