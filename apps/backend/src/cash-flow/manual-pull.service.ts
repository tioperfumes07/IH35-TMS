import type { ScopedQueryClient } from "../auth/operating-company-scope.js";
import { BILL_OPEN_BALANCE_SQL } from "../accounting/bills.service.js";
import { openArInvoiceConditions } from "../accounting/aging/open-ar.js";
import { liveExpense, liveBillPayment, openBill } from "../accounting/live-document-predicates.sql.js";
import { createCashForecastEntry } from "../forecast/cash-forecast-entry.service.js";

type Kind = "bill" | "expense" | "payment" | "invoice";
export type PullSource = {
  kind: Kind; id: string; direction: "income" | "expense"; amount_cents: number | string;
  invoice_no: string; party_name: string | null; party_ref_kind: "vendor" | "driver" | "customer" | null;
  party_ref_id: string | null; category: string;
};

/** Full document snapshot, not a paged register. This is NOT an additional GL or
 * bank-cash calculation: the manual worksheet retains its document snapshot semantics. */
export const MANUAL_PULL_SOURCES_SQL = `
 SELECT 'bill'::text AS kind, b.id::text AS id, 'expense'::text AS direction,
        ${BILL_OPEN_BALANCE_SQL}::bigint AS amount_cents,
        COALESCE(NULLIF(b.bill_number,''),b.id::text) AS invoice_no,
        v.vendor_name AS party_name, CASE WHEN v.id IS NOT NULL THEN 'vendor' END AS party_ref_kind,
        v.id::text AS party_ref_id, 'Bill (software)'::text AS category
 FROM accounting.bills b
 LEFT JOIN mdata.vendors v ON v.id::text=COALESCE(b.mdata_vendor_id::text,b.vendor_uuid::text)
   AND v.operating_company_id=b.operating_company_id
 WHERE b.operating_company_id=$1::uuid AND b.bill_date <= $2::date
   AND ${openBill("b", BILL_OPEN_BALANCE_SQL)}
 UNION ALL
 SELECT 'expense',e.id::text,'expense',e.total_amount_cents::bigint,
        COALESCE(NULLIF(e.expense_number,''),e.id::text),
        COALESCE(v.vendor_name,trim(concat_ws(' ',d.first_name,d.last_name))),
        CASE WHEN v.id IS NOT NULL THEN 'vendor' WHEN d.id IS NOT NULL THEN 'driver' END,
        COALESCE(v.id,d.id)::text,'Expense (software)'
 FROM accounting.expenses e
 LEFT JOIN mdata.vendors v ON v.id=e.vendor_uuid AND v.operating_company_id=e.operating_company_id
 LEFT JOIN mdata.drivers d ON d.id=e.driver_uuid AND d.operating_company_id=e.operating_company_id
 WHERE e.operating_company_id=$1::uuid AND e.transaction_date=$2::date
   AND ${liveExpense("e")} AND e.total_amount_cents > 0
 UNION ALL
 SELECT 'payment',bp.id::text,'expense',bp.amount_cents::bigint,
        COALESCE(NULLIF(bp.reference_number,''),NULLIF(bp.check_number,''),bp.id::text),
        v.vendor_name,CASE WHEN v.id IS NOT NULL THEN 'vendor' END,v.id::text,
        'Payment (' || COALESCE(bp.payment_method,'unknown') || ')'
 FROM accounting.bill_payments bp
 LEFT JOIN mdata.vendors v ON v.id::text=bp.vendor_id AND v.operating_company_id=bp.operating_company_id
 WHERE bp.operating_company_id=$1::uuid AND bp.payment_date=$2::date
   AND ${liveBillPayment("bp")} AND bp.settlement_deduction_noncash IS NOT TRUE AND bp.amount_cents > 0
 UNION ALL
 SELECT 'invoice',i.id::text,'income',i.amount_open_cents::bigint,
        COALESCE(NULLIF(i.display_id,''),i.id::text),c.customer_name,
        CASE WHEN c.id IS NOT NULL THEN 'customer' END,c.id::text,'Invoice (software)'
 FROM accounting.invoices i
 LEFT JOIN mdata.customers c ON c.id=i.customer_id AND c.operating_company_id=i.operating_company_id
 WHERE i.operating_company_id=$1::uuid AND i.issue_date <= $2::date
   AND ${openArInvoiceConditions("i").join(" AND ")}
 ORDER BY kind,id`;

