#!/usr/bin/env node
/** Banking Full Audit FAIL 25 — Transfer ↔ TMS JE forward + reverse (no new GL math). */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const lookup = fs.readFileSync(`${root}/apps/backend/src/lib/transfer-tms-je-lookup.ts`, "utf8");
  const service = fs.readFileSync(`${root}/apps/backend/src/banking/transfers.service.ts`, "utf8");
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

  if (/\bt\.journal_entry_id\b/.test(service)) {
    failures.push(
      "BANK-F6051 — transfers.service must not JOIN t.journal_entry_id (column does not exist on banking.transfers; TMS JE is attachTransferJournalEntryIds)"
    );
  }
  if (!lookup.includes("journal_entry_postings") || !lookup.includes("source_transaction_type = 'transfer'")) {
    failures.push("transfer-tms-je-lookup must SELECT TMS JE via source_transaction_type=transfer");
  }
  if (!lookup.includes("linked_object_type = 'transfer'")) {
    failures.push("transfer-tms-je-lookup must also try transaction_source_links linked_object_type=transfer");
  }
  if (!/FROM banking\.transfers t[\s\S]*WHERE t\.operating_company_id = \$1::uuid[\s\S]*t\.id = ANY\(\$2::uuid\[\]\)/.test(lookup)) {
    failures.push("transfer JE producer must scope banking.transfers by company and requested transfer ids");
  }
  if (!/FROM accounting\.journal_entries[\s\S]*operating_company_id = \$1::uuid[\s\S]*journal_entry_memo/.test(lookup)) {
    failures.push("transfer JE reverse must resolve a company-scoped human memo");
  }
  const reversalFilterCount = lookup.match(/jep\.reversal_of_line_id IS NULL/g)?.length ?? 0;
  if (reversalFilterCount !== 2) {
    failures.push(
      `transfer-tms-je-lookup must exclude reversal lines in both lookup paths (expected 2, found ${reversalFilterCount})`
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
  if (!routes.includes('import { attachTransferJournalEntryIds } from "../lib/transfer-tms-je-lookup.js";')) {
    failures.push("transfers.routes must enrich list/detail via attachTransferJournalEntryIds");
  }
  if (!/type TransferReverseProjection[\s\S]*journal_entry_memo\?: string \| null[\s\S]*attachTransferJournalReverse/.test(routes)) {
    failures.push("transfers routes must carry the JE human label through list and detail responses");
  }
  const transferType = api.match(/export type Transfer = \{[\s\S]*?\n\};/)?.[0] ?? "";
  if (!transferType.includes("journal_entry_id?: string | null")) {
    failures.push("Transfer type must expose optional journal_entry_id");
  }
  if (!transferType.includes("journal_entry_memo?: string | null")) failures.push("Transfer type must expose journal_entry_memo");
  const journalEntryDrillCount = transfers.match(/kind=["']journal_entry["']/g)?.length ?? 0;
  if (journalEntryDrillCount !== 2) {
    failures.push(`TransfersListPage list and detail must both EntityLink journal_entry (expected 2, found ${journalEntryDrillCount})`);
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
  const files = [
    "apps/backend/src/lib/transfer-tms-je-lookup.ts",
    "apps/backend/src/banking/transfers.service.ts",
    "apps/backend/src/banking/transfers.routes.ts",
    "apps/frontend/src/api/banking.ts",
    "apps/frontend/src/pages/banking/TransfersListPage.tsx",
    "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx",
  ];
  const sources = new Map(files.map((rel) => [rel, fs.readFileSync(`${process.cwd()}/${rel}`, "utf8")]));
  const write = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const reset = () => sources.forEach((body, rel) => write(rel, body));
  reset();
  if (run(tmp).length) throw new Error("production copy must pass: " + run(tmp).join("; "));
  const plants = [
    [files[0], "source_transaction_type = 'transfer'", "source_transaction_type = 'wrong'"],
    [files[1], "FROM banking.transfers t", "FROM banking.transfers t\n        LEFT JOIN accounting.journal_entries je ON je.id = t.journal_entry_id"],
    [files[0], "linked_object_type = 'transfer'", "linked_object_type = 'wrong'"],
    [files[0], "WHERE t.operating_company_id = $1::uuid", "WHERE t.operating_company_id = $9::uuid"],
    [files[0], "WHERE operating_company_id = $1::uuid\n          AND id = ANY($2::uuid[])", "WHERE operating_company_id = $9::uuid\n          AND id = ANY($2::uuid[])"],
    [files[0], "reversal_of_line_id IS NULL", "reversal_of_line_id IS NOT NULL"],
    [files[0], "ORDER BY jep.created_at ASC", "ORDER BY jep.line_sequence ASC"],
    [files[2], "attachTransferJournalEntryIds", "attachWrongJournalEntryIds"],
    [files[2], "journal_entry_memo?: string | null", "journal_entry_caption?: string | null"],
    [files[3], "/** TMS GL journal entry when TRANSFER_GL_POSTING_ENABLED posted (via posting spine). */\n  journal_entry_id?: string | null", "/** TMS GL journal entry when TRANSFER_GL_POSTING_ENABLED posted (via posting spine). */\n  journal_entry_key?: string | null"],
    [files[3], "journal_entry_id?: string | null;\n  journal_entry_memo?: string | null;\n  /** BANK-F12", "journal_entry_id?: string | null;\n  journal_entry_caption?: string | null;\n  /** BANK-F12"],
    [files[4], 'kind="journal_entry"', 'kind="transfer"'],
    [files[4], 'entityLabel(row.journal_entry_memo, row.journal_entry_id, "Journal entry")', 'entityLabel(null, row.journal_entry_id, "Journal entry")'],
    [files[4], "banking-transfer-gl-posting-honesty-banner", "banking-transfer-hidden-banner"],
    [files[4], "transfersQuery.isSuccess", "!transfersQuery.isLoading"],
    [files[5], 'case "transfer":', 'case "wrong-transfer":'],
  ];
  let rejected = 0;
  for (const [rel, needle, replacement] of plants) {
    reset();
    const source = sources.get(rel);
    if (!source.includes(needle)) throw new Error(`plant drift: ${rel} missing ${needle}`);
    write(rel, source.replace(needle, replacement));
    if (!run(tmp).length) throw new Error(`mutation escaped: ${rel} :: ${needle}`);
    rejected += 1;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`verify-banking-transfer-je-reverse SELFTEST PASS — ${rejected}/${plants.length} production defects rejected`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-transfer-je-reverse — OK");
}
