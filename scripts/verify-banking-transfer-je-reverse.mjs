#!/usr/bin/env node
/** Banking Full Audit FAIL 25 — Transfer ↔ TMS JE forward + reverse (no new GL math). */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const service = fs.readFileSync(`${root}/apps/backend/src/banking/transfers.service.ts`, "utf8");
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const transfers = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/TransfersListPage.tsx`,
    "utf8"
  );
  const jeDetail = fs.readFileSync(
    `${root}/apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx`,
    "utf8"
  );

  if (!service.includes("journal_entry_id") || !service.includes("source_transaction_type = 'transfer'")) {
    failures.push("listTransfers/getTransferDetail must join TMS JE via source_transaction_type=transfer");
  }
  if (!service.includes("linked_object_type = 'transfer'")) {
    failures.push("transfer JE lookup must also try transaction_source_links linked_object_type=transfer");
  }
  if (!api.includes("journal_entry_id?:") && !api.includes("journal_entry_id?: string")) {
    failures.push("Transfer type must expose optional journal_entry_id");
  }
  if (!transfers.includes('kind="journal_entry"') && !transfers.includes("kind='journal_entry'")) {
    failures.push("TransfersListPage must EntityLink journal_entry when journal_entry_id present");
  }
  if (!transfers.includes("banking-transfer-gl-posting-honesty-banner")) {
    failures.push("TransfersListPage must show TRANSFER_GL_POSTING_ENABLED honesty banner");
  }
  if (!transfers.includes("transfersQuery.isSuccess")) {
    failures.push("GL honesty banner must gate on transfersQuery.isSuccess (not !isLoading)");
  }
  if (!jeDetail.includes('case "transfer":') || !jeDetail.includes('return "transfer"')) {
    failures.push("JournalEntryDetailPage postingEntityKind must map transfer → EntityKind transfer");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-transfer-je-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/backend/src/banking/transfers.service.ts",
    `journal_entry_id\nsource_transaction_type = 'transfer'\nlinked_object_type = 'transfer'\n`
  );
  mk("apps/frontend/src/api/banking.ts", `journal_entry_id?: string | null;\n`);
  mk(
    "apps/frontend/src/pages/banking/TransfersListPage.tsx",
    `kind="journal_entry"\nbanking-transfer-gl-posting-honesty-banner\ntransfersQuery.isSuccess\n`
  );
  mk(
    "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx",
    `case "transfer":\n      return "transfer";\n`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/TransfersListPage.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-transfer-je-reverse --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-transfer-je-reverse — OK");
}
