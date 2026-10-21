#!/usr/bin/env node
/**
 * verify-relay-fill-expense-settlement-ref — Lead 443.51 #5 (CC-2, 2026-10-11).
 * A Relay-fill expense document (one accounting.expenses row adopting the fill's own journal entry) names the settlement that
 * posted the fill: settlement_no + source_settlement_ref.
 * STATIC:
 *   RULE 1 — settlement-creator.service.ts passes settlement_no to adoptRelayFillExpenseDocument.
 *   RULE 2 — adoptRelayFillExpenseDocument writes it through fillRelayFillExpenseSettlementRef (new and existing documents),
 *            and fillRelayFillExpenseSettlementRef is fill-once for a LIVE reference (coalesce — never overwrites one).
 *   RULE 3 — owner law 443.52 B: the fill never writes a settlement number on an expense with no load.
 *   RULE 4 — LEAD 443.121 #3: the ENGINE stamps it when a receipt document lands on a load ONE live settlement already
 *            holds (stampReceiptDocumentSettlementRef: adoption without a Creator number, both paths; same predicate as
 *            the live check; exactly one holder; the Creator's reference source_document_ref ?? display_id).
 *   RULE 5 — LEAD 443.203 (19:52Z, 5845): a STALE reference (no live settlement by that reference holds the document's load —
 *            the fill was carried to another settlement's load, or the named settlement was cancelled) is restamped, the old
 *            reference audited — ONLY when the carrying settlement asks (restamp_stale, the Creator for a fill it prints),
 *            never from who holds the load (ruling 443.203 #3: unprinted fills on a held load are not that settlement's).
 *            7 Relay documents on 5845's loads still said cancelled P-0072 because the fill was coalesce-only.
 *   RULE 6 — LEAD 443.203 (20:22Z, ruling #3): the load-holder stamp names a settlement only when it PRINTED the fill — its own
 *            posted audit (settlement_creator.posted) names the document (expense_ids) or a fuel row of the fill
 *            (fuel_transaction_ids). Before, it named any single live holder of the load (unprinted T170 fills -> 5846).
 *   RULE 7 — LEAD 22:25Z #1 (root of the 23 receipts): the only backfill (backfillRelayFillSettlementRefs) goes through the
 *            printed-by stamp, and the 443.51 backfill script runs it — it never selects "the settlement holding the load".
 * LIVE (read-only, USMCA): Relay-fill documents with settlement_no NULL whose load is held by exactly ONE live settlement that
 *   posted the document (its settlement_creator.posted expense_ids — ruling 443.203 #3: unprinted fills on a held load are not it)
 *   <= CEILING (shrink-only; lowered to 0 when AUTH-425 is applied); and (RULE 5) Relay-fill documents whose settlement
 *   document named in a live settlement's own posted audit (expense_ids) that names another settlement <= STALE_CEILING
 *   (32 on prod 2026-10-21 before the 443.203 run).
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
  if (!/settlement_no = CASE WHEN \$4::boolean THEN \$3 ELSE coalesce\(settlement_no, \$3\) END/.test(fill) || !/source_settlement_ref = CASE WHEN \$5::boolean THEN \$3 ELSE coalesce\(source_settlement_ref, \$3\) END/.test(fill)) f.push(`RULE 2 ${DOC}: the settlement reference is not fill-once for a live reference`);
  if (!/const restampNo = await stale\(cur\.settlement_no\)/.test(fill) || !/const restampRef = await stale\(cur\.source_settlement_ref\)/.test(fill) || !/!\(await settlementRefHoldsLoad\(/.test(fill))
    f.push(`RULE 5 ${DOC}: a reference naming no live settlement that holds the document's load is not restamped (443.203)`);
  if (!/input\.restamp_stale === true && ref !== null/.test(fill)) f.push(`RULE 5 ${DOC}: a restamp must be asked for by the carrying settlement (restamp_stale), never inferred from the load's holder`);
  if (/restamp_stale/.test(doc.slice(doc.indexOf("export async function stampReceiptDocumentSettlementRef("), doc.indexOf("export async function adoptRelayFillExpenseDocument(")))) f.push(`RULE 5 ${DOC}: the load-holder stamp must never restamp (ruling 443.203 #3)`);
  if (!/relay_fill_settlement_ref_restamped/.test(fill) || !/old_settlement_no: cur\.settlement_no/.test(fill)) f.push(`RULE 5 ${DOC}: a restamp must audit the old reference`);
  const stamp6 = doc.slice(doc.indexOf("export async function stampReceiptDocumentSettlementRef("), doc.indexOf("export async function adoptRelayFillExpenseDocument("));
  if (!/a\.event_class = 'driver_finance\.settlement_creator\.posted' AND a\.payload->>'resource_id' = s\.id::text/.test(stamp6)
      || !/a\.payload->'expense_ids' \? doc\.id::text/.test(stamp6) || !/a\.payload->'fuel_transaction_ids' \?\| ARRAY\(SELECT id FROM fill_rows\)/.test(stamp6))
    f.push(`RULE 6 ${DOC}: the load-holder stamp must name only a settlement that printed the fill (its posted expense_ids / fuel_transaction_ids — ruling 443.203 #3)`);
  const BACKFILL = "scripts/ops/2026-10-11-cc2-443-51-relay-fill-expense-settlement-ref.ts";
  const bf = doc.slice(doc.indexOf("export async function backfillRelayFillSettlementRefs("), doc.indexOf("export async function adoptRelayFillExpenseDocument("));
  if (!/await stampReceiptDocumentSettlementRef\(client, \{/.test(bf)) f.push(`RULE 7 ${DOC}: backfillRelayFillSettlementRefs must name a settlement only through the printed-by stamp`);
  const script = readOpt(BACKFILL);
  if (script !== null && (!/await backfillRelayFillSettlementRefs\(client as never/.test(script) || /driver_settlement_gl_bills|fillRelayFillExpenseSettlementRef\(/.test(script)))
    f.push(`RULE 7 ${BACKFILL}: the 443.51 backfill must run backfillRelayFillSettlementRefs, never pick the settlement holding the load`);
  const holds = doc.slice(doc.indexOf("async function settlementRefHoldsLoad("), doc.indexOf("export async function stampReceiptDocumentSettlementRef("));
  if (!/s\.voided_at IS NULL AND s\.status <> 'cancelled'/.test(holds) || !/settlement_lines sl WHERE sl\.load_id = \$3::uuid/.test(holds) || !/driver_settlement_gl_bills/.test(holds))
    f.push(`RULE 5 ${DOC}: the live-holder test must use the live check's settlement predicate (live, gl_bills or lines by load)`);
  const carry = creator.indexOf("await carryFuelReceiptToLoad(client as never, {");
  const after = carry < 0 ? "" : creator.slice(carry, carry + 2200);
  if (!/fillRelayFillExpenseSettlementRef\(client as never, \{\s*operating_company_id: draft\.operating_company_id,\s*expense_id: fillDoc\.expense_id,[\s\S]{0,160}restamp_stale: true/.test(after))
    f.push(`RULE 5 ${CREATOR}: after carrying a Relay fill to its load, the Creator must re-name the document's settlement (443.203)`);
  if (!/AND load_id IS NOT NULL/.test(fill)) f.push(`RULE 3 ${DOC}: a settlement number can be written on an expense with no load (owner law 443.52 B)`);
  if ((adopt.match(/stampReceiptDocumentSettlementRef\(client/g) ?? []).length < 2) f.push(`RULE 4 ${DOC}: adoption without a Creator number does not stamp the holding settlement on both a new and an existing document (443.121 #3)`);
  const stamp = doc.slice(doc.indexOf("export async function stampReceiptDocumentSettlementRef("), doc.indexOf("export async function adoptRelayFillExpenseDocument("));
  if (!/driver_settlement_gl_bills/.test(stamp) || !/settlement_lines sl WHERE sl\.load_id = doc\.load_id/.test(stamp)) f.push(`RULE 4 ${DOC}: the stamp does not use the live check's settlement predicate`);
  if (!/row\.n !== 1/.test(stamp)) f.push(`RULE 4 ${DOC}: the stamp must name a settlement only when exactly ONE live settlement holds the load`);
  if (!/COALESCE\(NULLIF\(btrim\(s\.source_document_ref\), ''\), s\.display_id\)/.test(stamp)) f.push(`RULE 4 ${DOC}: the stamp must use the Creator's reference (source_document_ref ?? display_id)`);
  return f;
}
export const STALE_CEILING = 0; // 443.203: 34 -> 0
// RULE 6 live: Relay documents naming a settlement that did not print them. 25 on prod 2026-10-21 20:30Z: 2 cleared by the
// 443.203 runner (P-0071 / P-0080), 23 by the 443.206 runner (Lead 21:25Z GO) → 0.
export const UNPRINTED_CEILING = 0;
export const judge = (n, stale = 0, unprinted = 0) => [
  ...(unprinted > UNPRINTED_CEILING ? [`RULE 6: ${unprinted} Relay-fill expense documents name a settlement that did not print them — ceiling ${UNPRINTED_CEILING} (shrink-only)`] : []),
  ...(n > CEILING ? [`${n} Relay-fill expense documents name no settlement although one live settlement holds their load — ceiling ${CEILING}`] : []),
  ...(stale > STALE_CEILING ? [`RULE 5: ${stale} Relay-fill expense documents posted by a live settlement name another settlement (stale / cancelled) — ceiling ${STALE_CEILING}`] : []),
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
function readOpt(rel) { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } }
if (process.argv.includes("--selftest")) {
  const c = read(CREATOR), d = read(DOC);
  const cases = [
    ["shipped tree passes", check(c, d).length === 0],
    ["Creator without the settlement number fails", check(c.replace("settlement_no: sourceDocumentRef ?? displayId", ""), d).some((x) => x.startsWith("RULE 1"))],
    ["adoption that never writes it fails", check(c, d.replace(/fillRelayFillExpenseSettlementRef\(client/g, "noop(client")).some((x) => x.startsWith("RULE 2"))],
    ["an overwriting fill fails", check(c, d.replace("ELSE coalesce(settlement_no, $3) END", "ELSE $3 END")).some((x) => x.startsWith("RULE 2"))],
    ["a coalesce-only fill (stale reference kept) fails", check(c, d.replace("const restampNo = await stale(cur.settlement_no)", "const restampNo = false")).some((x) => x.startsWith("RULE 5"))],
    ["a restamp without the old reference in the audit fails", check(c, d.replace("old_settlement_no: cur.settlement_no", "x: 1")).some((x) => x.startsWith("RULE 5"))],
    ["a holder test that counts a cancelled settlement fails", check(c, d.replace("s.voided_at IS NULL AND s.status <> 'cancelled'\n          AND (COALESCE", "s.voided_at IS NULL\n          AND (COALESCE")).some((x) => x.startsWith("RULE 5"))],
    ["a backfill that names the load holder fails", check(c, d.replace("const ref = await stampReceiptDocumentSettlementRef(client, {", "const ref = await holderOf(client, {")).some((x) => x.startsWith("RULE 7"))],
    ["a restamp inferred without the carrying settlement fails", check(c, d.replace("input.restamp_stale === true && ref !== null", "ref !== null")).some((x) => x.startsWith("RULE 5"))],
    ["a load-holder stamp that restamps fails", check(c, d.replace("settlement_no: row.ref, actor_user_uuid: input.actor_user_uuid ?? null });", "settlement_no: row.ref, actor_user_uuid: input.actor_user_uuid ?? null, restamp_stale: true });")).some((x) => x.startsWith("RULE 5"))],
    ["a Creator that never re-names after the carry fails", check(c.replace(/(\/\/ LEAD 443\.203[\s\S]*?)await fillRelayFillExpenseSettlementRef\(client as never, \{/, "$1void ({"), d).some((x) => x.startsWith("RULE 5"))],
    ["a fill without the load requirement fails", check(c, d.replace("AND load_id IS NOT NULL", "")).some((x) => x.startsWith("RULE 3"))],
    ["over the ceiling fails", judge(CEILING + 1).length === 1 && judge(CEILING).length === 0],
    ["a stamp that names any holder of the load (not the printer) fails", check(c, d.replace("AND (a.payload->'expense_ids' ? doc.id::text", "AND (true")).some((x) => x.startsWith("RULE 6"))],
    ["a stamp without the printed test fails", check(c, d.replace("a.payload->'fuel_transaction_ids' ?| ARRAY(SELECT id FROM fill_rows)", "true")).some((x) => x.startsWith("RULE 6"))],
    ["unprinted over the ceiling fails", judge(0, 0, UNPRINTED_CEILING + 1).length === 1 && judge(0, 0, UNPRINTED_CEILING).length === 0],
    ["a stale reference over the ceiling fails", judge(0, STALE_CEILING + 1).length === 1 && judge(0, STALE_CEILING).length === 0],
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
                    OR s.id IN (SELECT sl.settlement_id FROM driver_finance.settlement_lines sl WHERE sl.load_id = e.load_id))) = 1
       -- ruling 443.203 #3: an unprinted fill on a held load is not that settlement's — only a document a live settlement posted counts.
       AND EXISTS (SELECT 1 FROM audit.audit_events a JOIN driver_finance.driver_settlements s2 ON s2.id::text = a.payload->>'resource_id'
                    WHERE a.event_class = 'driver_finance.settlement_creator.posted' AND s2.voided_at IS NULL AND s2.status <> 'cancelled'
                      AND a.payload->'expense_ids' ? e.id::text)`, [USMCA]);
  const st = await c.query(`
    WITH posted AS (
      SELECT DISTINCT x.v AS expense_id, COALESCE(NULLIF(btrim(s.source_document_ref), ''), s.display_id) AS ref
        FROM audit.audit_events a CROSS JOIN LATERAL jsonb_array_elements_text(a.payload->'expense_ids') x(v)
        JOIN driver_finance.driver_settlements s ON s.id::text = a.payload->>'resource_id'
       WHERE a.event_class = 'driver_finance.settlement_creator.posted' AND s.operating_company_id = $1::uuid
         AND s.voided_at IS NULL AND s.status <> 'cancelled')
    SELECT count(DISTINCT e.id)::int AS n FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid JOIN posted p ON p.expense_id = e.id::text
     WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)'
       AND e.settlement_no IS DISTINCT FROM p.ref`, [USMCA]);
  const up = await c.query(`
    SELECT count(*)::int AS n FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid
     WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)' AND e.settlement_no IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM driver_finance.driver_settlements s JOIN audit.audit_events a
             ON a.event_class = 'driver_finance.settlement_creator.posted' AND a.payload->>'resource_id' = s.id::text
          WHERE s.operating_company_id = e.operating_company_id AND s.voided_at IS NULL AND s.status <> 'cancelled'
            AND COALESCE(NULLIF(btrim(s.source_document_ref), ''), s.display_id) = e.settlement_no
            AND (a.payload->'expense_ids' ? e.id::text
                 OR a.payload->'fuel_transaction_ids' ?| ARRAY(
                      SELECT ft.id::text FROM fuel.fuel_transactions ft
                       WHERE ft.operating_company_id = e.operating_company_id AND ft.voided_at IS NULL
                         AND (ft.id = e.source_fuel_transaction_id
                              OR ft.id::text IN (SELECT p.source_transaction_id::text FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')
                              OR ft.relay_fuel_transaction_id::text IN (SELECT p.source_transaction_id::text FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')))))`, [USMCA]);
  await c.query("ROLLBACK");
  const n = r.rows[0].n;
  const stale = st.rows[0].n;
  const unprinted = up.rows[0].n;
  const bad = judge(n, stale, unprinted);
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${n} Relay-fill documents without their settlement (ceiling ${CEILING}), ${stale} with a stale settlement (ceiling ${STALE_CEILING}), ${unprinted} naming a settlement that did not print them (ceiling ${UNPRINTED_CEILING}), shrink-only`);
  process.exit(0);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
