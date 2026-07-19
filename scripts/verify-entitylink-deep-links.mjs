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

function findFunction(sf, name) {
  let found = null;
  walk(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
  });
  return found;
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

function hasDirectEntityLink(sf, root, kind, id) {
  let found = false;
  walk(root, (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === "EntityLink" &&
      jsxAttribute(node, "kind", sf) === kind &&
      jsxAttribute(node, "id", sf) === id &&
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

function hasDirectNavigation(sf, root, sourceType, idExpression) {
  let found = false;
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
      const arrow = node.parent;
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
        !hasLiteralDeadAncestor(node, root)
      ) {
        found = true;
      }
    }
  });
  return found;
}

function directSearchParamBinding(sf, root, binding, parameter) {
  let declarations = 0;
  let assignments = 0;
  walk(root, (node) => {
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
  let found = false;
  walk(root, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
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
      found = true;
    }
  });
  return found;
}

function directResolverCase(sf) {
  const resolver = findFunction(sf, "resolveEntityRoute");
  if (!resolver) return false;
  let found = false;
  walk(resolver, (node) => {
    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteralLike(node.expression) &&
      node.expression.text === "expense" &&
      node.statements.length === 1 &&
      ts.isReturnStatement(node.statements[0]) &&
      node.statements[0].expression?.getText(sf) === "`/accounting/expenses/list?expense_id=${id}`"
    ) {
      found = true;
    }
  });
  return found;
}

