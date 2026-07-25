#!/usr/bin/env node
/**
 * BANK-F07 / BANK-LINK-01 — bank surfaces + counterparty linkage (structural).
 *
 * Asserts:
 *   1. Categorize path persists categorization_vendor_id / categorization_customer_id (canonical FKs,
 *      not memo-only).
 *   2. JOINs mdata.vendors / mdata.customers (never RETIRE mdata.qbo_vendors as AP truth).
 *   3. EntityLink kinds cover payment / bill_payment / transfer / bank_transaction both-way routes.
 *   4. Banking module SQL stays on banking.* (no production writes to RETIRE bank.* in banking/).
 *
 * --selftest: memo-only counterparty path MUST FAIL.
 *
 * Self-test: node scripts/verify-bank-surfaces-and-counterparty.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  categorize: "apps/backend/src/banking/categorization.routes.ts",
  bulk: "apps/backend/src/banking/bulk-transactions.ts",
  entity: "apps/frontend/src/components/shared/EntityLink.tsx",
  match: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  design: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  transfers: "apps/frontend/src/pages/banking/TransfersListPage.tsx",
};

export function run(root = ROOT) {
  const failures = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  const categorize = read(FILES.categorize);
  const bulk = read(FILES.bulk);
  const entity = read(FILES.entity);
  const match = read(FILES.match);
  const design = read(FILES.design);
  const transfers = read(FILES.transfers);

  for (const col of ["categorization_vendor_id", "categorization_customer_id"]) {
    if (!categorize.includes(col)) {
      failures.push(`categorization.routes.ts must persist ${col} (canonical FK, not memo)`);
    }
  }
  // Bulk bill-post path is vendor-scoped (A/P); still must stamp categorization_vendor_id.
  if (!bulk.includes("categorization_vendor_id")) {
    failures.push("bulk-transactions.ts must write categorization_vendor_id");
  }

  if (!categorize.includes("LEFT JOIN mdata.vendors") || !categorize.includes("LEFT JOIN mdata.customers")) {
    failures.push("categorization.routes must JOIN mdata.vendors + mdata.customers for counterparty labels");
  }

  // Memo-only counterparty is forbidden as the sole link.
  if (/counterparty\s*[:=]\s*categorization_memo/i.test(categorize)) {
    failures.push("memo-only counterparty assignment is forbidden");
  }

  if (!entity.includes('| "vendor"') && !entity.includes('"vendor"')) {
    failures.push("EntityKind must include vendor");
  }
  if (!entity.includes("| \"customer\"") && !entity.includes('"customer"')) {
    failures.push("EntityKind must include customer");
  }
  for (const kind of ["payment", "bill_payment", "transfer", "bank_transaction"]) {
    if (!entity.includes(`"${kind}"`) && !entity.includes(`| "${kind}"`)) {
      failures.push(`EntityKind must include ${kind}`);
    }
  }
  if (!entity.includes("/banking/transfers?transfer_id=")) {
    failures.push("resolveEntityRoute(transfer) must deep-link transfers");
  }
  if (!entity.includes("/banking/transactions?txn_id=")) {
    failures.push("resolveEntityRoute(bank_transaction) must deep-link transactions");
  }
  if (!entity.includes("`/vendors/${id}`") && !entity.includes("/vendors/${id}")) {
    failures.push("resolveEntityRoute(vendor) must use /vendors/:id");
  }
  if (!entity.includes("`/customers/${id}`") && !entity.includes("/customers/${id}")) {
    failures.push("resolveEntityRoute(customer) must use /customers/:id");
  }

  if (!match.includes("EntityLink")) {
    failures.push("MatchDrawer must EntityLink candidates");
  }
  if (!design.includes("payment:") || !design.includes("bill_payment:") || !design.includes("transfer:")) {
    failures.push("DesignView MATCH_CANDIDATE kinds must include payment/bill_payment/transfer");
  }
  if (!transfers.includes("transfer_id")) {
    failures.push("TransfersListPage must honor transfer_id deep link (reverse)");
  }

  // Production banking services: reject RETIRE bank.* writes in banking module source
  // (tests may still mention bank.* for legacy — scan only non-test .ts under banking/).
  const bankingDir = path.join(root, "apps/backend/src/banking");
  if (fs.existsSync(bankingDir)) {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "__tests__" || ent.name === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!ent.name.endsWith(".ts") || ent.name.endsWith(".test.ts")) continue;
        const src = fs.readFileSync(full, "utf8");
        if (/\b(INSERT INTO|UPDATE|DELETE FROM)\s+bank\./i.test(src)) {
          failures.push(`${path.relative(root, full)} writes RETIRE bank.* — use banking.*`);
        }
      }
    };
    walk(bankingDir);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bank-surfaces-cp-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  mk(
    FILES.categorize,
    `categorization_vendor_id\ncategorization_customer_id\nLEFT JOIN mdata.vendors\nLEFT JOIN mdata.customers\n`
  );
  mk(FILES.bulk, `categorization_vendor_id\n`);
  mk(
    FILES.entity,
    `| "vendor"\n| "customer"\n"payment"\n"bill_payment"\n"transfer"\n"bank_transaction"\n/banking/transfers?transfer_id=\n/banking/transactions?txn_id=\n\`/vendors/\${id}\`\n\`/customers/\${id}\`\n`
  );
  mk(FILES.match, `EntityLink\n`);
  mk(FILES.design, `payment:\nbill_payment:\ntransfer:\n`);
  mk(FILES.transfers, `transfer_id\n`);
  fs.mkdirSync(path.join(tmp, "apps/backend/src/banking"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "apps/backend/src/banking/ok.ts"), `SELECT * FROM banking.bank_transactions\n`);
  if (run(tmp).length) throw new Error("expected PASS: " + run(tmp).join("; "));

  // memo-only must FAIL
  mk(
    FILES.categorize,
    `categorization_vendor_id\ncategorization_customer_id\nLEFT JOIN mdata.vendors\nLEFT JOIN mdata.customers\ncounterparty = categorization_memo\n`
  );
  if (!run(tmp).length) throw new Error("expected FAIL on memo-only counterparty");

  mk(
    FILES.categorize,
    `categorization_vendor_id\ncategorization_customer_id\nLEFT JOIN mdata.vendors\nLEFT JOIN mdata.customers\n`
  );
  fs.writeFileSync(
    path.join(tmp, "apps/backend/src/banking/bad.ts"),
    `INSERT INTO bank.bank_transactions (id) VALUES (1)\n`
  );
  if (!run(tmp).length) throw new Error("expected FAIL on bank.* write");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-surfaces-and-counterparty --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-bank-surfaces-and-counterparty FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-bank-surfaces-and-counterparty — OK (BANK-LINK-01 structural)");
}
