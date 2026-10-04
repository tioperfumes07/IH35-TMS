#!/usr/bin/env node
// ROUND 389.4 RULING 1 (Lead, 2026-10-04) — THE RECURRING WORKER NEVER POSTS. A timer that moves money has no undo; the
// worker only CREATES the document in its pending state, and the posting happens through that document's own post path
// (which has void and reversal). This guard fails if any recurring worker-path file contains a posting call or a GL write.
// Static, no database. --selftest plants each forbidden form into the create-only shape and must catch every one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-recurring-worker-never-posts";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORKER_PATH = [
  "apps/backend/src/accounting/recurring.worker.ts",
  "apps/backend/src/cron/recurring-templates.cron.ts",
  "apps/backend/src/accounting/bills/recurring/generator.service.ts",
  "apps/backend/src/jobs/recurring-bill-generator-worker.ts",
];
const FORBIDDEN = [
  [/\bpostSourceTransaction(?:InClientTx)?\s*\(/, "calls the posting engine (postSourceTransaction)"],
  [/\bcreateJournalEntry(?:OnClient)?\s*\(/, "creates a journal entry (createJournalEntry)"],
  [/\binsertPostingLines?WithSpine(?:IfNew)?\s*\(/, "writes a posting line (posting-line-writer)"],
  [/\bpostBillGlIfEnabled\s*\(/, "posts a bill's GL (postBillGlIfEnabled)"],
  [/\bcreateBill\s*\(/, "calls createBill(), which auto-posts the bill's GL when BILL_GL_POSTING_ENABLED is on — use createBillInClientTx"],
  [/INSERT\s+INTO\s+accounting\.journal_entr/i, "writes accounting.journal_entries / journal_entry_postings directly"],
  [/INSERT\s+INTO\s+accounting\.(?:expenses|journal_entries)\b[\s\S]{0,1600}?'posted'/i, "creates an expense / journal entry already 'posted' (the pending state is 'draft')"],
];
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1").replace(/^\s*--[^\n]*$/gm, "");
export function violations(src) {
  const code = stripComments(src);
  return FORBIDDEN.filter(([re]) => re.test(code)).map(([, why]) => why);
}

if (process.argv.includes("--selftest")) {
  const clean = `
    async function materializeExpense(client) {
      const ins = await client.query(\`INSERT INTO accounting.expenses (operating_company_id, status) VALUES ($1, 'draft') RETURNING id\`, [oc]);
      // a comment naming postSourceTransaction( or createBill( is not a call
      return ins.rows[0].id;
    }
    const bill = await createBillInClientTx(client, input, actor);`;
  const plants = [
    ["postSourceTransaction", clean + "\nawait postSourceTransaction({ source_transaction_type: 'bill' }, actor);"],
    ["postSourceTransactionInClientTx", clean + "\nawait postSourceTransactionInClientTx(client, x, actor);"],
    ["createJournalEntry", clean + "\nawait createJournalEntry(input, actor);"],
    ["createJournalEntryOnClient", clean + "\nawait createJournalEntryOnClient(client, input, actor);"],
    ["insertPostingLineWithSpine", clean + "\nawait insertPostingLineWithSpineIfNew(client, line);"],
    ["postBillGlIfEnabled", clean + "\nawait postBillGlIfEnabled(oc, billId, { userId });"],
    ["createBill (auto-posting)", clean + "\nconst b = await createBill(input, actor);"],
    ["inline GL INSERT", clean + "\nawait client.query(`INSERT INTO accounting.journal_entry_postings (a) VALUES ($1)`);"],
    ["posted expense", clean.replace("'draft'", "'posted'")],
  ];
  const results = [["create-only shape passes", violations(clean).length === 0]];
  for (const [name, src] of plants) results.push([`planted ${name} is caught`, violations(src).length > 0]);
  for (const [n, ok] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}`);
  const bad = results.filter(([, ok]) => !ok);
  if (bad.length) { console.error(`${LABEL} --selftest FAIL (${bad.length})`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS (${results.length}/${results.length})`);
  process.exit(0);
}

const failures = [];
for (const rel of WORKER_PATH) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { failures.push(`${rel}: worker-path file missing (renamed? update WORKER_PATH — never drop it)`); continue; }
  for (const why of violations(fs.readFileSync(abs, "utf8"))) failures.push(`${rel}: ${why}`);
}
if (failures.length) {
  console.error(`${LABEL}: FAIL — the recurring worker path must only CREATE documents (ROUND 389.4 RULING 1):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${WORKER_PATH.length} worker-path files create documents only; no posting call, no GL write.`);