function directRoute(sf, routePath, component) {
  let found = false;
  walk(sf, (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === "Route" &&
      jsxAttribute(node, "path", sf) === routePath &&
      !hasLiteralDeadAncestor(node, sf)
    ) {
      const element = node.attributes.properties.find(
        (candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === "element",
      );
      if (
        element &&
        ts.isJsxAttribute(element) &&
        ts.isJsxExpression(element.initializer) &&
        element.initializer.expression
      ) {
        walk(element.initializer.expression, (candidate) => {
          if (
            (ts.isJsxSelfClosingElement(candidate) || ts.isJsxOpeningElement(candidate)) &&
            candidate.tagName.getText(sf) === component
          ) {
            found = true;
          }
        });
      }
    }
  });
  return found;
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

  const invoice = parsed.invoice && findFunction(parsed.invoice, "InvoiceDetailPage");
  if (!invoice || !hasDirectEntityLink(parsed.invoice, invoice, "customer", "invoice.customer_id")) {
    failures.push("InvoiceDetailPage: use direct unconditional <EntityLink kind=\"customer\" id={invoice.customer_id} ... />; aliases/wrappers are forbidden");
  }
  if (!invoice || !hasDirectNavigation(parsed.invoice, invoice, "invoice", "invoice.id")) {
    failures.push("InvoiceDetailPage: use direct inline onClick={() => navigate(canonical invoice audit URL)}; aliases/wrappers are forbidden");
  }

  const payment = parsed.payment && findFunction(parsed.payment, "PaymentDetailPage");
  if (!payment || !hasDirectNavigation(parsed.payment, payment, "customer_payment", "payment.id")) {
    failures.push("PaymentDetailPage: use direct inline onClick={() => navigate(canonical customer-payment audit URL)}; aliases/wrappers are forbidden");
  }

  const audit = parsed.audit && findFunction(parsed.audit, "AccountingAuditTrailPage");
  if (!audit || !directSearchParamsHook(audit)) {
    failures.push("AccountingAuditTrailPage: use direct const [searchParams] = useSearchParams()");
  }
  if (!audit || !directSearchParamBinding(parsed.audit, audit, "sourceTypeParam", "source_type")) {
    failures.push("AccountingAuditTrailPage: bind immutable sourceTypeParam directly from searchParams.get(\"source_type\")");
  }
  if (!audit || !directSearchParamBinding(parsed.audit, audit, "sourceIdParam", "source_id")) {
    failures.push("AccountingAuditTrailPage: bind immutable sourceIdParam directly from searchParams.get(\"source_id\")");
  }

  const faults = parsed.faults && findFunction(parsed.faults, "FaultDraftsPage");
  if (!faults || !directSearchParamsHook(faults) || !directSearchParamBinding(parsed.faults, faults, "deepLinkUnitId", "unit_id")) {
    failures.push("FaultDraftsPage: bind immutable deepLinkUnitId directly from searchParams.get(\"unit_id\")");
  }

  const expenses = parsed.expensesList && findFunction(parsed.expensesList, "ExpensesListPage");
  if (!expenses || !directSearchParamsHook(expenses) || !directSearchParamBinding(parsed.expensesList, expenses, "deepLinkExpenseId", "expense_id")) {
    failures.push("ExpensesListPage: bind immutable deepLinkExpenseId directly from searchParams.get(\"expense_id\")");
  }
  if (!expenses || !hasDirectEntityLink(parsed.expensesList, expenses, "expense", "r.id")) {
    failures.push("ExpensesListPage: use direct <EntityLink kind=\"expense\" id={r.id} ... /> in the canonical column renderer");
  }

  const wo = parsed.woDetail && findFunction(parsed.woDetail, "WorkOrderDetailPage");
  if (!wo || !hasDirectEntityLink(parsed.woDetail, wo, "expense", "expense.id")) {
    failures.push("WorkOrderDetailPage: use direct <EntityLink kind=\"expense\" id={expense.id} ... /> in the linked-expense row");
  }
  if (!parsed.entityLink || !directResolverCase(parsed.entityLink)) {
    failures.push("EntityLink: expense resolver must directly return `/accounting/expenses/list?expense_id=${id}`");
  }

  if (parsed.manifest) {
    for (const [routePath, component] of [
      ["/accounting/invoices/:id", "InvoiceDetailPage"],
      ["/accounting/payments/:id", "PaymentDetailPage"],
      ["/accounting/audit-trail", "AccountingAuditTrailPage"],
      ["/accounting/expenses/list", "ExpensesListPage"],
    ]) {
      if (!directRoute(parsed.manifest, routePath, component)) {
        failures.push(`manifest: use direct unconditional <Route path="${routePath}" element={<${component} />} />`);
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
    invoice: `function InvoiceDetailPage(){return <><EntityLink kind="customer" id={invoice.customer_id}/><button onClick={()=>navigate(\`/accounting/audit-trail?source_type=invoice&source_id=\${encodeURIComponent(invoice.id)}\`)}/></>}`,
    payment: `function PaymentDetailPage(){return <button onClick={()=>navigate(\`/accounting/audit-trail?source_type=customer_payment&source_id=\${encodeURIComponent(payment.id)}\`)}/>}`,
    audit: `function AccountingAuditTrailPage(){const [searchParams]=useSearchParams();const sourceTypeParam=searchParams.get("source_type");const sourceIdParam=searchParams.get("source_id");return <span>{sourceTypeParam}{sourceIdParam}</span>}`,
    faults: `function FaultDraftsPage(){const [searchParams]=useSearchParams();const deepLinkUnitId=searchParams.get("unit_id");return <span>{deepLinkUnitId}</span>}`,
    entityLink: `function resolveEntityRoute(kind,id){switch(kind){case "expense":return \`/accounting/expenses/list?expense_id=\${id}\`;}}`,
    expensesList: `function ExpensesListPage(){const [searchParams]=useSearchParams();const deepLinkExpenseId=searchParams.get("expense_id");return <><EntityLink kind="expense" id={r.id}/><span>{deepLinkExpenseId}</span></>}`,
    woDetail: `function WorkOrderDetailPage(){return <EntityLink kind="expense" id={expense.id}/>}`,
    manifest: `const ROUTES=<><Route path="/accounting/invoices/:id" element={<InvoiceDetailPage />}/><Route path="/accounting/payments/:id" element={<PaymentDetailPage />}/><Route path="/accounting/audit-trail" element={<AccountingAuditTrailPage />}/><Route path="/accounting/expenses/list" element={<ExpensesListPage />}/></>`,
  };
}

function runSelftest() {
  const good = canonicalSources();
  const cases = [
    ["dead-renderer", { ...good, invoice: good.invoice.replace("<EntityLink", "{false && <EntityLink").replace("/><button", "/>}<button") }, "InvoiceDetailPage"],
    ["overwritten-param", { ...good, audit: good.audit.replace("const sourceIdParam=", "let sourceIdParam=").replace(";return", ";sourceIdParam=\"wrong\";return") }, "sourceIdParam"],
    ["route-alias", { ...good, manifest: good.manifest.replace("<Route path=\"/accounting/expenses/list\" element={<ExpensesListPage />}/>", "{expenseRoute}") }, "/accounting/expenses/list"],
    ["id-alias", { ...good, invoice: good.invoice.replace("id={invoice.customer_id}", "id={customerId}") }, "EntityLink"],
    ["navigate-alias", { ...good, invoice: good.invoice.replace("navigate(`", "go(`") }, "audit URL"],
    ["wrong-invoice-id", { ...good, invoice: good.invoice.replace("invoice.id", "invoice.customer_id") }, "audit URL"],
    ["wrong-payment-id", { ...good, payment: good.payment.replace("payment.id", "payment.customer_id") }, "audit URL"],
    ["wrong-query-name", { ...good, faults: good.faults.replace("\"unit_id\"", "\"driver_id\"") }, "deepLinkUnitId"],
    ["obsolete-route", { ...good, woDetail: `function WorkOrderDetailPage(){navigate(\`/accounting/expenses?expense_id=\${expense.id}\`);return <EntityLink kind="expense" id={expense.id}/>} ` }, "obsolete"],
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
  console.log(`${LABEL} --selftest PASS canonical control + ${cases.length} historical/metamorphic rejects`);
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
