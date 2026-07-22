#!/usr/bin/env node
/**
 * Strict structural contract for the named reverse-drill producer/consumer surfaces.
 *
 * This guard accepts only direct EntityLink, navigate, searchParams.get, resolver, and Route
 * forms. It does not attempt alias or control-flow inference. Behavior is proved by rendering
 * and clicking the production components in reverse-drill-through.behavior.test.tsx.
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

function parse(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  if (sf.parseDiagnostics.length) {
    const details = sf.parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
      .join("; ");
    throw new Error(`${file}: TypeScript parse failed: ${details}`);
  }
  return sf;
}

function walk(root, visit) {
  visit(root);
  ts.forEachChild(root, (child) => walk(child, visit));
}

function stringLiteral(node) {
  return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function topLevelExportedFunction(sf, name) {
  const matches = sf.statements.filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name &&
      isExported(node),
  );
  return matches.length === 1 ? matches[0] : null;
}

function hasNestedFunctionBoundary(node, root) {
  for (let current = node.parent; current && current !== root; current = current.parent) {
    if (ts.isFunctionLike(current)) return true;
  }
  return false;
}

function jsxAttribute(node, name, sf) {
  const attribute = node.attributes.properties.find(
    (candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === name,
  );
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    return attribute.initializer.expression.getText(sf);
  }
  return null;
}

function isInside(node, container) {
  for (let current = node; current; current = current.parent) {
    if (current === container) return true;
  }
  return false;
}

function hasLiteralDeadAncestor(node, root) {
  for (let current = node.parent; current && current !== root; current = current.parent) {
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      current.left.kind === ts.SyntaxKind.FalseKeyword &&
      isInside(node, current.right)
    ) {
      return true;
    }
    if (ts.isConditionalExpression(current)) {
      if (current.condition.kind === ts.SyntaxKind.FalseKeyword && isInside(node, current.whenTrue)) return true;
      if (current.condition.kind === ts.SyntaxKind.TrueKeyword && isInside(node, current.whenFalse)) return true;
    }
    if (ts.isIfStatement(current)) {
      if (current.expression.kind === ts.SyntaxKind.FalseKeyword && isInside(node, current.thenStatement)) return true;
      if (current.expression.kind === ts.SyntaxKind.TrueKeyword && current.elseStatement && isInside(node, current.elseStatement)) return true;
    }
  }
  return false;
}

function hasDynamicBranchAncestor(node, root) {
  for (let current = node.parent; current && current !== root; current = current.parent) {
    if (
      ts.isConditionalExpression(current) ||
      ts.isIfStatement(current) ||
      (ts.isBinaryExpression(current) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(current.operatorToken.kind))
    ) {
      return true;
    }
  }
  return false;
}

function hasDirectEntityLink(sf, root, kind, id) {
  let found = false;
  walk(root, (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === "EntityLink" &&
      jsxAttribute(node, "kind", sf) === kind &&
      jsxAttribute(node, "id", sf) === id &&
      !hasNestedFunctionBoundary(node, root) &&
      !hasDynamicBranchAncestor(node, root) &&
      !hasLiteralDeadAncestor(node, root)
    ) {
      found = true;
    }
  });
  return found;
}

function templateMatches(node, sf, head, expression) {
  return (
    ts.isTemplateExpression(node) &&
    node.head.text === head &&
    node.templateSpans.length === 1 &&
    node.templateSpans[0].expression.getText(sf) === expression &&
    node.templateSpans[0].literal.text === ""
  );
}

function hasDirectNavigation(sf, root, sourceType, idExpression, requirePropagationControl = false) {
  let matches = 0;
  walk(root, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "navigate" &&
      node.arguments.length === 1 &&
      templateMatches(
        node.arguments[0],
        sf,
        `/accounting/audit-trail?source_type=${sourceType}&source_id=`,
        `encodeURIComponent(${idExpression})`,
      )
    ) {
      let arrow = node.parent;
      while (arrow && arrow !== root && !ts.isArrowFunction(arrow)) arrow = arrow.parent;
      const expression = arrow?.parent;
      const attribute = expression?.parent;
      if (
        arrow &&
        ts.isArrowFunction(arrow) &&
        expression &&
        ts.isJsxExpression(expression) &&
        attribute &&
        ts.isJsxAttribute(attribute) &&
        attribute.name.text === "onClick" &&
        !hasNestedFunctionBoundary(arrow, root) &&
        !hasDynamicBranchAncestor(attribute, root) &&
        !hasLiteralDeadAncestor(node, root)
      ) {
        if (requirePropagationControl) {
          const eventParameter =
            arrow.parameters.length === 1 &&
            ts.isIdentifier(arrow.parameters[0].name) &&
            arrow.parameters[0].name.text === "event";
          const statements = ts.isBlock(arrow.body) ? [...arrow.body.statements] : [];
          const directEventCall = (statement, method) =>
            ts.isExpressionStatement(statement) &&
            ts.isCallExpression(statement.expression) &&
            ts.isPropertyAccessExpression(statement.expression.expression) &&
            ts.isIdentifier(statement.expression.expression.expression) &&
            statement.expression.expression.expression.text === "event" &&
            statement.expression.expression.name.text === method &&
            statement.expression.arguments.length === 0;
          const directNavigate =
            statements.length === 3 &&
            ts.isExpressionStatement(statements[2]) &&
            statements[2].expression === node;
          const control = attribute.parent?.parent;
          const exactLabel =
            ts.isJsxOpeningElement(control) &&
            ts.isJsxElement(control.parent) &&
            control.parent.children.some(
              (child) => ts.isJsxText(child) && child.text.trim() === "View audit log",
            );
          if (
            eventParameter &&
            directEventCall(statements[0], "preventDefault") &&
            directEventCall(statements[1], "stopPropagation") &&
            directNavigate &&
            exactLabel
          ) {
            matches += 1;
          }
        } else {
          matches += 1;
        }
      }
    }
  });
  return matches === 1;
}

function directSearchParamBinding(sf, root, binding, parameter) {
  if (!root.body || !ts.isBlock(root.body)) return false;
  let declarations = 0;
  let assignments = 0;
  for (const statement of root.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const node of statement.declarationList.declarations) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === binding &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isPropertyAccessExpression(node.initializer.expression) &&
      ts.isIdentifier(node.initializer.expression.expression) &&
      node.initializer.expression.expression.text === "searchParams" &&
      node.initializer.expression.name.text === "get" &&
      node.initializer.arguments.length === 1 &&
      ts.isStringLiteralLike(node.initializer.arguments[0]) &&
      node.initializer.arguments[0].text === parameter &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      declarations += 1;
    }
    }
  }
  walk(root.body, (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === binding
    ) {
      assignments += 1;
    }
  });
  return declarations === 1 && assignments === 0;
}

function directSearchParamsHook(root) {
  if (!root.body || !ts.isBlock(root.body)) return false;
  let count = 0;
  for (const statement of root.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const node of statement.declarationList.declarations) {
      if (
      ts.isArrayBindingPattern(node.name) &&
      node.name.elements.length >= 1 &&
      ts.isBindingElement(node.name.elements[0]) &&
      ts.isIdentifier(node.name.elements[0].name) &&
      node.name.elements[0].name.text === "searchParams" &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "useSearchParams" &&
      node.initializer.arguments.length === 0
    ) {
        count += 1;
      }
    }
  }
  return count === 1;
}

function directStateInitialization(sf, root, stateName, setterName, parameterName) {
  if (!root.body || !ts.isBlock(root.body)) return false;
  const matches = [];
  for (const statement of root.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isArrayBindingPattern(declaration.name) &&
        declaration.name.elements.length === 2 &&
        declaration.name.elements[0].name.getText(sf) === stateName &&
        declaration.name.elements[1].name.getText(sf) === setterName &&
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === "useState" &&
        declaration.initializer.arguments.length === 1 &&
        ts.isArrowFunction(declaration.initializer.arguments[0]) &&
        declaration.initializer.arguments[0].body.getText(sf) === `${parameterName} ?? ""`
      ) {
        matches.push(declaration);
      }
    }
  }
  return matches.length === 1;
}

function directAuditQueryConsumption(sf, root) {
  if (!root.body || !ts.isBlock(root.body)) return false;
  const eventDeclarations = root.body.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "eventQuery",
      )
      : [],
  );
  if (eventDeclarations.length !== 1) return false;
  const initializer = eventDeclarations[0].initializer;
  if (
    !initializer ||
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== "useInfiniteQuery" ||
    initializer.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(initializer.arguments[0])
  ) {
    return false;
  }
  const queryFn = initializer.arguments[0].properties.find(
    (property) => ts.isPropertyAssignment(property) && property.name.getText(sf) === "queryFn",
  );
  if (!queryFn || !ts.isPropertyAssignment(queryFn) || !ts.isArrowFunction(queryFn.initializer)) return false;
  const call = queryFn.initializer.body;
  if (
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== "listAccountingAuditTrail" ||
    call.arguments.length !== 2 ||
    call.arguments[0].getText(sf) !== "companyId" ||
    !ts.isObjectLiteralExpression(call.arguments[1])
  ) {
    return false;
  }
  const expected = new Map([
    ["source_transaction_type", "sourceType.trim() || undefined"],
    ["source_transaction_id", "sourceId.trim() || undefined"],
  ]);
  for (const [propertyName, expression] of expected) {
    const property = call.arguments[1].properties.find(
      (candidate) => ts.isPropertyAssignment(candidate) && candidate.name.getText(sf) === propertyName,
    );
    if (!property || !ts.isPropertyAssignment(property) || property.initializer.getText(sf) !== expression) {
      return false;
    }
  }
  return true;
}

function directResolverCase(sf) {
  const resolver = topLevelExportedFunction(sf, "resolveEntityRoute");
  if (!resolver) return false;
  if (!resolver.body) return false;
  const switches = resolver.body.statements.filter(ts.isSwitchStatement);
  if (switches.length !== 1) return false;
  const found = switches[0].caseBlock.clauses.filter(
    (node) =>
      ts.isCaseClause(node) &&
      ts.isStringLiteralLike(node.expression) &&
      node.expression.text === "expense" &&
      node.statements.length === 1 &&
      ts.isReturnStatement(node.statements[0]) &&
      node.statements[0].expression?.getText(sf) === "`/accounting/expenses/${id}`",
  );
  return found.length === 1;
}

function directRoute(sf, routePath, component) {
  const routesDeclaration = sf.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      isExported(node) &&
      node.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "ROUTES",
      ),
  );
  if (!routesDeclaration) return false;
  const declaration = routesDeclaration.declarationList.declarations.find(
    (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === "ROUTES",
  );
  let initializer = declaration?.initializer;
  while (
    initializer &&
    (ts.isParenthesizedExpression(initializer) ||
      ts.isAsExpression(initializer) ||
      ts.isSatisfiesExpression(initializer))
  ) {
    initializer = initializer.expression;
  }
  if (
    !initializer ||
    !ts.isCallExpression(initializer) ||
    !ts.isPropertyAccessExpression(initializer.expression) ||
    initializer.expression.getText(sf) !== "React.Children.toArray" ||
    initializer.arguments.length !== 1 ||
    !ts.isJsxFragment(initializer.arguments[0])
  ) {
    return false;
  }
  const fragment = initializer.arguments[0];
  const pathMatches = fragment.children.filter(
    (node) =>
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === "Route" &&
      jsxAttribute(node, "path", sf) === routePath,
  );
  if (pathMatches.length !== 1) return false;
  const route = pathMatches[0];
  const element = route.attributes.properties.find(
    (candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === "element",
  );
  if (
    !element ||
    !ts.isJsxAttribute(element) ||
    !ts.isJsxExpression(element.initializer) ||
    !element.initializer.expression ||
    !ts.isJsxElement(element.initializer.expression) ||
    element.initializer.expression.openingElement.tagName.getText(sf) !== "ProtectedRoute"
  ) {
    return false;
  }
  const children = element.initializer.expression.children.filter(
    (child) => !ts.isJsxText(child) || child.text.trim() !== "",
  );
  return (
    children.length === 1 &&
    ts.isJsxSelfClosingElement(children[0]) &&
    children[0].tagName.getText(sf) === component
  );
}

function directLazyImportBinding(sf, localName, modulePath, exportName) {
  const declarations = sf.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === localName,
      )
      : [],
  );
  if (declarations.length !== 1) return false;
  const initializer = declarations[0].initializer;
  if (
    !initializer ||
    !ts.isCallExpression(initializer) ||
    !ts.isPropertyAccessExpression(initializer.expression) ||
    initializer.expression.getText(sf) !== "React.lazy" ||
    initializer.arguments.length !== 1 ||
    !ts.isArrowFunction(initializer.arguments[0])
  ) {
    return false;
  }
  const thenCall = initializer.arguments[0].body;
  if (
    !ts.isCallExpression(thenCall) ||
    !ts.isPropertyAccessExpression(thenCall.expression) ||
    thenCall.expression.name.text !== "then" ||
    !ts.isCallExpression(thenCall.expression.expression) ||
    thenCall.expression.expression.expression.kind !== ts.SyntaxKind.ImportKeyword ||
    stringLiteral(thenCall.expression.expression.arguments[0]) !== modulePath ||
    thenCall.arguments.length !== 1 ||
    !ts.isArrowFunction(thenCall.arguments[0])
  ) {
    return false;
  }
  const mapper = thenCall.arguments[0];
  if (mapper.parameters.length !== 1 || mapper.parameters[0].name.getText(sf) !== "m") return false;
  let body = mapper.body;
  if (ts.isParenthesizedExpression(body)) body = body.expression;
  if (!ts.isObjectLiteralExpression(body) || body.properties.length !== 1) return false;
  const property = body.properties[0];
  return (
    ts.isPropertyAssignment(property) &&
    property.name.getText(sf) === "default" &&
    property.initializer.getText(sf) === `m.${exportName}`
  );
}

function directExpenseColumnRenderer(sf, component) {
  if (!component.body) return false;
  const columnsStatement = component.body.statements.find(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "columns",
      ),
  );
  const declaration = columnsStatement?.declarationList.declarations.find(
    (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === "columns",
  );
  if (!declaration?.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) return false;
  const expenseColumns = declaration.initializer.elements.filter((element) => {
    if (!ts.isObjectLiteralExpression(element)) return false;
    return element.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText(sf) === "key" &&
        stringLiteral(property.initializer) === "expense_number",
    );
  });
  if (expenseColumns.length !== 1) return false;
  const renderer = expenseColumns[0].properties.find(
    (property) => ts.isPropertyAssignment(property) && property.name.getText(sf) === "render",
  );
  if (
    !renderer ||
    !ts.isPropertyAssignment(renderer) ||
    !ts.isArrowFunction(renderer.initializer) ||
    renderer.initializer.parameters.length !== 1 ||
    renderer.initializer.parameters[0].name.getText(sf) !== "r"
  ) {
    return false;
  }
  const body = renderer.initializer.body;
  return (
    ts.isJsxSelfClosingElement(body) &&
    body.tagName.getText(sf) === "EntityLink" &&
    jsxAttribute(body, "kind", sf) === "expense" &&
    jsxAttribute(body, "id", sf) === "r.id"
  );
}

function directWorkOrderExpenseRenderer(sf, component) {
  let matches = 0;
  walk(component.body, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "map" &&
      node.expression.expression.getText(sf) === "linkedFinancialsQ.data.expenses" &&
      node.arguments.length === 1 &&
      ts.isArrowFunction(node.arguments[0]) &&
      node.arguments[0].parameters.length === 1 &&
      node.arguments[0].parameters[0].name.getText(sf) === "expense"
    ) {
      const renderer = node.arguments[0];
      let directLinks = 0;
      walk(renderer.body, (candidate) => {
        if (
          (ts.isJsxSelfClosingElement(candidate) || ts.isJsxOpeningElement(candidate)) &&
          candidate.tagName.getText(sf) === "EntityLink" &&
          jsxAttribute(candidate, "kind", sf) === "expense" &&
          jsxAttribute(candidate, "id", sf) === "expense.id" &&
          !hasNestedFunctionBoundary(candidate, renderer)
        ) {
          directLinks += 1;
        }
      });
      if (directLinks === 1) matches += 1;
    }
  });
  return matches === 1;
}

function hasObsoleteExpenseRoute(sf) {
  let found = false;
  walk(sf, (node) => {
    if (
      (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
      node.getText(sf).includes("/accounting/expenses?expense_id=")
    ) {
      found = true;
    }
  });
  return found;
}

export function assertContracts(sources) {
  const failures = [];
  const parsed = {};
  for (const [key, file] of Object.entries(FILES)) {
    if (typeof sources[key] !== "string") {
      failures.push(`MISSING ${file}`);
      continue;
    }
    try {
      parsed[key] = parse(file, sources[key]);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const invoice = parsed.invoice && topLevelExportedFunction(parsed.invoice, "InvoiceDetailPage");
  if (!invoice || !hasDirectEntityLink(parsed.invoice, invoice, "customer", "invoice.customer_id")) {
    failures.push("InvoiceDetailPage: use direct unconditional <EntityLink kind=\"customer\" id={invoice.customer_id} ... />; aliases/wrappers are forbidden");
  }
  if (!invoice || !hasDirectNavigation(parsed.invoice, invoice, "invoice", "invoice.id", true)) {
    failures.push("InvoiceDetailPage: use one direct View audit log onClick={(event) => { event.preventDefault(); event.stopPropagation(); navigate(canonical invoice audit URL); }}; aliases/wrappers are forbidden");
  }

  const payment = parsed.payment && topLevelExportedFunction(parsed.payment, "PaymentDetailPage");
  if (!payment || !hasDirectNavigation(parsed.payment, payment, "customer_payment", "payment.id")) {
    failures.push("PaymentDetailPage: use direct inline onClick={() => navigate(canonical customer-payment audit URL)}; aliases/wrappers are forbidden");
  }

  const audit = parsed.audit && topLevelExportedFunction(parsed.audit, "AccountingAuditTrailPage");
  if (!audit || !directSearchParamsHook(audit)) {
    failures.push("AccountingAuditTrailPage: use direct const [searchParams] = useSearchParams()");
  }
  if (!audit || !directSearchParamBinding(parsed.audit, audit, "sourceTypeParam", "source_type")) {
    failures.push("AccountingAuditTrailPage: bind immutable sourceTypeParam directly from searchParams.get(\"source_type\")");
  }
  if (!audit || !directSearchParamBinding(parsed.audit, audit, "sourceIdParam", "source_id")) {
    failures.push("AccountingAuditTrailPage: bind immutable sourceIdParam directly from searchParams.get(\"source_id\")");
  }
  if (
    !audit ||
    !directStateInitialization(parsed.audit, audit, "sourceType", "setSourceType", "sourceTypeParam") ||
    !directStateInitialization(parsed.audit, audit, "sourceId", "setSourceId", "sourceIdParam") ||
    !directAuditQueryConsumption(parsed.audit, audit)
  ) {
    failures.push("AccountingAuditTrailPage: directly initialize rendered sourceType/sourceId state from canonical params and consume both in listAccountingAuditTrail");
  }

  const faults = parsed.faults && topLevelExportedFunction(parsed.faults, "FaultDraftsPage");
  if (!faults || !directSearchParamsHook(faults) || !directSearchParamBinding(parsed.faults, faults, "deepLinkUnitId", "unit_id")) {
    failures.push("FaultDraftsPage: bind immutable deepLinkUnitId directly from searchParams.get(\"unit_id\")");
  }

  const expenses = parsed.expensesList && topLevelExportedFunction(parsed.expensesList, "ExpensesListPage");
  if (!expenses || !directSearchParamsHook(expenses) || !directSearchParamBinding(parsed.expensesList, expenses, "deepLinkExpenseId", "expense_id")) {
    failures.push("ExpensesListPage: bind immutable deepLinkExpenseId directly from searchParams.get(\"expense_id\")");
  }
  if (!expenses || !directExpenseColumnRenderer(parsed.expensesList, expenses)) {
    failures.push("ExpensesListPage: exported component must use the exact expense_number column render: (r) => <EntityLink kind=\"expense\" id={r.id} ... />");
  }

  const wo = parsed.woDetail && topLevelExportedFunction(parsed.woDetail, "WorkOrderDetailPage");
  if (!wo || !directWorkOrderExpenseRenderer(parsed.woDetail, wo)) {
    failures.push("WorkOrderDetailPage: exported component must directly render the expense EntityLink inside linkedFinancialsQ.data.expenses.map");
  }
  if (!parsed.entityLink || !directResolverCase(parsed.entityLink)) {
    failures.push("EntityLink: expense resolver must directly return `/accounting/expenses/${id}`");
  }

  if (parsed.manifest) {
    for (const [routePath, component, modulePath] of [
      ["/accounting/invoices/:id", "InvoiceDetailPage", "../pages/accounting/InvoiceDetailPage"],
      ["/accounting/payments/:id", "PaymentDetailPage", "../pages/accounting/PaymentDetailPage"],
      ["/accounting/audit-trail", "AccountingAuditTrailPage", "../pages/accounting/AccountingAuditTrailPage"],
      ["/accounting/expenses/list", "ExpensesListPage", "../pages/accounting/ExpensesListPage"],
      ["/accounting/expenses/:id", "ExpenseDetailPage", "../pages/accounting/ExpenseDetailPage"],
    ]) {
      if (!directRoute(parsed.manifest, routePath, component)) {
        failures.push(`manifest: ROUTES must directly mount <Route path="${routePath}" element={<ProtectedRoute><${component} /></ProtectedRoute>} />`);
      }
      if (!directLazyImportBinding(parsed.manifest, component, modulePath, component)) {
        failures.push(`manifest: ${component} must be the direct React.lazy binding for import("${modulePath}") export ${component}`);
      }
    }
  }

  for (const [key, sf] of Object.entries(parsed)) {
    if (sf && hasObsoleteExpenseRoute(sf)) failures.push(`${FILES[key]}: obsolete /accounting/expenses?expense_id= route is forbidden`);
  }
  return failures;
}

function canonicalSources() {
  return {
    invoice: `export function InvoiceDetailPage(){return <><EntityLink kind="customer" id={invoice.customer_id}/><button onClick={(event)=>{event.preventDefault();event.stopPropagation();navigate(\`/accounting/audit-trail?source_type=invoice&source_id=\${encodeURIComponent(invoice.id)}\`);}}>View audit log</button></>}`,
    payment: `export function PaymentDetailPage(){return <button onClick={()=>navigate(\`/accounting/audit-trail?source_type=customer_payment&source_id=\${encodeURIComponent(payment.id)}\`)}/>}`,
    audit: `export function AccountingAuditTrailPage(){const [searchParams]=useSearchParams();const sourceTypeParam=searchParams.get("source_type");const sourceIdParam=searchParams.get("source_id");const [sourceType,setSourceType]=useState(()=>sourceTypeParam ?? "");const [sourceId,setSourceId]=useState(()=>sourceIdParam ?? "");const eventQuery=useInfiniteQuery({queryFn:({pageParam})=>listAccountingAuditTrail(companyId,{source_transaction_type:sourceType.trim() || undefined,source_transaction_id:sourceId.trim() || undefined})});return <span>{sourceType}{sourceId}{eventQuery.data}</span>}`,
    faults: `export function FaultDraftsPage(){const [searchParams]=useSearchParams();const deepLinkUnitId=searchParams.get("unit_id");return <span>{deepLinkUnitId}</span>}`,
    entityLink: `export function resolveEntityRoute(kind,id){switch(kind){case "expense":return \`/accounting/expenses/\${id}\`;}}`,
    expensesList: `export function ExpensesListPage(){const [searchParams]=useSearchParams();const deepLinkExpenseId=searchParams.get("expense_id");const columns=[{key:"expense_number",render:(r)=><EntityLink kind="expense" id={r.id}/>}];return <span>{deepLinkExpenseId}{columns.length}</span>}`,
    woDetail: `export function WorkOrderDetailPage(){return <>{linkedFinancialsQ.data.expenses.map((expense)=><EntityLink kind="expense" id={expense.id}/>)}</>}`,
    manifest: `const InvoiceDetailPage=React.lazy(()=>import("../pages/accounting/InvoiceDetailPage").then((m)=>({default:m.InvoiceDetailPage})));const PaymentDetailPage=React.lazy(()=>import("../pages/accounting/PaymentDetailPage").then((m)=>({default:m.PaymentDetailPage})));const AccountingAuditTrailPage=React.lazy(()=>import("../pages/accounting/AccountingAuditTrailPage").then((m)=>({default:m.AccountingAuditTrailPage})));const ExpensesListPage=React.lazy(()=>import("../pages/accounting/ExpensesListPage").then((m)=>({default:m.ExpensesListPage})));const ExpenseDetailPage=React.lazy(()=>import("../pages/accounting/ExpenseDetailPage").then((m)=>({default:m.ExpenseDetailPage})));export const ROUTES=React.Children.toArray(<><Route path="/accounting/invoices/:id" element={<ProtectedRoute><InvoiceDetailPage /></ProtectedRoute>}/><Route path="/accounting/payments/:id" element={<ProtectedRoute><PaymentDetailPage /></ProtectedRoute>}/><Route path="/accounting/audit-trail" element={<ProtectedRoute><AccountingAuditTrailPage /></ProtectedRoute>}/><Route path="/accounting/expenses/list" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}/><Route path="/accounting/expenses/:id" element={<ProtectedRoute><ExpenseDetailPage /></ProtectedRoute>}/></>)`,
  };
}

function runSelftest() {
  const good = canonicalSources();
  const cases = [
    ["dead-renderer", { ...good, invoice: good.invoice.replace("<EntityLink", "{false && <EntityLink").replace("/><button", "/>}<button") }, "InvoiceDetailPage"],
    ["nested-renderer", { ...good, invoice: good.invoice.replace("return <>", `function Decoy(){return <EntityLink kind="customer" id={invoice.customer_id}/>};return <>`).replace("<EntityLink kind=\"customer\" id={invoice.customer_id}/><button", "<span/><button") }, "InvoiceDetailPage"],
    ["dynamic-renderer", { ...good, invoice: good.invoice.replace("<EntityLink kind=\"customer\" id={invoice.customer_id}/>", "{flag ? <EntityLink kind=\"customer\" id={invoice.customer_id}/> : <span/>}") }, "InvoiceDetailPage"],
    ["dead-navigation-button", { ...good, invoice: good.invoice.replace("<button onClick", "{false && <button onClick").replace("`)}/></>}", "`)}/>}</>}") }, "audit URL"],
    ["dynamic-navigation-button", { ...good, invoice: good.invoice.replace("<button onClick", "{flag ? <button onClick").replace("`)}/></>}", "`)} /> : <span />}</>}") }, "audit URL"],
    ["missing-invoice-prevent-default", { ...good, invoice: good.invoice.replace("event.preventDefault();", "") }, "preventDefault"],
    ["missing-invoice-stop-propagation", { ...good, invoice: good.invoice.replace("event.stopPropagation();", "") }, "stopPropagation"],
    ["duplicate-invoice-audit-control", { ...good, invoice: good.invoice.replace("</>}", `<button onClick={(event)=>{event.preventDefault();event.stopPropagation();navigate(\`/accounting/audit-trail?source_type=invoice&source_id=\${encodeURIComponent(invoice.id)}\`);}}>View audit log</button></>}`) }, "View audit log"],
    ["overwritten-param", { ...good, audit: good.audit.replace("const sourceIdParam=", "let sourceIdParam=").replace(";const [sourceType", ";sourceIdParam=\"wrong\";const [sourceType") }, "sourceIdParam"],
    ["lexical-shadow-param", { ...good, audit: good.audit.replace("const sourceIdParam=searchParams.get(\"source_id\");", "function Decoy(){const sourceIdParam=searchParams.get(\"source_id\");return sourceIdParam}") }, "sourceIdParam"],
    ["wrong-initialized-state-dead-param", { ...good, audit: good.audit.replace("useState(()=>sourceIdParam ?? \"\")", "useState(()=>\"wrong\")").replace("return <span>", "function deadProof(){const [sourceId]=useState(()=>sourceIdParam ?? \"\");return sourceId}return <span>") }, "directly initialize"],
    ["ignored-search-param", { ...good, audit: good.audit.replace("source_transaction_id:sourceId.trim() || undefined", "source_transaction_id:\"wrong\"") }, "directly initialize"],
    ["route-alias", { ...good, manifest: good.manifest.replace("<Route path=\"/accounting/expenses/list\" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}/>", "{expenseRoute}") }, "/accounting/expenses/list"],
    ["dead-route", { ...good, manifest: good.manifest.replace("<Route path=\"/accounting/expenses/list\" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}/>", "{false && <Route path=\"/accounting/expenses/list\" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}/>}") }, "/accounting/expenses/list"],
    ["dynamic-route", { ...good, manifest: good.manifest.replace("<ExpensesListPage />", "{flag ? <ExpensesListPage /> : <InvoiceDetailPage />}") }, "/accounting/expenses/list"],
    ["wrong-import-binding", { ...good, manifest: good.manifest.replace('import("../pages/accounting/AccountingAuditTrailPage").then((m)=>({default:m.AccountingAuditTrailPage}))', 'import("../pages/accounting/PaymentDetailPage").then((m)=>({default:m.PaymentDetailPage}))') }, "AccountingAuditTrailPage must be"],
    ["duplicate-invoice-route", { ...good, manifest: good.manifest.replace("</>)", '<Route path="/accounting/invoices/:id" element={<ProtectedRoute><PaymentDetailPage /></ProtectedRoute>}/></>)') }, "/accounting/invoices/:id"],
    ["duplicate-payment-route", { ...good, manifest: good.manifest.replace("</>)", '<Route path="/accounting/payments/:id" element={<ProtectedRoute><InvoiceDetailPage /></ProtectedRoute>}/></>)') }, "/accounting/payments/:id"],
    ["duplicate-expense-route", { ...good, manifest: good.manifest.replace("</>)", '<Route path="/accounting/expenses/list" element={<ProtectedRoute><InvoiceDetailPage /></ProtectedRoute>}/></>)') }, "/accounting/expenses/list"],
    ["duplicate-audit-route", { ...good, manifest: good.manifest.replace("</>)", '<Route path="/accounting/audit-trail" element={<ProtectedRoute><PaymentDetailPage /></ProtectedRoute>}/></>)') }, "/accounting/audit-trail"],
    ["id-alias", { ...good, invoice: good.invoice.replace("id={invoice.customer_id}", "id={customerId}") }, "EntityLink"],
    ["navigate-alias", { ...good, invoice: good.invoice.replace("navigate(`", "go(`") }, "audit URL"],
    ["wrong-invoice-id", { ...good, invoice: good.invoice.replace("invoice.id", "invoice.customer_id") }, "audit URL"],
    ["wrong-payment-id", { ...good, payment: good.payment.replace("payment.id", "payment.customer_id") }, "audit URL"],
    ["wrong-query-name", { ...good, faults: good.faults.replace("\"unit_id\"", "\"driver_id\"") }, "deepLinkUnitId"],
    ["obsolete-route", { ...good, woDetail: `export function WorkOrderDetailPage(){navigate(\`/accounting/expenses?expense_id=\${expense.id}\`);return <>{linkedFinancialsQ.data.expenses.map((expense)=><EntityLink kind="expense" id={expense.id}/>)}</>} ` }, "obsolete"],
    ["parse-error", { ...good, invoice: `${good.invoice}{` }, "parse failed"],
  ];
  const problems = [];
  const goodFailures = assertContracts(good);
  if (goodFailures.length) problems.push(`canonical unexpectedly failed: ${goodFailures.join(" | ")}`);
  for (const [name, sources, expected] of cases) {
    const failures = assertContracts(sources);
    if (!failures.some((failure) => failure.includes(expected))) {
      problems.push(`${name} was not rejected by ${expected}: ${failures.join(" | ")}`);
    }
  }
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS canonical control; rejects=${cases.map(([name]) => name).join(",")}`);
}

function main() {
  if (process.argv.includes("--selftest")) return runSelftest();
  const sources = Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => {
      const absolute = path.join(ROOT, file);
      return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null];
    }),
  );
  const failures = assertContracts(sources);
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — canonical direct structures; behavior covered by production component tests`);
}

main();
