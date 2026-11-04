#!/usr/bin/env node
// ACCT-F11101 — OWNER (Jorge, 11-04-2026 08:44 CT): "7-ok folow qb". THE QUICKBOOKS RULE: a SENT invoice is never rewritten.
// A correction is a CREDIT MEMO against it, so the original and the correction both stay on record.
//
// Measured on main fa8ad0df01 before the fix: every invoice amount writer was already limited to draft / proforma, but the
// refusal said only "invoice_not_draft" (nothing pointed at a correction), the credit memo could not name the invoice it
// corrects (accounting.credit_memos.related_invoice_id existed, no writer set it), create + apply were two separate calls,
// a factored invoice's credit memo was not linked to its Faro purchase, and a later Faro short-pay row for that invoice
// could only be written down a SECOND time (or refused short_pay_exceeds_invoice_open_balance). Prod USMCA: 0 credit memos,
// 183 sent invoices (57 on a live Faro purchase line).
//
// Checks (static, every one planted in --selftest):
//   1. PATCH /invoices/:id and every line writer (ensureDraftInvoice) refuse a non-draft with invoiceNotDraftMessage, whose
//      text names "Create credit memo"; the line routes forward the message.
//   2. RATCHET — the only files that rewrite invoice totals (recomputeInvoiceTotals) or insert invoice lines are the known
//      writers, each carrying its draft / proforma / new-document gate. A new writer FAILS until it is gated and listed.
//   3. The load-rate re-sync stays limited to draft / proforma.
//   4. The credit memo create route takes related_invoice_id, refuses a bad target BEFORE the INSERT, writes
//      related_invoice_id, posts through the posting engine, applies through THE apply service, and links a factored invoice.
//   5. No Faro posting is invented: credit-memo-from-invoice.service.ts writes no journal entry / Faro / factoring row, and the
//      short-pay link-to-existing-credit-memo path posts no journal entry.
//   6. UI: a sent invoice shows "Create credit memo" (prefilled customer + invoice) and the edit-refused note; the credit
//      memo drawer sends related_invoice_id + apply_to_invoice.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-sent-invoice-corrected-by-credit-memo";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const B = "apps/backend/src";
const F = {
  invoicesRoutes: `${B}/accounting/invoices.routes.ts`,
  lineCreate: `${B}/accounting/invoice-line-create.ts`,
  lineRoutes: `${B}/accounting/invoice-lines.routes.ts`,
  resync: `${B}/accounting/resync-proforma-from-load-rate.ts`,
  cmRoutes: `${B}/accounting/credit-memos.routes.ts`,
  cmFromInvoice: `${B}/accounting/credit-memo-from-invoice.service.ts`,
  cmApply: `${B}/accounting/credit-memo-apply.service.ts`,
  shortPay: `${B}/factoring/short-pay-resolution.service.ts`,
  invoiceDetail: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
  cmPage: "apps/frontend/src/pages/accounting/CreditMemosPage.tsx",
  cmApi: "apps/frontend/src/api/credit-memos.ts",
};