export async function readManualPullSources(client: ScopedQueryClient, company: string, date: string) {
  return (await client.query<PullSource>(MANUAL_PULL_SOURCES_SQL, [company, date])).rows;
}

type Existing = { id: string; direction: string; amount_cents: number | string;
  invoice_no: string | null; party_ref_id: string | null; category: string | null; memo: string | null };
const key = (row: { direction: string; invoice_no: string | null; party_ref_id: string | null; category: string | null }) =>
  JSON.stringify([row.direction,row.invoice_no ?? "",row.party_ref_id ?? "",row.category ?? ""]);
const marker = (source: PullSource) => `[transaction:${source.kind}:${source.id}]`;

export function planManualPull(sources: PullSource[], existing: Existing[]) {
  const create: PullSource[] = [], issues: { id: string; reason: string }[] = [];
  const identities = new Set<string>();
  const sourceKeys = new Set(sources.map(key));
  const keyCounts = new Map<string,number>();
  for (const row of sources) keyCounts.set(key(row),(keyCounts.get(key(row)) ?? 0)+1);
  for (const source of sources) {
    const identity = marker(source);
    if (identities.has(identity)) throw new Error("Duplicate source identity in manual pull");
    identities.add(identity);
    const amount = Number(source.amount_cents);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid source amount in manual pull");
    const identified = existing.filter(row => row.memo?.startsWith(identity));
    const legacy = existing.filter(row => !row.memo?.startsWith("[transaction:") && key(row) === key(source));
    if (!identified.length && legacy.length && (keyCounts.get(key(source)) ?? 0) > 1) {
      for (const row of legacy) if (!issues.some(issue => issue.id === row.id)) {
        issues.push({id:row.id,reason:"Ambiguous historical snapshot matches multiple source documents; preserved, requires review"});
      }
      continue;
    }
    const matches = identified.length ? identified : legacy;
    if (!matches.length) create.push(source);
    else for (const row of matches) {
      if (Number(row.amount_cents) !== amount) issues.push({id:row.id,reason:"Snapshot amount differs from current source; preserved"});
      if (matches.length > 1) issues.push({id:row.id,reason:"Duplicate historical snapshot; preserved"});
    }
  }
  for (const row of existing) {
    const sourceMarker = row.memo?.match(/^\[transaction:[^\]]+\]/)?.[0];
    const software = ["Bill (software)","Expense (software)","Invoice (software)"].includes(row.category ?? "") || row.category?.startsWith("Payment (");
    if ((sourceMarker && !identities.has(sourceMarker)) || (!sourceMarker && software && !sourceKeys.has(key(row)))) {
      issues.push({id:row.id,reason:"Prior pulled snapshot not in current live source population; preserved"});
    }
  }
  return {create,issues};
}

/** One scoped caller transaction; a company/date xact lock serializes retries and
 * concurrent pulls. Calls the same audited snapshot writer as hand entry. */
export async function pullManualTransactions(client: ScopedQueryClient, userId: string, company: string, date: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))", [`manual-pull:${company}:${date}`]);
  const existing = (await client.query<Existing>(`SELECT id,direction,amount_cents,invoice_no,party_ref_id,category,memo
    FROM forecast.cash_entries WHERE operating_company_id=$1::uuid AND entry_date=$2::date
    AND deactivated_at IS NULL`, [company,date])).rows;
  const sources = await readManualPullSources(client,company,date);
  const plan = planManualPull(sources,existing);
  const totals = (rows: {direction:string;amount_cents:number|string}[]) => rows.reduce((sum,row) => {
    sum[row.direction === "income" ? "income_cents" : "expense_cents"] += Number(row.amount_cents);
    return sum;
  }, {income_cents:0,expense_cents:0});
  for (const source of plan.create) {
    await createCashForecastEntry(client,userId,{
      operating_company_id:company,entry_date:date,direction:source.direction,amount_cents:Number(source.amount_cents),
      invoice_no:source.invoice_no,party_name:source.party_name,party_ref_kind:source.party_ref_kind,
      party_ref_id:source.party_ref_id,category:source.category,memo:`${marker(source)} Pulled document snapshot`,
    });
  }
  return {created:plan.create.length,source_count:sources.length,issues:plan.issues,
    before:totals(existing),after:totals([...existing,...plan.create]),source_totals:totals(sources)};
}
