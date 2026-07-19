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

function hasEntityLink(sf, kind, idExpression) {
  return walk(sf, (node, sourceFile) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return false;
    return (
      jsxName(node) === "EntityLink" &&
      jsxAttribute(node, "kind", sourceFile) === kind &&
      jsxAttribute(node, "id", sourceFile) === idExpression
    );
  });
}

function hasCall(sf, callee, argument) {
  return walk(sf, (node) => {
    if (!ts.isCallExpression(node) || node.expression.getText(sf) !== callee) return false;
    return argument === undefined || node.arguments.some((arg) => {
      return ts.isStringLiteralLike(arg) && arg.text === argument;
    });
  });
}

function executableArguments(sf, callee) {
  const args = [];
  walk(sf, (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === callee && node.arguments[0]) {
      args.push(node.arguments[0].getText(sf));
    }
    return false;
  });
  return args;
}

function hasRoutePath(sf, routePath) {
  return walk(sf, (node, sourceFile) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return false;
    return jsxName(node) === "Route" && jsxAttribute(node, "path", sourceFile) === routePath;
  });
}

function hasResolverCase(sf, kind, expectedReturn) {
  return walk(sf, (node) => {
    if (!ts.isCaseClause(node) || !ts.isStringLiteralLike(node.expression) || node.expression.text !== kind) {
      return false;
    }
    return node.statements.some(
      (statement) =>
        ts.isReturnStatement(statement) &&
        statement.expression?.getText(sf) === expectedReturn,
    );
  });
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
    if (!hasEntityLink(parsed.invoice, "customer", "invoice.customer_id")) {
      failures.push("InvoiceDetailPage: customer header must execute EntityLink customer/invoice.customer_id");
    }
    const nav = executableArguments(parsed.invoice, "navigate");
    if (!nav.some((arg) => arg.includes("/accounting/audit-trail?source_type=invoice&source_id="))) {
      failures.push("InvoiceDetailPage: View audit log must execute the invoice audit-trail deep-link");
    }
    if (nav.some((arg) => arg.includes("/reports?invoice_id="))) {
      failures.push("InvoiceDetailPage: must not execute dead /reports?invoice_id= navigation");
    }
  }

  if (parsed.payment) {
    const nav = executableArguments(parsed.payment, "navigate");
    if (!nav.some((arg) => arg.includes("/accounting/audit-trail?source_type=customer_payment&source_id="))) {
      failures.push("PaymentDetailPage: View audit log must execute the customer-payment audit deep-link");
    }
    if (nav.some((arg) => arg.includes("/reports?payment_id="))) {
      failures.push("PaymentDetailPage: must not execute dead /reports?payment_id= navigation");
    }
  }

  if (parsed.audit) {
    if (!hasCall(parsed.audit, "useSearchParams")) {
      failures.push("AccountingAuditTrailPage: must execute useSearchParams()");
    }
    for (const parameter of ["source_type", "source_id"]) {
      if (!hasCall(parsed.audit, "searchParams.get", parameter)) {
        failures.push(`AccountingAuditTrailPage: must consume ?${parameter}=`);
      }
    }
  }

  if (parsed.faults) {
    if (!hasCall(parsed.faults, "useSearchParams") || !hasCall(parsed.faults, "searchParams.get", "unit_id")) {
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
    if (
      !hasCall(parsed.expensesList, "useSearchParams") ||
      !hasCall(parsed.expensesList, "searchParams.get", "expense_id")
    ) {
      failures.push("ExpensesListPage: must execute useSearchParams() and consume ?expense_id=");
    }
    if (!hasEntityLink(parsed.expensesList, "expense", "r.id")) {
      failures.push("ExpensesListPage: expense number must execute EntityLink expense/r.id");
    }
  }

  if (parsed.woDetail && !hasEntityLink(parsed.woDetail, "expense", "expense.id")) {
    failures.push("WorkOrderDetailPage: expense producer must execute EntityLink expense/expense.id");
  }

  if (parsed.manifest && !hasRoutePath(parsed.manifest, "/accounting/expenses/list")) {
    failures.push("manifest: must register /accounting/expenses/list");
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
    invoice: `const x = <EntityLink kind="customer" id={invoice.customer_id}/>; navigate(\`/accounting/audit-trail?source_type=invoice&source_id=\${invoice.id}\`);`,
    payment: `navigate(\`/accounting/audit-trail?source_type=customer_payment&source_id=\${payment.id}\`);`,
    audit: `const [searchParams] = useSearchParams(); searchParams.get("source_type"); searchParams.get("source_id");`,
    faults: `const [searchParams] = useSearchParams(); searchParams.get("unit_id");`,
    entityLink: `switch (kind) { case "expense": return \`/accounting/expenses/list?expense_id=\${id}\`; }`,
    expensesList: `const [searchParams] = useSearchParams(); searchParams.get("expense_id"); const x = <EntityLink kind="expense" id={r.id}/>;`,
    woDetail: `const x = <EntityLink kind="expense" id={expense.id}/>;`,
    manifest: `const x = <Route path="/accounting/expenses/list" element={<Page/>}/>;`,
  };
  const decoyText = `// EntityLink kind="expense" id={expense.id}; useSearchParams(); searchParams.get("expense_id")\nconst decoy = "/accounting/expenses/list /accounting/audit-trail?source_type=invoice&source_id=";`;
  const decoys = Object.fromEntries(Object.keys(FILES).map((key) => [key, decoyText]));
  const goodFailures = assertContracts(good);
  const decoyFailures = assertContracts(decoys);
  const wrongBindingFailures = assertContracts({
    ...good,
    invoice: good.invoice.replace("invoice.customer_id", "invoice.id"),
  });
  if (
    goodFailures.length > 0 ||
    decoyFailures.length < 8 ||
    !wrongBindingFailures.some((failure) => failure.includes("customer header"))
  ) {
    console.error(`${LABEL} --selftest FAIL`, { goodFailures, decoyFailures, wrongBindingFailures });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (executable AST semantics reject comments/string decoys)`);
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
