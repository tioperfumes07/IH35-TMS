#!/usr/bin/env node
/** Banking Full Audit FAIL 26 — bank-feed GL posting honesty + JE link on categorized row. */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const route = fs.readFileSync(`${root}/apps/backend/src/banking/categorization.routes.ts`, "utf8");
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const view = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`,
    "utf8"
  );
  const jeDetail = fs.readFileSync(
    `${root}/apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx`,
    "utf8"
  );

  if (!route.includes("matched_journal_entry_id::text AS matched_journal_entry_id")) {
    failures.push("categorization-links route must expose matched_journal_entry_id");
  }
  if (!api.includes("matched_journal_entry_id: string | null")) {
    failures.push("BankCategorizationLinks type must include matched_journal_entry_id");
  }
  if (!view.includes("banking-bank-feed-gl-posting-honesty-banner")) {
    failures.push("BankingTransactionsDesignView must show BANK_FEED_GL_POSTING_ENABLED honesty banner");
  }
  if (!view.includes("BANK_FEED_GL_POSTING_ENABLED")) {
    failures.push("honesty banner must name BANK_FEED_GL_POSTING_ENABLED");
  }
  if (!view.includes("transactionsQuery.isSuccess")) {
    failures.push("GL honesty banner must gate on transactionsQuery.isSuccess (not !isLoading)");
  }
  if (!view.includes("border-l-4 border-slate-400 bg-slate-100")) {
    failures.push("honesty banner must use slate palette (border-l-4 border-slate-400 bg-slate-100)");
  }
  if (!view.includes('kind="journal_entry"') && !view.includes("kind='journal_entry'")) {
    failures.push("expanded categorization panel must EntityLink journal_entry when matched_journal_entry_id present");
  }
  if (!view.includes("bank-tx-categorization-je-link")) {
    failures.push("categorization panel JE link must have bank-tx-categorization-je-link testid");
  }
  if (!view.includes("matched_journal_entry_id")) {
    failures.push("categorization panel must read matched_journal_entry_id from links or row");
  }
  if (!jeDetail.includes('case "bank_categorization":') || !jeDetail.includes('return "bank_transaction"')) {
    failures.push("JournalEntryDetailPage postingEntityKind must map bank_categorization → bank_transaction");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-bank-feed-gl-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/backend/src/banking/categorization.routes.ts",
    "matched_journal_entry_id::text AS matched_journal_entry_id\n"
  );
  mk("apps/frontend/src/api/banking.ts", "matched_journal_entry_id: string | null;\n");
  mk(
    "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    `transactionsQuery.isSuccess\nborder-l-4 border-slate-400 bg-slate-100\nbanking-bank-feed-gl-posting-honesty-banner\nBANK_FEED_GL_POSTING_ENABLED\nkind="journal_entry"\nbank-tx-categorization-je-link\nmatched_journal_entry_id\n`
  );
  mk(
    "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx",
    `case "bank_categorization":\n      return "bank_transaction";\n`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-bank-feed-gl-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-bank-feed-gl-honesty — OK");
}
