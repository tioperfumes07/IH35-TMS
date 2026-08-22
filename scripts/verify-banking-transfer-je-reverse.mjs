#!/usr/bin/env node
/** Banking Full Audit FAIL 25 — Transfer ↔ TMS JE forward + reverse (no new GL math). */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const lookup = fs.readFileSync(`${root}/apps/backend/src/lib/transfer-tms-je-lookup.ts`, "utf8");
  const routes = fs.readFileSync(`${root}/apps/backend/src/banking/transfers.routes.ts`, "utf8");
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const transfers = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/TransfersListPage.tsx`,
    "utf8"
  );
  const jeDetail = fs.readFileSync(
    `${root}/apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx`,
    "utf8"
  );

  if (!lookup.includes("journal_entry_postings") || !lookup.includes("source_transaction_type = 'transfer'")) {
    failures.push("transfer-tms-je-lookup must SELECT TMS JE via source_transaction_type=transfer");
  }
  if (!lookup.includes("linked_object_type = 'transfer'")) {
    failures.push("transfer-tms-je-lookup must also try transaction_source_links linked_object_type=transfer");
  }
  if (!/FROM accounting\.journal_entries[\s\S]*operating_company_id = \$1::uuid[\s\S]*journal_entry_memo/.test(lookup)) {
    failures.push("transfer JE reverse must resolve a company-scoped human memo");
  }
  if (!lookup.includes("reversal_of_line_id IS NULL")) {
    failures.push(
      "transfer-tms-je-lookup must exclude reversal lines (reversal_of_line_id IS NULL) so revoke does not land JE drill on the reversing entry"
    );
  }
  if (!lookup.includes("ORDER BY jep.created_at ASC") && !lookup.includes("ORDER BY jep.created_at ASC, jep.line_sequence ASC")) {
    failures.push(
      "transfer-tms-je-lookup must ORDER BY created_at (not line_sequence alone) for deterministic original-JE selection"
    );
  }
  if (/ORDER BY jep\.line_sequence ASC\s*\n\s*LIMIT 1/.test(lookup) && !lookup.includes("reversal_of_line_id IS NULL")) {
    failures.push("forbidden: ORDER BY line_sequence LIMIT 1 without excluding reversal lines");
  }
  if (!routes.includes("attachTransferJournalEntryIds") || !routes.includes("transfer-tms-je-lookup")) {
    failures.push("transfers.routes must enrich list/detail via attachTransferJournalEntryIds");
  }
  if (!/type TransferReverseProjection[\s\S]*journal_entry_memo\?: string \| null[\s\S]*attachTransferJournalReverse/.test(routes)) {
    failures.push("transfers routes must carry the JE human label through list and detail responses");
  }
  if (!api.includes("journal_entry_id?:") && !api.includes("journal_entry_id?: string")) {
    failures.push("Transfer type must expose optional journal_entry_id");
  }
  if (!api.includes("journal_entry_memo?:")) failures.push("Transfer type must expose journal_entry_memo");
  if (!transfers.includes('kind="journal_entry"') && !transfers.includes("kind='journal_entry'")) {
    failures.push("TransfersListPage must EntityLink journal_entry when journal_entry_id present");
  }
  if (!/entityLabel\(row\.journal_entry_memo, row\.journal_entry_id, "Journal entry"\)/.test(transfers)) {
    failures.push("TransfersListPage must label the JE drill with its resolved memo");
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
    "apps/backend/src/lib/transfer-tms-je-lookup.ts",
    `journal_entry_postings\nsource_transaction_type = 'transfer'\nlinked_object_type = 'transfer'\nreversal_of_line_id IS NULL\nORDER BY jep.created_at ASC, jep.line_sequence ASC\nFROM accounting.journal_entries\noperating_company_id = $1::uuid\njournal_entry_memo\n`
  );
  mk(
    "apps/backend/src/banking/transfers.routes.ts",
    `attachTransferJournalEntryIds\ntransfer-tms-je-lookup\ntype TransferReverseProjection = { journal_entry_memo?: string | null };\nattachTransferJournalReverse\n`
  );
  mk("apps/frontend/src/api/banking.ts", `journal_entry_id?: string | null;\njournal_entry_memo?: string | null;\n`);
  mk(
    "apps/frontend/src/pages/banking/TransfersListPage.tsx",
    `kind="journal_entry"\nentityLabel(row.journal_entry_memo, row.journal_entry_id, "Journal entry")\nbanking-transfer-gl-posting-honesty-banner\ntransfersQuery.isSuccess\n`
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
