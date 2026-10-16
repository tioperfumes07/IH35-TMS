#!/usr/bin/env node
/**
 * verify-invoice-void-frees-number — LEAD 443.151 (b) (owner ruling option 3; standing rule: invoice # = the number
 * submitted to Faro, "<Faro Inv>-<Load>").
 *
 * apps/backend/src/accounting/invoice-number-release.service.ts must:
 *   1. release a number ONLY from a VOID invoice (status 'void' + voided_at), never a live one, never twice;
 *   2. rename it "<number>-V<n>" with an UPDATE guarded by voided_at IS NOT NULL — never a DELETE (WORM);
 *   3. write the accounting.invoice_number_released audit row carrying the original number;
 *   4. voidAndReissueLoadInvoice: Owner-only, refuses paid / factored / unsent, voids through voidDocument (reversal JE),
 *      releases, mints through buildInvoiceFromLoad and issues through sendDraftInvoice — no hand-written GL.
 * db/migrations/202615960910_invoice_void_frees_number.sql must accept "-V<n>" ONLY on status = 'void' rows.
 * Run: node scripts/verify-invoice-void-frees-number.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-void-frees-number";
const SERVICE = "apps/backend/src/accounting/invoice-number-release.service.ts";
const MIGRATION = "db/migrations/202615960910_invoice_void_frees_number.sql";

export function check(svc, sql) {
  const p = [];
  const rel = svc.slice(svc.indexOf("export async function releaseVoidedInvoiceNumber("), svc.indexOf("export type VoidAndReissueResult"));
  if (!/if \(!row\.voided_at \|\| row\.status !== "void"\) throw/.test(rel)) p.push(`${SERVICE}: a number may be released only from a VOID invoice.`);
  if (!/RELEASED_SUFFIX\.test\(row\.display_id\)\) throw/.test(rel)) p.push(`${SERVICE}: an already-released number must be refused.`);
  if (!/UPDATE accounting\.invoices SET display_id = \$3[\s\S]{0,200}AND voided_at IS NOT NULL/.test(rel)) p.push(`${SERVICE}: the rename must be an UPDATE guarded by voided_at IS NOT NULL.`);
  if (/DELETE\s+FROM\s+accounting\.invoices/i.test(svc)) p.push(`${SERVICE}: never DELETE an invoice (WORM).`);
  if (!/INVOICE_NUMBER_RELEASED_EVENT, \{[\s\S]{0,200}original_display_id: row\.display_id/.test(rel)) p.push(`${SERVICE}: the release must be audited with the original number.`);
  const re = svc.slice(svc.indexOf("export async function voidAndReissueLoadInvoice("));
  if (!/if \(input\.actorRole !== "Owner"\) throw/.test(re)) p.push(`${SERVICE}: void-and-reissue is Owner-only.`);
  if (!/if \(inv\.paid !== 0\) throw/.test(re) || !/if \(inv\.fs !== "not_factored"\) throw/.test(re)) p.push(`${SERVICE}: paid / factored invoices must be refused.`);
  for (const call of ["await voidDocument(", "await releaseVoidedInvoiceNumber(", "await buildInvoiceFromLoad(", "await sendDraftInvoice("]) {
    if (!re.includes(call)) p.push(`${SERVICE}: voidAndReissueLoadInvoice must go through ${call.replace("await ", "").replace("(", "")}.`);
  }
  if (!/latch_earned_\$\{earned\.amount\}_not_\$\{newTotal\}/.test(re) || !/STANDING_LATCH_JE_PREDICATE/.test(re)) p.push(`${SERVICE}: an amount change on a latch-recognized load must be refused (A/R would stay at the earned amount).`);
  if (/INSERT INTO accounting\.journal_entr/i.test(svc)) p.push(`${SERVICE}: no hand-written GL — the engines post.`);
  if (!/status = 'void'\s+AND display_id ~ '\^\(INV-/.test(sql)) p.push(`${MIGRATION}: the "-V<n>" shape must be accepted only on status = 'void' rows.`);
  return p;
}

const svc = readFileSync(join(ROOT, SERVICE), "utf8");
const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
if (process.argv.includes("--selftest")) {
  const planted = [
    ["release from a live invoice", svc.replace('if (!row.voided_at || row.status !== "void") throw', "if (false) throw"), sql],
    ["double release", svc.replace("RELEASED_SUFFIX.test(row.display_id)) throw", "false) throw"), sql],
    ["no audit", svc.replace("original_display_id: row.display_id, released_display_id", "released_display_id"), sql],
    ["non-Owner reissue", svc.replace('if (input.actorRole !== "Owner") throw', "if (false) throw"), sql],
    ["skips voidDocument", svc.replace("await voidDocument(", "await (async (..._a: unknown[]) => ({ reversalJournalEntryId: null }))("), sql],
    ["-V on live rows", svc, sql.replace("status = 'void'\n    AND display_id", "TRUE\n    AND display_id")],
    ["latch amount change not refused", svc.replace("latch_earned_${earned.amount}_not_${newTotal}", "latch_ok"), sql],
  ];
  let caught = 0;
  for (const [name, s, q] of planted) {
    if (check(s, q).length) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted "${name}" NOT caught`);
  }
  const clean = check(svc, sql).length === 0;
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught; clean source ${clean ? "passes" : "FAILS"}`);
  process.exit(caught === planted.length && clean ? 0 : 1);
}
const problems = check(svc, sql);
if (problems.length) {
  console.error(`${LABEL} FAIL\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — only a void invoice releases its number ("-V<n>", audited, WORM), the reissue goes through the engines, Owner-only.`);
