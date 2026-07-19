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
    const whenTrue = constantBoolean(node.whenTrue);
    const whenFalse = constantBoolean(node.whenFalse);
    return whenTrue === whenFalse ? whenTrue : null;
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

function isProvenColumnRenderer(node, root, sf) {
  const parent = node.parent;
  if (!ts.isPropertyAssignment(parent) || parent.name.getText(sf) !== "render") return false;
  let declaration = parent;
  while (declaration && declaration !== root && !ts.isVariableDeclaration(declaration)) {
    declaration = declaration.parent;
  }
  if (!ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)) return false;
  const columnsName = declaration.name.text;
  return walk(root, (candidate) => {
    if (!ts.isJsxSelfClosingElement(candidate) && !ts.isJsxOpeningElement(candidate)) return false;
    if (candidate.tagName.getText(sf) !== "ParityTable") return false;
    return candidate.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.text === "columns" &&
        ts.isJsxExpression(attribute.initializer) &&
        attribute.initializer.expression?.getText(sf) === columnsName,
    );
  });
}

function isExecutedCallback(node, root, sf) {
  const parent = node.parent;
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    const attribute = parent.parent;
    const element = attribute.parent.parent;
    const eventNames = new Set(["onClick", "onSubmit", "onChange", "onInput"]);
    const tag = (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element))
      ? element.tagName.getText(sf)
      : "";
    return eventNames.has(attribute.name.text) && (/^[a-z]/.test(tag) || tag === "Button");
  }
  if (isProvenColumnRenderer(node, root, sf)) return true;
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
    if (node !== root && ts.isFunctionLike(node) && !isExecutedCallback(node, root, sf)) return;
    if (predicate(node, sf)) matched = true;
    if (
      ts.isJsxExpression(node) &&
      ts.isJsxAttribute(node.parent) &&
      ts.isIdentifier(node.expression) &&
      new Set(["onClick", "onSubmit", "onChange", "onInput"]).has(node.parent.name.text)
    ) {
      const callback = bindingInitializer(node.expression, root, sf);
      if (callback && ts.isFunctionLike(callback)) visit(callback);
    }
    if (ts.isIfStatement(node)) {
      const condition = constantBoolean(node.expression);
      visit(node.expression);
      if (condition !== false) visit(node.thenStatement);
      if (condition !== true && node.elseStatement) visit(node.elseStatement);
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      visit(node.left);
      if (constantBoolean(node.left) !== false) visit(node.right);
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      visit(node.left);
      if (constantBoolean(node.left) !== true) visit(node.right);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition);
      const condition = constantBoolean(node.condition);
      if (condition !== false) visit(node.whenTrue);
      if (condition !== true) visit(node.whenFalse);
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

function isAncestor(ancestor, node) {
  for (let current = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function bindingInitializer(identifier, root, sf) {
  let match = null;
  walk(root, (node) => {
    if (node.getStart(sf) >= identifier.getStart(sf)) return false;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier.text
    ) {
      const container = node.parent?.parent?.parent;
      if (!container || ts.isSourceFile(container) || isAncestor(container, identifier)) {
        match = node.initializer ?? null;
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === identifier.text
    ) {
      const container = node.parent;
      if (!container || isAncestor(container.parent, identifier)) match = node.right;
    }
    return false;
  });
  return match;
}

function resolveAlias(node, root, sf, seen = new Set()) {
  if (!node || !ts.isIdentifier(node)) return node;
  if (seen.has(node.text)) return node;
  const initializer = bindingInitializer(node, root, sf);
  if (!initializer) return node;
  if (
    !ts.isIdentifier(initializer) &&
    !ts.isStringLiteralLike(initializer) &&
    !ts.isTemplateExpression(initializer) &&
    !ts.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    return node;
  }
  const next = new Set(seen);
  next.add(node.text);
  return resolveAlias(initializer, root, sf, next);
}

function resolvedText(node, root, sf) {
  return resolveAlias(node, root, sf)?.getText(sf) ?? "";
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
    if (!ts.isCallExpression(node) || resolvedText(node.expression, root, sf) !== callee) return false;
    return argument === undefined || node.arguments.some((arg) => {
      const resolved = resolveAlias(arg, root, sf);
      return ts.isStringLiteralLike(resolved) && resolved.text === argument;
    });
  }, sf);
}