// Check 2 — every invoice total / line writer and the gate text that limits it (draft / proforma / a brand-new document).
export const KNOWN_INVOICE_AMOUNT_WRITERS = {
  [`${B}/accounting/invoice-line-create.ts`]: /String\(invoice\.status\) !== "draft"/,
  [`${B}/accounting/invoice-lines.routes.ts`]: /ensureDraftInvoice\(/,
  [`${B}/accounting/db-scope.ts`]: /recomputeInvoiceTotals/, // the definition itself
  [`${B}/accounting/invoices-bulk.routes.ts`]: /String\(oldRow\.status\) !== "draft"/,
  [`${B}/accounting/from-load.ts`]: /asProforma \? "proforma" : "draft"/,
  [`${B}/accounting/recurring.worker.ts`]: /'draft'/,
  [`${B}/accounting/resync-proforma-from-load-rate.ts`]: /i\.status IN \('draft', 'proforma'\)/,
  [`${B}/accounting/invoice-send.service.ts`]: /invoice_not_draft/,
  [`${B}/dispatch/cancellation-tonu-invoice.ts`]: /'draft'/,
  [`${B}/feed/seed-settlement-document.service.ts`]: /'proforma'/,
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

export function failures(read, writerFiles) {
  const f = [];
  const src = (k) => read(F[k]) ?? "";
  // 1
  const msgSvc = src("cmFromInvoice");
  if (!/export const INVOICE_NOT_DRAFT_MESSAGE[\s\S]{0,300}Create credit memo/.test(msgSvc)) f.push("INVOICE_NOT_DRAFT_MESSAGE must name \"Create credit memo\"");
  if (!/String\(oldRow\.status\) !== "draft"\) return \{ code: 409 as const, error: "invoice_not_draft", message: invoiceNotDraftMessage\(/.test(src("invoicesRoutes"))) f.push("PATCH /invoices/:id must refuse a non-draft with invoiceNotDraftMessage");
  if (!/error: "invoice_not_draft", message: invoiceNotDraftMessage\(String\(invoice\.status\)\)/.test(src("lineCreate"))) f.push("ensureDraftInvoice must refuse a non-draft with invoiceNotDraftMessage");
  if ((src("lineRoutes").match(/ensureDraftInvoice\(/g) ?? []).length < 2 || !/createInvoiceLineInClientTx\(/.test(src("lineRoutes"))) f.push("invoice line PATCH / DELETE must call ensureDraftInvoice and POST must go through createInvoiceLineInClientTx");
  if ((src("lineRoutes").match(/\.\.\.\("message" in result && result\.message/g) ?? []).length < 3) f.push("the invoice line routes must forward the refusal message (all 3)");
  // 2
  for (const file of writerFiles) {
    const gate = KNOWN_INVOICE_AMOUNT_WRITERS[file];
    if (!gate) f.push(`${file}: rewrites invoice totals / inserts invoice lines but is not a known gated writer — limit it to draft / proforma and list it`);
    else if (!gate.test(read(file) ?? "")) f.push(`${file}: lost its draft / proforma gate`);
  }
  // 3
  if (!/i\.status IN \('draft', 'proforma'\)/.test(src("resync"))) f.push("the load-rate re-sync must stay limited to draft / proforma");
  // 4
  const cm = src("cmRoutes");
  const create = cm.match(/app\.post\("\/api\/v1\/accounting\/credit-memos",[\s\S]*?\n {2}\}\);/)?.[0] ?? "";
  if (!/related_invoice_id: z\.string\(\)\.trim\(\)\.uuid\(\)\.optional\(\)/.test(cm)) f.push("credit memo create must accept related_invoice_id");
  const refuseAt = create.indexOf("creditMemoTargetInvoiceRefusal(");
  const insertAt = create.indexOf("INSERT INTO accounting.credit_memos");
  if (refuseAt < 0 || insertAt < 0 || refuseAt > insertAt) f.push("credit memo create must refuse a bad target invoice BEFORE the INSERT");
  if (!/account_id, related_invoice_id\)/.test(create)) f.push("credit memo create must write related_invoice_id");
  if (!/postSourceTransactionInClientTx\(/.test(create)) f.push("credit memo create must post through the posting engine");
  if (!/applyCreditMemoToInvoicesInClientTx\(/.test(create)) f.push("credit memo create must apply through THE apply service");
  if (!/recordFactoredInvoiceCreditMemoLink\(/.test(create)) f.push("credit memo create must link a factored invoice to its Faro purchase");
  if (!/FOR UPDATE/.test(src("cmApply"))) f.push("the apply service must lock the credit memo FOR UPDATE");
  // 5
  if (/createJournalEntry|INSERT INTO accounting\.(journal_entr|faro_reserve|factoring)/.test(msgSvc)) f.push("credit-memo-from-invoice.service.ts must not post: no journal entry / Faro / factoring row is invented");
  const link = src("shortPay").match(/async function linkShortPayToExistingCreditMemo[\s\S]*?\n\}/)?.[0] ?? "";
  if (!link) f.push("short-pay resolution must link an existing credit memo (linkShortPayToExistingCreditMemo)");
  else if (/createJournalEntryOnClient|INSERT INTO accounting\.credit_memos/.test(link)) f.push("the short-pay link-to-credit-memo path must post nothing and mint no second credit memo");
  // 6
  const ui = src("invoiceDetail");
  if (!/Create credit memo/.test(ui) || !/invoice_id: String\(invoice\.id\)/.test(ui) || !/data-testid="invoice-sent-edit-refused"/.test(ui)) f.push("a sent invoice must show \"Create credit memo\" (prefilled invoice) and the edit-refused note");
  if (!/related_invoice_id: fromInvoiceId, apply_to_invoice: createApplyToInvoice/.test(src("cmPage"))) f.push("the credit memo drawer must send related_invoice_id + apply_to_invoice");
  if (!/related_invoice_id\?: string; apply_to_invoice\?: boolean/.test(src("cmApi"))) f.push("createCreditMemo must carry related_invoice_id + apply_to_invoice");
  return f;
}

function liveWriterFiles() {
  return walk(path.join(ROOT, B))
    .filter((p) => {
      const s = fs.readFileSync(p, "utf8");
      return /recomputeInvoiceTotals\(|INSERT INTO accounting\.invoice_lines/.test(s);
    })
    .map((p) => path.relative(ROOT, p).split(path.sep).join("/"));
}
const liveRead = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null);

if (process.argv.includes("--selftest")) {
  const base = {};
  for (const rel of [...Object.values(F), ...Object.keys(KNOWN_INVOICE_AMOUNT_WRITERS)]) base[rel] = liveRead(rel);
  const writers = liveWriterFiles();
  const clean = failures((r) => base[r], writers);
  if (clean.length) { console.error(`${LABEL} SELFTEST: live tree must pass first: ${clean.join(" | ")}`); process.exit(1); }
  const plant = (name, file, from, to, extraWriters = []) => {
    const s = base[file] ?? "";
    const mutated = typeof from === "string" ? s.replace(from, to) : s.replace(from, to);
    if (mutated === s && !extraWriters.length) { console.error(`${LABEL} SELFTEST: plant "${name}" did not apply`); process.exit(1); }
    const got = failures((r) => (r === file ? mutated : base[r]), [...writers, ...extraWriters]);
    if (!got.length) { console.error(`${LABEL} SELFTEST: plant "${name}" was NOT caught`); process.exit(1); }
    console.log(`  caught: ${name}`);
  };
  plant("PATCH silently refuses (no credit-memo message)", F.invoicesRoutes, /error: "invoice_not_draft", message: invoiceNotDraftMessage\(String\(oldRow\.status\)\)/, 'error: "invoice_not_draft"');
  plant("line writer edits a SENT invoice (draft gate removed)", F.lineCreate, 'String(invoice.status) !== "draft"', 'String(invoice.status) === "void"');
  plant("refusal text stops naming the credit memo", F.cmFromInvoice, '"This invoice has been sent, so its amount and lines cannot be edited. Use \\"Create credit memo\\"', '"Not editable."; const _x = "');
  plant("new ungated invoice amount writer", F.cmPage, "", "", [`${B}/accounting/rogue-invoice-editor.ts`]);
  plant("re-sync rewrites sent invoices", F.resync, "i.status IN ('draft', 'proforma')", "i.status IN ('draft', 'proforma', 'sent')");
  plant("target check after the INSERT", F.cmRoutes, /const refusal = await creditMemoTargetInvoiceRefusal\(/, "const refusal = await creditMemoTargetCheckLater(");
  plant("create no longer applies through THE apply service", F.cmRoutes, /const applied = await applyCreditMemoToInvoicesInClientTx\(/, "const applied = await rawApply(");
  plant("factored invoice not linked to Faro", F.cmRoutes, /credit\.factoring = await recordFactoredInvoiceCreditMemoLink\(/, "credit.factoring = await nothing(");
  plant("invented Faro posting", F.cmFromInvoice, "export async function recordFactoredInvoiceCreditMemoLink(", "const x = `INSERT INTO accounting.faro_reserve_entries`;\nexport async function recordFactoredInvoiceCreditMemoLink(");
  plant("short-pay writes the shortfall down a second time", F.shortPay, /async function linkShortPayToExistingCreditMemo\(([\s\S]*?)const legs = /, "async function linkShortPayToExistingCreditMemo($1await createJournalEntryOnClient(client, {});\n  const legs = ");
  plant("UI keeps no Create credit memo", F.invoiceDetail, 'data-testid="invoice-sent-edit-refused"', 'data-testid="x"');
  plant("drawer drops related_invoice_id", F.cmPage, "related_invoice_id: fromInvoiceId, apply_to_invoice: createApplyToInvoice", "x: 1");
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const out = failures(liveRead, liveWriterFiles());
if (out.length) {
  console.error(`${LABEL} FAIL:\n  - ${out.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — sent invoices are refused with the credit-memo message; ${Object.keys(KNOWN_INVOICE_AMOUNT_WRITERS).length} gated amount writers; credit memo from invoice posts once, applies through THE apply, links Faro without posting`);
