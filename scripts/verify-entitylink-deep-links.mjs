#!/usr/bin/env node
/**
 * Fail-closed EntityLink producer → resolver → consumer guard.
 *
 * Assertions inspect executable TypeScript/JSX nodes. Comments and inert string constants cannot
 * satisfy the contract. --selftest plants both decoys and a wrong EntityLink binding.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entitylink-deep-links";

const FILES = {
  invoice: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
  payment: "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
  audit: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx",
  faults: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
  expensesList: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
  woDetail: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

function parse(rel, source) {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  if (sf.parseDiagnostics.length > 0) {
    throw new Error(
      `${rel}: TypeScript parse failed: ${sf.parseDiagnostics
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
        .join("; ")}`,
    );
  }
  return sf;
}

function walk(sf, predicate) {
  let matched = false;
  function visit(node) {
    if (predicate(node, sf)) matched = true;
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return matched;
}

function findFunction(sf, name) {
  let result = null;
  walk(sf, (node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
      node.name?.getText(sf) === name
    ) {
      result = node;
    }
    return false;
  });
  return result;
}

function isConstFalse(node) {
  return node.kind === ts.SyntaxKind.FalseKeyword;
}

function isExecutedCallback(node) {
  const parent = node.parent;
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name.getText() === "render") return true;
  if (!ts.isCallExpression(parent)) return false;
  if (parent.expression === node) return true;
  if (!parent.arguments.includes(node)) return false;
  const callee = parent.expression;
  if (ts.isIdentifier(callee)) return new Set(["useMemo", "useState"]).has(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    new Set(["map", "flatMap", "forEach", "filter", "find", "some", "reduce", "then"]).has(callee.name.text)
  );
}

// Walk only code reached when `root` executes. Named/local helper bodies are not executable
// merely because they occur textually inside a component. Only callbacks with known invocation
// semantics are traversed, and constant-false branches are excluded.
function walkExecutable(root, predicate, sf) {
  let matched = false;
  function visit(node) {
    if (node !== root && ts.isFunctionLike(node) && !isExecutedCallback(node)) return;
    if (predicate(node, sf)) matched = true;
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
  return matched;
}

function jsxName(node) {
  return node.tagName.getText();
}

function jsxAttribute(node, name, sf) {
  const attr = node.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
  if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    return attr.initializer.expression.getText(sf);
  }
  return null;
}

function hasEntityLink(sf, root, kind, idExpression) {
  return walkExecutable(root, (node, sourceFile) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return false;
    return (
      jsxName(node) === "EntityLink" &&
      jsxAttribute(node, "kind", sourceFile) === kind &&
      jsxAttribute(node, "id", sourceFile) === idExpression
    );
  }, sf);
}

function hasCall(sf, root, callee, argument) {
  return walkExecutable(root, (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText(sf) !== callee) return false;
    return argument === undefined || node.arguments.some((arg) => {
      return ts.isStringLiteralLike(arg) && arg.text === argument;
    });
  }, sf);
}

function executableArguments(sf, root, callee) {
  const args = [];
  walkExecutable(root, (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === callee && node.arguments[0]) {
      args.push(node.arguments[0]);
    }
    return false;
  }, sf);
  return args;
}

function routeUsesComponent(sf, routePath, componentName) {
  let routesRoot = null;
  walk(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "ROUTES" &&
      node.initializer
    ) {
      routesRoot = node.initializer;
    }
    return false;
  });
  if (!routesRoot) return false;
  return walkExecutable(routesRoot, (node, sourceFile) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return false;
    if (jsxName(node) !== "Route" || jsxAttribute(node, "path", sourceFile) !== routePath) return false;
    const element = node.attributes.properties.find(
      (property) => ts.isJsxAttribute(property) && property.name.text === "element",
    );
    if (!element || !ts.isJsxAttribute(element) || !ts.isJsxExpression(element.initializer)) return false;
    return walk(element.initializer, (child) => (
      (ts.isJsxSelfClosingElement(child) || ts.isJsxOpeningElement(child)) &&
      jsxName(child) === componentName
    ));
  }, sf);
}

function hasResolverCase(sf, kind, expectedReturn) {
  const resolver = findFunction(sf, "resolveEntityRoute");
  if (!resolver) return false;
  return walkExecutable(resolver, (node) => {
    if (!ts.isCaseClause(node) || !ts.isStringLiteralLike(node.expression) || node.expression.text !== kind) {
      return false;
    }
    return node.statements.some(
      (statement) =>
        ts.isReturnStatement(statement) &&
        statement.expression?.getText(sf) === expectedReturn,
    );
  }, sf);
}

function isAuditNavigation(node, sf, sourceType, idExpression) {
  if (!ts.isCallExpression(node) || node.expression.getText(sf) !== "navigate" || node.arguments.length !== 1) {
    return false;
  }
  const route = node.arguments[0];
  if (!ts.isTemplateExpression(route) || route.templateSpans.length !== 1) return false;
  return (
    route.head.text === `/accounting/audit-trail?source_type=${sourceType}&source_id=` &&
    route.templateSpans[0].expression.getText(sf) === `encodeURIComponent(${idExpression})` &&
    route.templateSpans[0].literal.text === ""
  );
}

function hasForbiddenExpenseRoute(sf, root) {
  return walkExecutable(root, (node) => {
    if (!ts.isStringLiteralLike(node) && !ts.isTemplateExpression(node)) return false;
    const text = node.getText(sf);
    return /\/accounting\/expenses\?expense_id=/.test(text);
  }, sf);
}

export function assertContracts(sources) {
  const failures = [];
  const parsed = {};
  for (const [key, rel] of Object.entries(FILES)) {
    if (typeof sources[key] !== "string") {
      failures.push(`MISSING ${rel}`);
      continue;
    }
    try {
      parsed[key] = parse(rel, sources[key]);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (parsed.invoice) {
    const component = findFunction(parsed.invoice, "InvoiceDetailPage");
    if (!component) {
      failures.push("InvoiceDetailPage: exported component function is missing");
    } else if (!hasEntityLink(parsed.invoice, component, "customer", "invoice.customer_id")) {
      failures.push("InvoiceDetailPage: customer header must execute EntityLink customer/invoice.customer_id");
    }
    const nav = component ? executableArguments(parsed.invoice, component, "navigate") : [];
    if (!nav.some((arg) => isAuditNavigation(arg.parent, parsed.invoice, "invoice", "invoice.id"))) {
      failures.push("InvoiceDetailPage: View audit log must execute the invoice audit-trail deep-link");
    }
    if (nav.some((arg) => arg.getText(parsed.invoice).includes("/reports?invoice_id="))) {
      failures.push("InvoiceDetailPage: must not execute dead /reports?invoice_id= navigation");
    }
  }

  if (parsed.payment) {
    const component = findFunction(parsed.payment, "PaymentDetailPage");
    if (!component) failures.push("PaymentDetailPage: exported component function is missing");
    const nav = component ? executableArguments(parsed.payment, component, "navigate") : [];
    if (!nav.some((arg) => isAuditNavigation(arg.parent, parsed.payment, "customer_payment", "payment.id"))) {
      failures.push("PaymentDetailPage: View audit log must execute the customer-payment audit deep-link");
    }
    if (nav.some((arg) => arg.getText(parsed.payment).includes("/reports?payment_id="))) {
      failures.push("PaymentDetailPage: must not execute dead /reports?payment_id= navigation");
    }
  }

  if (parsed.audit) {
    const component = findFunction(parsed.audit, "AccountingAuditTrailPage");
    if (!component) failures.push("AccountingAuditTrailPage: exported component function is missing");
    if (!component || !hasCall(parsed.audit, component, "useSearchParams")) {
      failures.push("AccountingAuditTrailPage: must execute useSearchParams()");
    }
    for (const parameter of ["source_type", "source_id"]) {
      if (!component || !hasCall(parsed.audit, component, "searchParams.get", parameter)) {
        failures.push(`AccountingAuditTrailPage: must consume ?${parameter}=`);
      }
    }
  }

  if (parsed.faults) {
    const component = findFunction(parsed.faults, "FaultDraftsPage");
    if (
      !component ||
      !hasCall(parsed.faults, component, "useSearchParams") ||
      !hasCall(parsed.faults, component, "searchParams.get", "unit_id")
    ) {
      failures.push("FaultDraftsPage: must execute useSearchParams() and consume ?unit_id=");
    }
  }

  if (parsed.entityLink && !hasResolverCase(
    parsed.entityLink,
    "expense",
    "`/accounting/expenses/list?expense_id=${id}`",
  )) {
    failures.push("EntityLink: expense resolver must execute the registered list deep-link");
  }

  if (parsed.expensesList) {
    const component = findFunction(parsed.expensesList, "ExpensesListPage");
    if (
      !component ||
      !hasCall(parsed.expensesList, component, "useSearchParams") ||
      !hasCall(parsed.expensesList, component, "searchParams.get", "expense_id")
    ) {
      failures.push("ExpensesListPage: must execute useSearchParams() and consume ?expense_id=");
    }
    if (!component || !hasEntityLink(parsed.expensesList, component, "expense", "r.id")) {
      failures.push("ExpensesListPage: expense number must execute EntityLink expense/r.id");
    }
    if (component && hasForbiddenExpenseRoute(parsed.expensesList, component)) {
      failures.push("ExpensesListPage: must not execute obsolete /accounting/expenses?expense_id= deep-link");
    }
  }

  if (parsed.woDetail) {
    const component = findFunction(parsed.woDetail, "WorkOrderDetailPage");
    if (!component || !hasEntityLink(parsed.woDetail, component, "expense", "expense.id")) {
      failures.push("WorkOrderDetailPage: expense producer must execute EntityLink expense/expense.id");
    }
    if (component && hasForbiddenExpenseRoute(parsed.woDetail, component)) {
      failures.push("WorkOrderDetailPage: must not execute obsolete /accounting/expenses?expense_id= deep-link");
    }
  }

  if (parsed.manifest) {
    for (const [routePath, component] of [
      ["/accounting/invoices/:id", "InvoiceDetailPage"],
      ["/accounting/payments/:id", "PaymentDetailPage"],
      ["/accounting/audit-trail", "AccountingAuditTrailPage"],
      ["/accounting/expenses/list", "ExpensesListPage"],
    ]) {
      if (!routeUsesComponent(parsed.manifest, routePath, component)) {
        failures.push(`manifest: ${routePath} must render ${component}`);
      }
    }
  }

  return failures;
}

function readSources() {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, rel]) => {
      const absolute = path.join(ROOT, rel);
      return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null];
    }),
  );
}

function runSelftest() {
  const good = {
    invoice: `function InvoiceDetailPage(){ return <><EntityLink kind="customer" id={invoice.customer_id}/><button onClick={() => navigate(\`/accounting/audit-trail?source_type=invoice&source_id=\${encodeURIComponent(invoice.id)}\`)}/></>; }`,
    payment: `function PaymentDetailPage(){ return <button onClick={() => navigate(\`/accounting/audit-trail?source_type=customer_payment&source_id=\${encodeURIComponent(payment.id)}\`)}/>; }`,
    audit: `function AccountingAuditTrailPage(){ const [searchParams] = useSearchParams(); useState(searchParams.get("source_type")); useState(searchParams.get("source_id")); return null; }`,
    faults: `function FaultDraftsPage(){ const [searchParams] = useSearchParams(); useState(searchParams.get("unit_id")); return null; }`,
    entityLink: `function resolveEntityRoute(kind,id){ switch (kind) { case "expense": return \`/accounting/expenses/list?expense_id=\${id}\`; } }`,
    expensesList: `function ExpensesListPage(){ const [searchParams] = useSearchParams(); useState(searchParams.get("expense_id")); return <EntityLink kind="expense" id={r.id}/>; }`,
    woDetail: `function WorkOrderDetailPage(){ return <EntityLink kind="expense" id={expense.id}/>; }`,
    manifest: `const ROUTES = React.Children.toArray(<><Route path="/accounting/invoices/:id" element={<InvoiceDetailPage/>}/><Route path="/accounting/payments/:id" element={<PaymentDetailPage/>}/><Route path="/accounting/audit-trail" element={<AccountingAuditTrailPage/>}/><Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/></>);`,
  };
  const decoyText = `// EntityLink kind="expense" id={expense.id}; useSearchParams(); searchParams.get("expense_id")\nconst decoy = "/accounting/expenses/list /accounting/audit-trail?source_type=invoice&source_id=";`;
  const decoys = Object.fromEntries(Object.keys(FILES).map((key) => [key, decoyText]));
  const goodFailures = assertContracts(good);
  const decoyFailures = assertContracts(decoys);
  const wrongBindingFailures = assertContracts({
    ...good,
    invoice: good.invoice.replace("invoice.customer_id", "invoice.id"),
  });
  const wrongInvoiceAuditIdFailures = assertContracts({
    ...good,
    invoice: good.invoice.replace("encodeURIComponent(invoice.id)", "encodeURIComponent(invoice.customer_id)"),
  });
  const wrongPaymentAuditIdFailures = assertContracts({
    ...good,
    payment: good.payment.replace("encodeURIComponent(payment.id)", "encodeURIComponent(payment.customer_id)"),
  });
  const deadConsumerFailures = assertContracts({
    ...good,
    audit: `function AccountingAuditTrailPage(){ const [searchParams] = useSearchParams(); function neverCalled(){ searchParams.get("source_type"); searchParams.get("source_id"); } return null; }`,
  });
  const wrongRouteComponentFailures = assertContracts({
    ...good,
    manifest: good.manifest.replace("<ExpensesListPage/>", "<WrongExpensesPage/>"),
  });
  const obsoleteExpenseRouteFailures = assertContracts({
    ...good,
    woDetail: `function WorkOrderDetailPage(){ navigate(\`/accounting/expenses?expense_id=\${expense.id}\`); return <EntityLink kind="expense" id={expense.id}/>; }`,
  });
  const constantFalseProducerFailures = assertContracts({
    ...good,
    invoice: good.invoice.replace(
      `<EntityLink kind="customer" id={invoice.customer_id}/>`,
      `{false && <EntityLink kind="customer" id={invoice.customer_id}/>}`,
    ),
  });
  const inertConsumerCallbackFailures = assertContracts({
    ...good,
    audit: `function AccountingAuditTrailPage(){ const [searchParams] = useSearchParams(); const inert = () => { searchParams.get("source_type"); searchParams.get("source_id"); }; return null; }`,
  });
  const constantFalseRouteFailures = assertContracts({
    ...good,
    manifest: good.manifest.replace(
      `<Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/>`,
      `{false && <Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/>}`,
    ),
  });
  if (
    goodFailures.length > 0 ||
    decoyFailures.length < 8 ||
    !wrongBindingFailures.some((failure) => failure.includes("customer header")) ||
    !wrongInvoiceAuditIdFailures.some((failure) => failure.includes("invoice audit-trail")) ||
    !wrongPaymentAuditIdFailures.some((failure) => failure.includes("customer-payment audit")) ||
    !deadConsumerFailures.some((failure) => failure.includes("consume ?source_type=")) ||
    !deadConsumerFailures.some((failure) => failure.includes("consume ?source_id=")) ||
    !wrongRouteComponentFailures.some((failure) => failure.includes("must render ExpensesListPage")) ||
    !obsoleteExpenseRouteFailures.some((failure) => failure.includes("obsolete /accounting/expenses")) ||
    !constantFalseProducerFailures.some((failure) => failure.includes("customer header")) ||
    !inertConsumerCallbackFailures.some((failure) => failure.includes("consume ?source_type=")) ||
    !inertConsumerCallbackFailures.some((failure) => failure.includes("consume ?source_id=")) ||
    !constantFalseRouteFailures.some((failure) => failure.includes("must render ExpensesListPage"))
  ) {
    console.error(`${LABEL} --selftest FAIL`, {
      goodFailures,
      decoyFailures,
      wrongBindingFailures,
      wrongInvoiceAuditIdFailures,
      wrongPaymentAuditIdFailures,
      deadConsumerFailures,
      wrongRouteComponentFailures,
      obsoleteExpenseRouteFailures,
      constantFalseProducerFailures,
      inertConsumerCallbackFailures,
      constantFalseRouteFailures,
    });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS wrong EntityLink binding rejected`);
  console.log(`${LABEL} --selftest PASS wrong invoice audit ID rejected`);
  console.log(`${LABEL} --selftest PASS wrong payment audit ID rejected`);
  console.log(`${LABEL} --selftest PASS never-called search-param consumers rejected`);
  console.log(`${LABEL} --selftest PASS wrong registered route component rejected`);
  console.log(`${LABEL} --selftest PASS obsolete /accounting/expenses?expense_id= rejected`);
  console.log(`${LABEL} --selftest PASS constant-false EntityLink producer rejected`);
  console.log(`${LABEL} --selftest PASS inert callback search-param consumers rejected`);
  console.log(`${LABEL} --selftest PASS constant-false route mount rejected`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }
  const failures = assertContracts(readSources());
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — EntityLink producers, resolver, routes, and consumers execute end-to-end`);
}

main();
