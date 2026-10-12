#!/usr/bin/env node
/**
 * verify-relay-fill-expense-settlement-ref — Lead 443.51 #5 (CC-2, 2026-10-11).
 * A Relay-fill expense document (one accounting.expenses row adopting the fill's own journal entry) names the settlement that
 * posted the fill: settlement_no + source_settlement_ref.
 * STATIC:
 *   RULE 1 — settlement-creator.service.ts passes settlement_no to adoptRelayFillExpenseDocument.
 *   RULE 2 — adoptRelayFillExpenseDocument writes it through fillRelayFillExpenseSettlementRef (new and existing documents),
 *            and fillRelayFillExpenseSettlementRef is fill-once (coalesce — never overwrites).
 *   RULE 3 — owner law 443.52 B: the fill never writes a settlement number on an expense with no load.
 *   RULE 4 — LEAD 443.121 #3: the ENGINE stamps it when a receipt document lands on a load ONE live settlement already
 *            holds (stampReceiptDocumentSettlementRef: adoption without a Creator number, both paths; same predicate as
 *            the live check; exactly one holder; the Creator's reference source_document_ref ?? display_id).
 * LIVE (read-only, USMCA): Relay-fill documents with settlement_no NULL whose load is held by exactly ONE live settlement
 *   <= CEILING (shrink-only; lowered to 0 when AUTH-425 is applied).
 * --selftest plants each regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRES_LIVE_DB = "counts Relay-fill expense documents without their settlement";
const LABEL = "verify-relay-fill-expense-settlement-ref";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATOR = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const DOC = "apps/backend/src/fuel/fuel-expense-document.service.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const CEILING = 0; // AUTH-425 applied 2026-10-11: 141 -> 0

export function check(creator, doc) {
  const f = [];
  const call = creator.slice(creator.indexOf("adoptRelayFillExpenseDocument(client"), creator.indexOf("adoptRelayFillExpenseDocument(client") + 600);
  if (!/settlement_no:\s*sourceDocumentRef \?\? displayId/.test(call)) f.push(`RULE 1 ${CREATOR}: the Creator does not pass its settlement number when it adopts a Relay fill`);
  const adopt = doc.slice(doc.indexOf("export async function adoptRelayFillExpenseDocument("));
  if ((adopt.match(/fillRelayFillExpenseSettlementRef\(client/g) ?? []).length < 2) f.push(`RULE 2 ${DOC}: adoption does not write the settlement on both a new and an existing document`);
  const fill = doc.slice(doc.indexOf("export async function fillRelayFillExpenseSettlementRef("), doc.indexOf("export async function adoptRelayFillExpenseDocument("));
  if (!/settlement_no = coalesce\(settlement_no, \$3\)/.test(fill) || !/source_settlement_ref = coalesce\(source_settlement_ref, \$3\)/.test(fill)) f.push(`RULE 2 ${DOC}: the settlement reference is not fill-once`);
  if (!/AND load_id IS NOT NULL/.test(fill)) f.push(`RULE 3 ${DOC}: a settlement number can be written on an expense with no load (owner law 443.52 B)`);
  if ((adopt.match(/stampReceiptDocumentSettlementRef\(client/g) ?? []).length < 2) f.push(`RULE 4 ${DOC}: adoption without a Creator number does not stamp the holding settlement on both a new and an existing document (443.121 #3)`);
  const stamp = doc.slice(doc.indexOf("export async function stampReceiptDocumentSettlementRef("), doc.indexOf("export async function adoptRelayFillExpenseDocument("));
  if (!/driver_settlement_gl_bills/.test(stamp) || !/settlement_lines sl WHERE sl\.load_id = doc\.load_id/.test(stamp)) f.push(`RULE 4 ${DOC}: the stamp does not use the live check's settlement predicate`);
  if (!/row\.n !== 1/.test(stamp)) f.push(`RULE 4 ${DOC}: the stamp must name a settlement only when exactly ONE live settlement holds the load`);
  if (!/COALESCE\(NULLIF\(btrim\(s\.source_document_ref\), ''\), s\.display_id\)/.test(stamp)) f.push(`RULE 4 ${DOC}: the stamp must use the Creator's reference (source_document_ref ?? display_id)`);
  return f;
}
export const judge = (n) => (n > CEILING ? [`${n} Relay-fill expense documents name no settlement although one live settlement holds their load — ceiling ${CEILING}`] : []);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
if (process.argv.includes("--selftest")) {
  const c = read(CREATOR), d = read(DOC);
  const cases = [
    ["shipped tree passes", check(c, d).length === 0],
    ["Creator without the settlement number fails", check(c.replace("settlement_no: sourceDocumentRef ?? displayId", ""), d).some((x) => x.startsWith("RULE 1"))],
    ["adoption that never writes it fails", check(c, d.replace(/fillRelayFillExpenseSettlementRef\(client/g, "noop(client")).some((x) => x.startsWith("RULE 2"))],
    ["an overwriting fill fails", check(c, d.replace("settlement_no = coalesce(settlement_no, $3)", "settlement_no = $3")).some((x) => x.startsWith("RULE 2"))],
    ["a fill without the load requirement fails", check(c, d.replace("AND load_id IS NOT NULL", "")).some((x) => x.startsWith("RULE 3"))],
    ["over the ceiling fails", judge(CEILING + 1).length === 1 && judge(CEILING).length === 0],
    ["adoption that never stamps the holding settlement fails", check(c, d.replace(/stampReceiptDocumentSettlementRef\(client/g, "noop(client")).some((x) => x.startsWith("RULE 4"))],
    ["a stamp that picks one of several settlements fails", check(c, d.replace("row.n !== 1", "row.n < 1")).some((x) => x.startsWith("RULE 4"))],
    ["a stamp on another predicate fails", check(c, d.replace("settlement_lines sl WHERE sl.load_id = doc.load_id", "settlement_lines sl WHERE true")).some((x) => x.startsWith("RULE 4"))],
  ];
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, ok]) => !ok).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}
const fails = check(read(CREATOR), read(DOC));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = await c.query(`
    SELECT count(*)::int AS n FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid
     WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)' AND e.settlement_no IS NULL
       AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')
       AND (SELECT count(DISTINCT s.id) FROM driver_finance.driver_settlements s
             WHERE s.operating_company_id = e.operating_company_id AND s.voided_at IS NULL AND s.status <> 'cancelled'
               AND (s.id IN (SELECT g.settlement_id FROM driver_finance.driver_settlement_gl_bills g JOIN mdata.loads l ON l.load_number = g.load_number AND l.operating_company_id = g.operating_company_id WHERE l.id = e.load_id)
                    OR s.id IN (SELECT sl.settlement_id FROM driver_finance.settlement_lines sl WHERE sl.load_id = e.load_id))) = 1`, [USMCA]);
  await c.query("ROLLBACK");
  const n = r.rows[0].n;
  const bad = judge(n);
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${n} Relay-fill documents without their settlement (ceiling ${CEILING}, shrink-only)`);
  process.exit(0);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