function hasConsumedCall(sf, root, callee, argument) {
  let consumed = false;
  walkExecutable(root, (node) => {
    if (!ts.isCallExpression(node) || resolvedText(node.expression, root, sf) !== callee) return false;
    if (
      argument !== undefined &&
      !node.arguments.some((arg) => ts.isStringLiteralLike(arg) && arg.text === argument)
    ) {
      return false;
    }
    if (ts.isExpressionStatement(node.parent)) return false;
    if (ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)) return false;
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      const name = node.parent.name.text;
      let references = 0;
      walkExecutable(root, (candidate) => {
        if (ts.isIdentifier(candidate) && candidate.text === name && candidate !== node.parent.name) references += 1;
        return false;
      }, sf);
      if (references === 0) return false;
    }
    consumed = true;
    return true;
  }, sf);
  return consumed;
}

function executableArguments(sf, root, callee) {
  const args = [];
  walkExecutable(root, (node) => {
    if (ts.isCallExpression(node) && resolvedText(node.expression, root, sf) === callee && node.arguments[0]) {
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
        statement.expression &&
        resolvedText(statement.expression, resolver, sf) === expectedReturn,
    );
  }, sf);
}

function isAuditNavigation(node, sf, root, sourceType, idExpression) {
  if (
    !ts.isCallExpression(node) ||
    resolvedText(node.expression, root, sf) !== "navigate" ||
    node.arguments.length !== 1
  ) {
    return false;
  }
  const route = resolveAlias(node.arguments[0], root, sf);
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
    if (!nav.some((arg) => isAuditNavigation(arg.parent, parsed.invoice, component, "invoice", "invoice.id"))) {
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
    if (!nav.some((arg) => isAuditNavigation(arg.parent, parsed.payment, component, "customer_payment", "payment.id"))) {
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
      if (!component || !hasConsumedCall(parsed.audit, component, "searchParams.get", parameter)) {
        failures.push(`AccountingAuditTrailPage: must consume ?${parameter}=`);
      }
    }
  }

  if (parsed.faults) {
    const component = findFunction(parsed.faults, "FaultDraftsPage");
    if (
      !component ||
      !hasCall(parsed.faults, component, "useSearchParams") ||
      !hasConsumedCall(parsed.faults, component, "searchParams.get", "unit_id")
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
      !hasConsumedCall(parsed.expensesList, component, "searchParams.get", "expense_id")
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
  const decoy = `// useSearchParams(); searchParams.get("expense_id"); <EntityLink/>\nconst x="/accounting/expenses/list";`;
  const cases = [
    {
      name: "comment-string-decoys",
      sources: Object.fromEntries(Object.keys(FILES).map((key) => [key, decoy])),
      reject: "InvoiceDetailPage",
    },
    {
      name: "wrong-entity-binding",
      sources: { ...good, invoice: good.invoice.replace("invoice.customer_id", "invoice.id") },
      reject: "customer header",
    },
    {
      name: "wrong-invoice-audit-id",
      sources: { ...good, invoice: good.invoice.replace("encodeURIComponent(invoice.id)", "encodeURIComponent(invoice.customer_id)") },
      reject: "invoice audit-trail",
    },
    {
      name: "wrong-payment-audit-id",
      sources: { ...good, payment: good.payment.replace("encodeURIComponent(payment.id)", "encodeURIComponent(payment.customer_id)") },
      reject: "customer-payment audit",
    },
    {
      name: "never-called-consumer",
      sources: { ...good, audit: `function AccountingAuditTrailPage(){const [searchParams]=useSearchParams();function dead(){useState(searchParams.get("source_type"));useState(searchParams.get("source_id"))}return null}` },
      reject: "consume ?source_type=",
    },
    {
      name: "ignored-query-consumer",
      sources: { ...good, audit: `function AccountingAuditTrailPage(){const [searchParams]=useSearchParams();searchParams.get("source_type");searchParams.get("source_id");return null}` },
      reject: "consume ?source_type=",
    },
    {
      name: "unused-jsx-prop-callback",
      sources: { ...good, audit: `function AccountingAuditTrailPage(){const [searchParams]=useSearchParams();return <Widget ignored={()=>{useState(searchParams.get("source_type"));useState(searchParams.get("source_id"))}}/>}` },
      reject: "consume ?source_type=",
    },
    {
      name: "wrong-route-component",
      sources: { ...good, manifest: good.manifest.replace("<ExpensesListPage/>", "<WrongExpensesPage/>") },
      reject: "must render ExpensesListPage",
    },
    {
      name: "route-in-uninvoked-render-callback",
      sources: { ...good, manifest: `const ROUTES=React.Children.toArray(<><Route path="/accounting/invoices/:id" element={<InvoiceDetailPage/>}/><Route path="/accounting/payments/:id" element={<PaymentDetailPage/>}/><Route path="/accounting/audit-trail" element={<AccountingAuditTrailPage/>}/>{ {render:()=> <Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/>} }</>)` },
      reject: "must render ExpensesListPage",
    },
    {
      name: "true-conditional-dead-route",
      sources: { ...good, manifest: good.manifest.replace(`<Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/>`, `{true ? <WrongExpensesPage/> : <Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/>} `) },
      reject: "must render ExpensesListPage",
    },
    {
      name: "false-logical-producer",
      sources: { ...good, invoice: good.invoice.replace(`<EntityLink kind="customer" id={invoice.customer_id}/>`, `{false && flag && <EntityLink kind="customer" id={invoice.customer_id}/>} `) },
      reject: "customer header",
    },
    {
      name: "false-conditional-producer",
      sources: { ...good, invoice: good.invoice.replace(`<EntityLink kind="customer" id={invoice.customer_id}/>`, `{(false ? true : false) && <EntityLink kind="customer" id={invoice.customer_id}/>} `) },
      reject: "customer header",
    },
    {
      name: "unreachable-else-producer",
      sources: { ...good, invoice: good.invoice.replace(`<EntityLink kind="customer" id={invoice.customer_id}/>`, `{true ? null : <EntityLink kind="customer" id={invoice.customer_id}/>} `) },
      reject: "customer header",
    },
    {
      name: "obsolete-expense-route",
      sources: { ...good, woDetail: `function WorkOrderDetailPage(){navigate(\`/accounting/expenses?expense_id=\${expense.id}\`);return <EntityLink kind="expense" id={expense.id}/>} ` },
      reject: "obsolete /accounting/expenses",
    },
  ];
  const valid = [
    ["canonical", good],
    ["navigation-result-alias", {
      ...good,
      invoice: `function InvoiceDetailPage(){const href=\`/accounting/audit-trail?source_type=invoice&source_id=\${encodeURIComponent(invoice.id)}\`;return <><EntityLink kind="customer" id={invoice.customer_id}/><button onClick={()=>navigate(href)}/></>}`,
    }],
    ["navigation-function-alias", {
      ...good,
      invoice: `function InvoiceDetailPage(){const go=navigate;return <><EntityLink kind="customer" id={invoice.customer_id}/><button onClick={()=>go(\`/accounting/audit-trail?source_type=invoice&source_id=\${encodeURIComponent(invoice.id)}\`)}/></>}`,
    }],
    ["true-live-route", {
      ...good,
      manifest: good.manifest.replace(`<Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/>`, `{true ? <Route path="/accounting/expenses/list" element={<ExpensesListPage/>}/> : <WrongExpensesPage/>}`),
    }],
  ];
  const problems = [];
  for (const [name, sources] of valid) {
    const failures = assertContracts(sources);
    if (failures.length) problems.push(`${name} unexpectedly failed: ${failures.join(" | ")}`);
  }
  for (const test of cases) {
    const failures = assertContracts(test.sources);
    if (!failures.some((failure) => failure.includes(test.reject))) {
      problems.push(`${test.name} was not rejected by ${test.reject}: ${failures.join(" | ")}`);
    }
  }
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${valid.length} valid and ${cases.length} VETO/metamorphic cases`);
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
