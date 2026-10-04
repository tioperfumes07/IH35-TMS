/**
 * RECLASSIFY TRANSACTIONS ENGINE (Lead, 2026-10-01) — owner QBO spec §24 ("very important to build,
 * follow for the batch transactions"). QBO Tools → Reclassify: filter GL lines → select many → change
 * account / class / vendor → every document updated and re-posted, audit per document, undo per batch.
 *
 * IH35 ledger law: postings are never edited or deleted (WORM). So a reclassification is ONE
 * RECLASSIFICATION journal entry per source document, carrying for each selected posting a PAIR of
 * lines: the old side reversed (same account/class/entity, opposite dr/cr) and the new side posted
 * (target account/class/entity, same dr/cr). Net by account moves exactly the amount; the original JE
 * stays intact and linked. The source document line (expense_lines / bill_lines) is rewritten so the
 * document and the ledger agree; when it cannot be (no 1:1 line, or a bill's vendor — A/P subledger),
 * the batch line says so in document_update_note instead of pretending. Closed period → refused.
 * Undo = reverse every reclass JE of the batch (reverseJournalEntryNoFlip) + restore document lines.
 *
 * Linkage declaration (TRANSACTION-LINKAGE-LAW): reclassify_batches → identity.users (actor),
 * catalogs.accounts / catalogs.classes (targets); reclassify_batch_lines → journal_entry_postings
 * (posting_id), journal_entries (original + reclass + undo), the source document by
 * source_transaction_type/id/line_id (expense / bill / invoice / …), catalogs.accounts, catalogs.classes,
 * entity (vendor / customer / driver / unit). Reverse: the reclass JE's postings carry
 * source_transaction_type/id of the ORIGINAL document, so a document's ledger drill shows the
 * reclassification; audit.audit_events one row per document per batch.
 */
import { withCurrentUser } from "../../auth/db.js";
import { createJournalEntryOnClient, reverseJournalEntryNoFlip } from "../journal-entries.service.js";
import { PostingEngineError } from "../posting-engine.service.js";
import { writeTransactionSourceLink } from "../accounting-spine-emit.js";
import { syncReeferFuelForExpenseLine } from "../../fuel/reefer-fuel.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export type ReclassifyLineFilter = {
  operating_company_id: string;
  from_date: string;
  to_date: string;
  account_ids?: string[];
  source_types?: string[];
  class_id?: string | null;
  entity_uuid?: string | null;
  search?: string | null;
  /** ROUND 368.1 by-item / by-load selectors — the item on the document line, the load on the posting (or its line). */
  item_ids?: string[];
  load_ids?: string[];
  class_ids?: string[];
  unit_ids?: string[];
  driver_ids?: string[];
  trailer_ids?: string[];
  vendor_ids?: string[];
  /** ROUND 363-CC2-D — the lines of these documents only (the settlement wizard's just-posted documents). */
  source_transaction_ids?: string[];
  /** ROUND 370.3 sortable headers — whitelisted keys only (see LINE_SORT). */
  sort_key?: string | null;
  sort_dir?: "asc" | "desc" | null;
  limit?: number;
  offset?: number;
};

export type ReclassifyLineRow = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  source_transaction_line_id: string | null;
  document_number: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  account_type?: string | null;
  account_subtype?: string | null;
  system_purpose?: string | null;
  is_bank_ledger?: boolean;
  class_id: string | null;
  class_name: string | null;
  location_id: string | null;
  location_name: string | null;
  entity_uuid: string | null;
  entity_type: string | null;
  entity_name: string | null;
  description: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  /** signed: debit positive, credit negative — QBO's NET AMOUNT on an expense account */
  net_amount_cents: number;
  already_reclassified_batch_id: string | null;
  /** ROUND 370 — every posting behind the balance is listed; these say why one cannot be reclassified. */
  is_reversed: boolean;
  is_reversal: boolean;
  /** U22 — the source document was purged (its number comes from the audit trail); drill to the journal entry. */
  document_purged?: boolean;
  item_id: string | null;
  item_name: string | null;
  load_id: string | null;
  load_number: string | null;
  unit_id: string | null;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  trailer_id: string | null;
  trailer_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  debit_cents: number;
  credit_cents: number;
  /** opening balance of the matched accounts before from_date + every matched row up to and including this one, in date order */
  running_balance_cents: number;
};

export function buildLineWhere(filter: ReclassifyLineFilter, values: unknown[]): string {
  // ROUND 370 — the SAME predicate accounting.fn_account_balances_as_of sums, so the listed rows ARE the balance. The
  // old filter hid reversed / reversal lines on the premise that they net to zero; inside a date window they do not
  // (USMCA 9000 showed 2,837.33 with every row hidden). They are listed, flagged, and refused at apply instead.
  const where: string[] = [
    `p.operating_company_id = $1::uuid`,
    `je.status <> 'voided'`,
    `(p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))`,
    `je.entry_date BETWEEN $2::date AND $3::date`,
  ];
  if (filter.account_ids?.length) {
    values.push(filter.account_ids);
    where.push(`p.account_id = ANY($${values.length}::uuid[])`);
  }
  if (filter.source_types?.length) {
    values.push(filter.source_types);
    where.push(`coalesce(p.source_transaction_type, 'journal_entry') = ANY($${values.length}::text[])`);
  }
  if (filter.class_id) {
    values.push(filter.class_id);
    where.push(`p.class_id = $${values.length}::uuid`);
  }
  if (filter.class_ids?.length) {
    values.push(filter.class_ids);
    where.push(`p.class_id = ANY($${values.length}::uuid[])`);
  }
  if (filter.entity_uuid) {
    values.push(filter.entity_uuid);
    where.push(`p.entity_uuid = $${values.length}::uuid`);
  }
  if (filter.item_ids?.length) {
    values.push(filter.item_ids);
    where.push(`dl.item_id = ANY($${values.length}::uuid[])`);
  }
  if (filter.load_ids?.length) {
    values.push(filter.load_ids);
    where.push(`COALESCE(p.load_id, dl.load_id) = ANY($${values.length}::uuid[])`);
  }
  // ROUND 370 (owner) — every shown column filters, multi-select.
  for (const [key, col] of [["unit_ids", "dim.unit_id"], ["driver_ids", "dim.driver_id"], ["trailer_ids", "dim.trailer_id"], ["vendor_ids", "dim.vendor_id"]] as const) {
    const ids = filter[key];
    if (ids?.length) {
      values.push(ids);
      where.push(`${col} = ANY($${values.length}::uuid[])`);
    }
  }
  if (filter.source_transaction_ids?.length) {
    values.push(filter.source_transaction_ids);
    where.push(`p.source_transaction_id::text = ANY($${values.length}::text[])`);
  }
  if (filter.search && filter.search.trim()) {
    values.push(`%${filter.search.trim()}%`);
    where.push(`(p.description ILIKE $${values.length} OR je.memo ILIKE $${values.length})`);
  }
  return where.join("\n          AND ");
}

/**
 * The posting's source document id as uuid — NULL when it is not one. A document key compared as text
 * (x.id::text = p.source_transaction_id) cannot use the primary-key index: on a fiscal-year window every per-row lookup
 * became a scan (48 s for USMCA's year). Compare uuid to uuid.
 */
const SRC_DOC_UUID = `(CASE WHEN length(p.source_transaction_id) = 36 AND p.source_transaction_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN p.source_transaction_id::uuid END)`;

/** The postings + their entry + batch + the document line (item, load) — shared by the count, the list and apply. */
const LINE_FROM = `
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
          LEFT JOIN accounting.posting_batches pb ON pb.id = p.posting_batch_id AND pb.operating_company_id = p.operating_company_id
          LEFT JOIN LATERAL (
            -- ROUND 370 (owner): the truck / unit, driver, trailer and vendor of the line, from the document line first and
            -- its header second. Postings carry only entity_uuid, so these live on the documents. Keys compare as uuid (a
            -- text cast of the key defeated the primary-key index: 26 s for a month's facets); a non-uuid id matches nothing.
            SELECT el.item_id, el.load_id, COALESCE(el.unit_id, e.unit_id) AS unit_id, COALESCE(el.driver_id, e.driver_uuid) AS driver_id,
                   COALESCE(el.trailer_id, e.trailer_id) AS trailer_id, e.vendor_uuid AS vendor_id
              FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id
             WHERE p.source_transaction_type = 'expense' AND el.id = (CASE WHEN length(p.source_transaction_line_id) = 36 AND p.source_transaction_line_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN p.source_transaction_line_id::uuid END)
            UNION ALL
            SELECT bl.item_id, bl.load_id, COALESCE(bl.unit_id, b.unit_id), b.driver_id, COALESCE(bl.equipment_id, b.trailer_id), b.mdata_vendor_id
              FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id
             WHERE p.source_transaction_type = 'bill' AND bl.id = (CASE WHEN length(p.source_transaction_line_id) = 36 AND p.source_transaction_line_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN p.source_transaction_line_id::uuid END)
            UNION ALL
            SELECT il.item_id, il.source_load_id, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid FROM accounting.invoice_lines il
             WHERE p.source_transaction_type = 'invoice' AND il.id = (CASE WHEN length(p.source_transaction_line_id) = 36 AND p.source_transaction_line_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN p.source_transaction_line_id::uuid END)
            UNION ALL
            SELECT NULL::uuid, ft.load_id, ft.unit_id, ft.driver_id, ft.trailer_id, ft.vendor_id FROM fuel.fuel_transactions ft
             WHERE p.source_transaction_type = 'fuel_event' AND ft.id = (CASE WHEN length(p.source_transaction_id) = 36 AND p.source_transaction_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN p.source_transaction_id::uuid END)
            UNION ALL
            SELECT NULL::uuid, NULL::uuid, NULL::uuid, ds.driver_id, NULL::uuid, NULL::uuid FROM driver_finance.driver_settlements ds
             WHERE p.source_transaction_type = 'driver_settlement' AND ds.id = (CASE WHEN length(p.source_transaction_id) = 36 AND p.source_transaction_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN p.source_transaction_id::uuid END)
            LIMIT 1
          ) dl ON true
          LEFT JOIN LATERAL (
            SELECT COALESCE(dl.unit_id, CASE WHEN p.entity_type = 'unit' THEN p.entity_uuid END) AS unit_id,
                   COALESCE(dl.driver_id, CASE WHEN p.entity_type = 'driver' THEN p.entity_uuid END) AS driver_id,
                   dl.trailer_id AS trailer_id,
                   COALESCE(dl.vendor_id, CASE WHEN p.entity_type = 'vendor' THEN p.entity_uuid END) AS vendor_id
          ) dim ON true`;

const LINE_SELECT = `
        SELECT p.id::text AS posting_id,
               p.journal_entry_uuid::text AS journal_entry_id,
               je.entry_date::text AS entry_date,
               p.source_transaction_type,
               p.source_transaction_id,
               p.source_transaction_line_id,
               -- U22 (owner): "the expense number is missing". 3,860 USMCA expense postings are the reversal pairs of
               -- expenses later PURGED (REVERSE -> VOID -> PURGE): the document row is gone, so the lookup found nothing.
               -- The number survives in the WORM audit trail (the DELETE row's old_data), so Num shows it, and the line
               -- says it is purged so the drill opens its journal entry instead of a document that no longer exists.
               COALESCE(
                 CASE p.source_transaction_type
                 WHEN 'expense' THEN (SELECT e.expense_number FROM accounting.expenses e WHERE e.id = ${SRC_DOC_UUID})
                 WHEN 'bill' THEN (SELECT coalesce(b.display_id, b.bill_number) FROM accounting.bills b WHERE b.id = ${SRC_DOC_UUID})
                 WHEN 'invoice' THEN (SELECT i.display_id FROM accounting.invoices i WHERE i.id = ${SRC_DOC_UUID})
                 WHEN 'customer_payment' THEN (SELECT py.display_id FROM accounting.payments py WHERE py.id = ${SRC_DOC_UUID})
                 WHEN 'bill_payment' THEN (SELECT NULLIF(btrim(bb.bill_number), '') FROM accounting.bill_payments bp2 JOIN accounting.bills bb ON bb.id = bp2.bill_id WHERE bp2.id = ${SRC_DOC_UUID})
                 WHEN 'driver_settlement' THEN (SELECT s2.display_id FROM driver_finance.driver_settlements s2 WHERE s2.id = ${SRC_DOC_UUID})
                 ELSE NULL END,
                 (SELECT rc.old_data->>(CASE p.source_transaction_type WHEN 'expense' THEN 'expense_number' WHEN 'bill' THEN 'bill_number' ELSE 'display_id' END)
                    FROM audit.row_changes rc
                   WHERE rc.schema_name = 'accounting'
                     AND rc.table_name = CASE p.source_transaction_type WHEN 'expense' THEN 'expenses' WHEN 'bill' THEN 'bills' WHEN 'invoice' THEN 'invoices' END
                     AND rc.op = 'DELETE' AND rc.row_pk = p.source_transaction_id
                   ORDER BY rc.changed_at DESC LIMIT 1)
               ) AS document_number,
               (p.source_transaction_type IN ('expense', 'bill', 'invoice') AND NOT EXISTS (
                  SELECT 1 FROM accounting.expenses x WHERE p.source_transaction_type = 'expense' AND x.id = ${SRC_DOC_UUID}
                  UNION ALL SELECT 1 FROM accounting.bills x WHERE p.source_transaction_type = 'bill' AND x.id = ${SRC_DOC_UUID}
                  UNION ALL SELECT 1 FROM accounting.invoices x WHERE p.source_transaction_type = 'invoice' AND x.id = ${SRC_DOC_UUID}
               )) AS document_purged,
               p.account_id::text AS account_id,
               a.account_number, a.account_name, a.account_type, a.account_subtype, a.system_purpose,
               EXISTS (SELECT 1 FROM banking.bank_accounts ba WHERE ba.ledger_account_id = p.account_id) AS is_bank_ledger,
               p.class_id::text AS class_id, c.class_name,
               p.location_id::text AS location_id, loc.location_name,
               p.entity_uuid::text AS entity_uuid, p.entity_type,
               CASE p.entity_type
                 WHEN 'vendor' THEN (SELECT v.vendor_name FROM mdata.vendors v WHERE v.id = p.entity_uuid)
                 WHEN 'customer' THEN (SELECT cu.customer_name FROM mdata.customers cu WHERE cu.id = p.entity_uuid)
                 WHEN 'driver' THEN (SELECT concat_ws(' ', d.first_name, d.last_name) FROM mdata.drivers d WHERE d.id = p.entity_uuid)
                 WHEN 'unit' THEN (SELECT u.unit_number::text FROM mdata.units u WHERE u.id = p.entity_uuid)
                 ELSE NULL END AS entity_name,
               coalesce(p.description, je.memo) AS description,
               p.debit_or_credit,
               p.amount_cents::bigint AS amount_cents,
               (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint AS net_amount_cents,
               (SELECT rl.batch_id::text FROM accounting.reclassify_batch_lines rl
                  JOIN accounting.reclassify_batches rb ON rb.id = rl.batch_id AND rb.status = 'applied'
                 WHERE rl.posting_id = p.id AND rl.result = 'applied' LIMIT 1) AS already_reclassified_batch_id,
               (p.reversed_by_line_id IS NOT NULL) AS is_reversed,
               (p.reversal_of_line_id IS NOT NULL) AS is_reversal,
               dl.item_id::text AS item_id, it.item_name,
               COALESCE(p.load_id, dl.load_id)::text AS load_id, ld.load_number::text AS load_number,
               dim.unit_id::text AS unit_id, un.unit_number::text AS unit_number,
               dim.driver_id::text AS driver_id, NULLIF(concat_ws(' ', dr.first_name, dr.last_name), '') AS driver_name,
               dim.trailer_id::text AS trailer_id, tr.equipment_number::text AS trailer_number,
               dim.vendor_id::text AS vendor_id, vn.vendor_name,
               (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END)::bigint AS debit_cents,
               (CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END)::bigint AS credit_cents,
               je.entry_date AS sort_date, p.journal_entry_uuid AS sort_je, p.line_sequence AS sort_seq
${LINE_FROM}
          LEFT JOIN catalogs.accounts a ON a.id = p.account_id AND a.operating_company_id = p.operating_company_id
          LEFT JOIN catalogs.items it ON it.id = dl.item_id
          LEFT JOIN mdata.loads ld ON ld.id = COALESCE(p.load_id, dl.load_id)
          LEFT JOIN mdata.units un ON un.id = dim.unit_id
          LEFT JOIN mdata.drivers dr ON dr.id = dim.driver_id
          LEFT JOIN mdata.equipment tr ON tr.id = dim.trailer_id
          LEFT JOIN mdata.vendors vn ON vn.id = dim.vendor_id
          LEFT JOIN catalogs.classes c ON c.id = p.class_id AND c.operating_company_id = p.operating_company_id
          LEFT JOIN mdata.locations loc ON loc.id = p.location_id AND loc.operating_company_id = p.operating_company_id`;

function numberize(r: ReclassifyLineRow): ReclassifyLineRow {
  const { sort_date: _d, sort_je: _j, sort_seq: _q, ...rest } = r as ReclassifyLineRow & { sort_date?: unknown; sort_je?: unknown; sort_seq?: unknown };
  return {
    ...rest,
    amount_cents: Number(r.amount_cents),
    net_amount_cents: Number(r.net_amount_cents),
    debit_cents: Number(r.debit_cents ?? 0),
    credit_cents: Number(r.credit_cents ?? 0),
    running_balance_cents: Number(r.running_balance_cents ?? 0),
  };
}

/** ROUND 370.3 — every column sorts both ways; keys are whitelisted, never interpolated from input. */
export const LINE_SORT: Record<string, string> = {
  date: "sort_date",
  type: "source_transaction_type",
  num: "document_number",
  name: "entity_name",
  memo: "description",
  account: "account_name",
  item: "item_name",
  load: "load_number",
  truck: "unit_number",
  driver: "driver_name",
  trailer: "trailer_number",
  vendor: "vendor_name",
  class: "class_name",
  debit: "debit_cents",
  credit: "credit_cents",
  amount: "net_amount_cents",
  balance: "running_balance_cents",
};

export type ReclassifyFacet = { id: string; label: string; n: number };
export type ReclassifyFacets = Record<"types" | "classes" | "items" | "loads" | "trucks" | "drivers" | "trailers" | "vendors", ReclassifyFacet[]>;

/**
 * ROUND 370 (owner) — the values each register column holds in the window, with their line counts: the options of
 * every multi-select column filter, so every option the owner can pick has rows behind it. Same LINE_FROM and the
 * same balance predicate as the list.
 */
export async function findReclassifyFacets(userId: string, filter: { operating_company_id: string; from_date: string; to_date: string }) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [filter.operating_company_id]);
    const values: unknown[] = [filter.operating_company_id, filter.from_date, filter.to_date];
    const where = buildLineWhere({ operating_company_id: filter.operating_company_id, from_date: filter.from_date, to_date: filter.to_date }, values);
    const res = await client.query<{ facet: string; id: string; label: string | null; n: string }>(
      `WITH x AS (
         SELECT coalesce(p.source_transaction_type, 'journal_entry') AS type_key, p.class_id, dl.item_id,
                COALESCE(p.load_id, dl.load_id) AS load_id, dim.unit_id, dim.driver_id, dim.trailer_id, dim.vendor_id
         ${LINE_FROM}
          WHERE ${where}
       )
       SELECT 'types' AS facet, type_key AS id, type_key AS label, count(*)::text AS n FROM x GROUP BY type_key
       UNION ALL SELECT 'classes', x.class_id::text, c.class_name, count(*)::text FROM x JOIN catalogs.classes c ON c.id = x.class_id GROUP BY x.class_id, c.class_name
       UNION ALL SELECT 'items', x.item_id::text, it.item_name, count(*)::text FROM x JOIN catalogs.items it ON it.id = x.item_id GROUP BY x.item_id, it.item_name
       UNION ALL SELECT 'loads', x.load_id::text, ld.load_number::text, count(*)::text FROM x JOIN mdata.loads ld ON ld.id = x.load_id GROUP BY x.load_id, ld.load_number
       UNION ALL SELECT 'trucks', x.unit_id::text, un.unit_number::text, count(*)::text FROM x JOIN mdata.units un ON un.id = x.unit_id GROUP BY x.unit_id, un.unit_number
       UNION ALL SELECT 'drivers', x.driver_id::text, NULLIF(concat_ws(' ', dr.first_name, dr.last_name), ''), count(*)::text FROM x JOIN mdata.drivers dr ON dr.id = x.driver_id GROUP BY x.driver_id, dr.first_name, dr.last_name
       UNION ALL SELECT 'trailers', x.trailer_id::text, tr.equipment_number::text, count(*)::text FROM x JOIN mdata.equipment tr ON tr.id = x.trailer_id GROUP BY x.trailer_id, tr.equipment_number
       UNION ALL SELECT 'vendors', x.vendor_id::text, vn.vendor_name, count(*)::text FROM x JOIN mdata.vendors vn ON vn.id = x.vendor_id GROUP BY x.vendor_id, vn.vendor_name`,
      values,
    );
    const out: ReclassifyFacets = { types: [], classes: [], items: [], loads: [], trucks: [], drivers: [], trailers: [], vendors: [] };
    for (const r of res.rows) out[r.facet as keyof ReclassifyFacets].push({ id: r.id, label: r.label ?? r.id, n: Number(r.n) });
    for (const k of Object.keys(out) as Array<keyof ReclassifyFacets>) out[k].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return out;
  });
}

export async function findReclassifyLines(userId: string, filter: ReclassifyLineFilter) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [filter.operating_company_id]);
    const values: unknown[] = [filter.operating_company_id, filter.from_date, filter.to_date];
    const where = buildLineWhere(filter, values);
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    const sortCol = LINE_SORT[filter.sort_key ?? "date"] ?? LINE_SORT.date;
    const dir = filter.sort_dir === "asc" ? "ASC" : "DESC";
    // Opening balance of the matched accounts (same predicate, before from_date) — the running balance starts there.
    const openingValues = [...values];
    // $3 stays bound (assertNoUnusedQueryParams): the opening is everything strictly before the window's first day.
    const openingWhere = where.replace("je.entry_date BETWEEN $2::date AND $3::date", "je.entry_date < $2::date AND $2::date <= $3::date");
    const opening = await client.query<{ net: string }>(
      `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS net
         ${LINE_FROM}
        WHERE ${openingWhere}`,
      openingValues,
    );
    const openingCents = Number(opening.rows[0]?.net ?? 0);
    const totals = await client.query<{ n: string; net: string; debit: string; credit: string; reclassifiable: string }>(
      `SELECT count(*)::text AS n,
              coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS net,
              coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::text AS debit,
              coalesce(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::text AS credit,
              count(*) FILTER (WHERE p.reversed_by_line_id IS NULL AND p.reversal_of_line_id IS NULL AND je.status = 'posted')::text AS reclassifiable
         ${LINE_FROM}
        WHERE ${where}`,
      values,
    );
    values.push(openingCents);
    const openingParam = values.length;
    const rows = await client.query<ReclassifyLineRow>(
      `WITH matched AS (
         ${LINE_SELECT}
          WHERE ${where}
       ), ranked AS (
         SELECT m.*,
                ($${openingParam}::bigint + sum(m.net_amount_cents) OVER (ORDER BY m.sort_date, m.sort_je, m.sort_seq, m.posting_id ROWS UNBOUNDED PRECEDING))::bigint AS running_balance_cents
           FROM matched m
       )
       SELECT * FROM ranked
        ORDER BY ${sortCol} ${dir} NULLS LAST, sort_date DESC, sort_je, sort_seq
        LIMIT ${limit} OFFSET ${offset}`,
      values,
    );
    return {
      lines: rows.rows.map(numberize),
      total_lines: Number(totals.rows[0]?.n ?? 0),
      total_net_amount_cents: Number(totals.rows[0]?.net ?? 0),
      total_debit_cents: Number(totals.rows[0]?.debit ?? 0),
      total_credit_cents: Number(totals.rows[0]?.credit ?? 0),
      reclassifiable_lines: Number(totals.rows[0]?.reclassifiable ?? 0),
      opening_cents: openingCents,
      closing_balance_cents: openingCents + Number(totals.rows[0]?.net ?? 0),
      sort_key: Object.keys(LINE_SORT).find((k) => LINE_SORT[k] === sortCol) ?? "date",
      sort_dir: dir.toLowerCase(),
      limit,
      offset,
    };
  });
}

export type ApplyReclassifyInput = {
  operating_company_id: string;
  posting_ids: string[];
  reason: string;
  to_account_id?: string | null;
  to_class_id?: string | null;
  to_location_id?: string | null;
  to_entity_uuid?: string | null;
  to_entity_type?: "customer" | "vendor" | "driver" | "unit" | null;
  /** U24 — move the lines to another ITEM (the account follows the item's own expense account unless to_account_id is
   *  given) and/or another LOAD (the reclass legs are re-stamped old -> new). Expense and bill lines only. */
  to_item_id?: string | null;
  to_load_id?: string | null;
  filter_snapshot?: Record<string, unknown>;
  /** LAW 363.5 — OWNER ONLY: apply the batch to lines in an overridable refused class; each one is recorded and audited. */
  override_refusals?: boolean;
};

export type ReclassifyDocumentResult = {
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  document_number: string | null;
  reclass_journal_entry_id: string | null;
  lines_applied: number;
  lines_refused: number;
  document_updated: boolean;
  document_update_note: string | null;
  refusal_reason: string | null;
};

export type ReclassifyBatchResult = {
  batch_id: string;
  lines_requested: number;
  lines_applied: number;
  lines_refused: number;
  amount_cents_moved: number;
  documents: ReclassifyDocumentResult[];
};

export type SelectedPosting = ReclassifyLineRow & { je_status: string; memo: string | null };

/**
 * CONTROL ACCOUNTS (QBO's own Reclassify rule, made explicit): A/R, A/P, bank, credit card, undeposited
 * funds and the factoring/escrow control accounts are SUBLEDGER-backed — their GL balance must equal
 * the invoices / bills / bank register / reserve ledger that feed them. A reclassification moves
 * CATEGORY lines only; it never moves a line off or onto a control account. A control-account line
 * is refused with the pointer to the document that owns it (void-and-reissue / bank match).
 */
export const CONTROL_SUBTYPE_RE = /accounts\s*receivable|accounts\s*payable|\(a\/r\)|\(a\/p\)|^checking$|^savings$|^bank$|cash\s*on\s*hand|^cashonhand$|credit\s*card|^creditcard$|undeposited\s*funds|^undepositedfunds$/i;
export const CONTROL_PURPOSES = new Set([
  "accounts_receivable", "accounts_payable", "bank_operating", "undeposited_funds", "factoring_ar_assigned", "factoring_reserves",
  "factoring_advance_liability", "faro_factoring_wallet", "relay_fuel_wallet", "driver_escrow_liability", "retained_earnings",
]);
export function controlAccountReason(acc: { account_type: string | null; account_subtype: string | null; system_purpose: string | null; is_bank_ledger?: boolean }): string | null {
  if (acc.is_bank_ledger) return "bank/cash ledger account: the bank register owns this line (match or exclude it in Banking)";
  if (acc.system_purpose && CONTROL_PURPOSES.has(acc.system_purpose)) return `${acc.system_purpose} control account: its subledger owns this line (void-and-reissue the document)`;
  if (acc.account_subtype && CONTROL_SUBTYPE_RE.test(acc.account_subtype)) return `${acc.account_subtype} control account: its subledger owns this line (void-and-reissue the document)`;
  return null;
}

/**
 * LAW 363.5 (ROUND 363-CC1-D) — the batch tool also refuses INVENTORY and PAYROLL lines: an inventory asset is owned by
 * its quantity-on-hand subledger, and a payroll liability (tax payable, direct deposit, clearing) or a payroll-run line by
 * the payroll it came from. Payroll EXPENSE accounts named on ordinary bills (QBO subtype PayrollExpenses — "Wages",
 * "Bonus") stay freely reclassifiable: no subledger owns them.
 */
export const INVENTORY_SUBTYPE_RE = /inventory/i;
export const PAYROLL_LIABILITY_SUBTYPE_RE = /^payroll(?!expenses?$)|payroll\s*(tax|clearing|liabilit)|payrolltaxpayable|directdepositpayable|direct\s*deposit\s*payable/i;
export const PAYROLL_SOURCE_RE = /payroll|paycheck/i;

export type LineRefusal = { reason: string; overridable: boolean };

/**
 * The full refusal for one line or target account, with whether the OWNER may override it (LAW 363.5: "the owner gets
 * an override button on the genuinely refused classes … never silent and never unlogged"). A bank/cash ledger line is
 * never overridable: a payment from the wrong bank is unmatch → fix → rematch in Banking, not a reclassification.
 */
export function lineRefusal(
  acc: { account_type: string | null; account_subtype: string | null; system_purpose: string | null; is_bank_ledger?: boolean },
  sourceTransactionType?: string | null,
): LineRefusal | null {
  if (acc.is_bank_ledger) return { reason: controlAccountReason(acc)!, overridable: false };
  const control = controlAccountReason(acc);
  if (control) return { reason: control, overridable: true };
  if (acc.account_subtype && INVENTORY_SUBTYPE_RE.test(acc.account_subtype)) {
    return { reason: `${acc.account_subtype} account: the inventory subledger owns this line (adjust quantity on hand, not the ledger)`, overridable: true };
  }
  if (acc.account_subtype && PAYROLL_LIABILITY_SUBTYPE_RE.test(acc.account_subtype)) {
    return { reason: `${acc.account_subtype} payroll liability: the payroll run owns this line (correct the paycheck or the payroll liability payment)`, overridable: true };
  }
  if (sourceTransactionType && PAYROLL_SOURCE_RE.test(sourceTransactionType)) {
    return { reason: `${sourceTransactionType} line: a payroll document owns this line (correct the paycheck)`, overridable: true };
  }
  return null;
}

/**
 * ROUND 373 — a reclassify posting is never written without its spine link (accounting.transaction_source_links), on the
 * SAME transaction. Every leg of the entry links to the source document it reclassifies (role 'reclassification'; a
 * hand-keyed JE links to itself) and to the batch that made it (role 'reclassify_batch' / 'reclassify_undo'), so the
 * document's ledger drill and the batch both reach these lines.
 */
async function linkReclassEntry(
  client: DbClient,
  companyId: string,
  journalEntryId: string,
  doc: { type: string; id: string } | null,
  batchId: string,
  role: "reclassification" | "reclassify_undo",
): Promise<number> {
  const legs = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND operating_company_id = $2::uuid`,
    [journalEntryId, companyId],
  );
  for (const leg of legs.rows) {
    if (doc) {
      await writeTransactionSourceLink(client as never, { operating_company_id: companyId, journal_entry_posting_id: leg.id, linked_object_type: doc.type, linked_object_id: doc.id, relationship_role: role });
    }
    await writeTransactionSourceLink(client as never, { operating_company_id: companyId, journal_entry_posting_id: leg.id, linked_object_type: "reclassify_batch", linked_object_id: batchId, relationship_role: role === "reclassification" ? "reclassify_batch" : "reclassify_undo" });
  }
  if (legs.rows.length === 0) throw new Error(`reclassify_entry_has_no_postings:${journalEntryId}`);
  return legs.rows.length;
}

/** Pure: which selected lines are eligible and why the others are not. Unit-tested without a DB. */
export function classifySelection(
  postings: SelectedPosting[],
  target: { to_account_id?: string | null; to_class_id?: string | null; to_location_id?: string | null; to_entity_uuid?: string | null; to_item_id?: string | null; to_load_id?: string | null },
  opts: { overrideRefusals?: boolean } = {},
): { eligible: SelectedPosting[]; refused: Array<{ posting: SelectedPosting; why: string }>; overridden: Map<string, string> } {
  const eligible: SelectedPosting[] = [];
  const refused: Array<{ posting: SelectedPosting; why: string }> = [];
  /** posting_id → the refusal the owner's override bypassed (recorded on the batch line and in the audit). */
  const overridden = new Map<string, string>();
  for (const p of postings) {
    if (p.je_status !== "posted") { refused.push({ posting: p, why: `journal entry is ${p.je_status}` }); continue; }
    if (p.is_reversed) { refused.push({ posting: p, why: "this line was reversed (its document was voided or corrected) — reclassify the live line, not the reversed one" }); continue; }
    if (p.is_reversal) { refused.push({ posting: p, why: "this line is a reversal entry — it is undone by undoing what it reversed, not reclassified" }); continue; }
    if (p.already_reclassified_batch_id) { refused.push({ posting: p, why: `already reclassified in batch ${p.already_reclassified_batch_id}; undo that batch first` }); continue; }
    const control = lineRefusal({ account_type: p.account_type ?? null, account_subtype: p.account_subtype ?? null, system_purpose: p.system_purpose ?? null, is_bank_ledger: p.is_bank_ledger }, p.source_transaction_type);
    if (control && target.to_account_id) {
      if (!(control.overridable && opts.overrideRefusals)) { refused.push({ posting: p, why: control.overridable ? `${control.reason} — the owner may override` : control.reason }); continue; }
      overridden.set(p.posting_id, control.reason);
    }
    // U24 — an item or load lives on a document LINE: only expense and bill lines carry both.
    if ((target.to_item_id || target.to_load_id) && p.source_transaction_type !== "expense" && p.source_transaction_type !== "bill") {
      refused.push({ posting: p, why: `${p.source_transaction_type ?? "journal entry"} lines carry no item / load to move — by item and by load apply to expense and bill lines` });
      continue;
    }
    const noChange =
      (!target.to_account_id || target.to_account_id === p.account_id) &&
      (!target.to_class_id || target.to_class_id === p.class_id) &&
      (!target.to_location_id || target.to_location_id === p.location_id) &&
      (!target.to_entity_uuid || target.to_entity_uuid === p.entity_uuid) &&
      (!target.to_item_id || target.to_item_id === p.item_id) &&
      (!target.to_load_id || target.to_load_id === p.load_id);
    if (noChange) { refused.push({ posting: p, why: "line already carries the requested account/class/location/entity/item/load" }); continue; }
    eligible.push(p);
  }
  return { eligible, refused, overridden };
}

/**
 * A hand-keyed journal entry has no separate document line to rewrite — the reclass JE itself is the record. That is a
 * posting with no source, AND a manual JE that names ITSELF as its source (journal-entries.service stamps every manual
 * line source_transaction_type 'manual_je' / id = the JE): measured 2026-10-03, 46 such lines on production were
 * refused by every reclassify ("manual_je: this document type has no line rewrite") — a manual entry could never be
 * reclassified.
 */
export function isHandKeyed(p: Pick<SelectedPosting, "source_transaction_type" | "source_transaction_id" | "journal_entry_id">): boolean {
  if (!p.source_transaction_type || !p.source_transaction_id) return true;
  return (p.source_transaction_type === "manual_je" || p.source_transaction_type === "journal_entry") && p.source_transaction_id === p.journal_entry_id;
}

/** Pure: the reclass JE lines for one document — a reverse+repost PAIR per selected posting. */
export function buildReclassPairs(
  eligible: SelectedPosting[],
  target: { to_account_id?: string | null; to_class_id?: string | null; to_location_id?: string | null; to_entity_uuid?: string | null; to_entity_type?: string | null; to_item_id?: string | null; to_load_id?: string | null },
  batchId: string,
) {
  return eligible.flatMap((p) => {
    const flip: "debit" | "credit" = p.debit_or_credit === "debit" ? "credit" : "debit";
    const what = [target.to_account_id ? "account" : null, target.to_class_id ? "class" : null, target.to_location_id ? "location" : null, target.to_entity_uuid ? "entity" : null, target.to_item_id ? "item" : null, target.to_load_id ? "load" : null].filter(Boolean).join("/");
    const desc = `Reclass ${batchId.slice(0, 8)} (${what}) · ${p.description ?? ""}`.trim();
    const base = { amount_cents: p.amount_cents, description: desc, source_transaction_type: p.source_transaction_type, source_transaction_id: p.source_transaction_id };
    return [
      // U24 / LAW 363.3 — a load move re-stamps the legs: the reversing leg keeps the line's old load, the repost carries
      // the new one. Without a load move both legs take the stamp from the document (undefined = the writer's default).
      // ROUND 393.2 — the out-leg names the line it undoes (reversal_of_line_id) and the in-leg the document line, so each
      // leg's load stamp is the one its own source resolves to (verify-every-load-born-posting-carries-its-load RULE 2);
      // before, both legs fell back to the document HEADER's load and a load move stamped a load its source contradicted.
      { ...base, account_id: p.account_id, class_id: p.class_id, location_id: p.location_id, entity_uuid: p.entity_uuid, entity_type: p.entity_type, debit_or_credit: flip, load_id: target.to_load_id ? (p.load_id ?? null) : undefined, source_transaction_line_id: p.source_transaction_line_id, reversal_of_line_id: p.posting_id },
      {
        ...base,
        account_id: target.to_account_id ?? p.account_id,
        class_id: target.to_class_id ?? p.class_id,
        location_id: target.to_location_id ?? p.location_id,
        entity_uuid: target.to_entity_uuid ?? p.entity_uuid,
        entity_type: target.to_entity_uuid ? (target.to_entity_type ?? null) : p.entity_type,
        debit_or_credit: p.debit_or_credit,
        load_id: target.to_load_id ?? undefined,
        source_transaction_line_id: p.source_transaction_line_id,
      },
    ];
  });
}

async function loadSelectedPostings(client: DbClient, companyId: string, postingIds: string[]): Promise<SelectedPosting[]> {
  const res = await client.query<SelectedPosting>(
    `${LINE_SELECT.replace("SELECT p.id::text AS posting_id,", "SELECT je.status AS je_status, je.memo, p.id::text AS posting_id,")}
       WHERE p.operating_company_id = $1::uuid AND p.id = ANY($2::uuid[])
       ORDER BY p.journal_entry_uuid, p.line_sequence`,
    [companyId, postingIds],
  );
  return res.rows.map((r) => numberize(r) as SelectedPosting);
}

/** A document whose line cannot follow the ledger: the reclass is refused for that document, nothing moves. */
export class ReclassifyDocumentNotRewritableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReclassifyDocumentNotRewritableError";
  }
}

/** Rewrite the source document line so document and ledger agree. Returns a note when it cannot. */
export async function rewriteDocumentLine(
  client: DbClient,
  companyId: string,
  p: SelectedPosting,
  target: { account_id: string | null; class_id: string | null; location_id: string | null; entity_uuid: string | null; entity_type: string | null; item_id?: string | null; load_id?: string | null },
): Promise<{ updated: boolean; note: string | null }> {
  const type = p.source_transaction_type;
  if (!type || !p.source_transaction_id) return { updated: false, note: "hand-keyed journal entry: no source document to rewrite (ledger moved by the reclass JE)" };
  const notes: string[] = [];
  // U24 — the item and the load live on the document LINE; without the posting's line id the move is refused, never guessed.
  if ((target.item_id || target.load_id) && (type === "expense" || type === "bill")) {
    if (!p.source_transaction_line_id) {
      notes.push(`${type} posting carries no line id; item / load not moved`);
    } else {
      const table = type === "expense" ? "accounting.expense_lines" : "accounting.bill_lines";
      const live = type === "bill" ? " AND voided_at IS NULL" : "";
      const r = await client.query(
        `UPDATE ${table} SET item_id = COALESCE($3::uuid, item_id), load_id = COALESCE($4::uuid, load_id)
          WHERE id = $1::uuid AND operating_company_id = $2::uuid${live}`,
        [p.source_transaction_line_id, companyId, target.item_id ?? null, target.load_id ?? null],
      );
      if ((r.rowCount ?? 0) === 0) notes.push(`${type} line not found; item / load not moved`);
      // U25 — Diesel <-> Reefer Diesel: the fuel transaction's category (IFTA in / out), the gallons and the trailer follow
      // the item. Same account, so the ledger does not move; the Form 4136 reefer-fuel credit reads this category.
      else if (type === "expense" && target.item_id) {
        const reeferNote = await syncReeferFuelForExpenseLine(client, companyId, p.source_transaction_line_id);
        if (reeferNote) notes.push(reeferNote);
      }
    }
  }
  if (type === "expense") {
    if (target.entity_uuid && target.entity_type && target.entity_type !== "vendor") notes.push(`expense payee can only become a vendor (asked ${target.entity_type}); ledger moved, header unchanged`);
    if (target.entity_uuid && target.entity_type === "vendor") {
      await client.query(`UPDATE accounting.expenses SET vendor_uuid = $3::uuid, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.source_transaction_id, companyId, target.entity_uuid]);
    }
    if (target.account_id) {
      let lineUpdated = 0;
      if (p.source_transaction_line_id) {
        const r = await client.query(`UPDATE accounting.expense_lines SET expense_account_uuid = $3::uuid WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.source_transaction_line_id, companyId, target.account_id]);
        lineUpdated = r.rowCount ?? 0;
      } else {
        // posting carries no line id: the one expense line with this exact account + amount, else leave it and say so
        const r = await client.query(
          `UPDATE accounting.expense_lines SET expense_account_uuid = $4::uuid
            WHERE id = (SELECT id FROM accounting.expense_lines WHERE expense_id = $1::uuid AND operating_company_id = $2::uuid
                          AND expense_account_uuid = $3::uuid AND amount_cents = $5::bigint ORDER BY line_sequence LIMIT 1)`,
          [p.source_transaction_id, companyId, p.account_id, target.account_id, p.amount_cents],
        );
        lineUpdated = r.rowCount ?? 0;
      }
      if (lineUpdated === 0) notes.push("no 1:1 expense line matched this posting; ledger moved, expense line unchanged");
    }
    if (target.class_id) {
      await client.query(`UPDATE accounting.expenses SET class_id = $3::uuid, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.source_transaction_id, companyId, target.class_id]);
    }
    if (target.location_id) {
      await client.query(`UPDATE accounting.expenses SET location_id = $3::uuid, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [p.source_transaction_id, companyId, target.location_id]);
    }
    return { updated: notes.length === 0, note: notes.length ? notes.join("; ") : null };
  }
  if (type === "bill") {
    if (target.entity_uuid) notes.push("bill vendor is the A/P subledger: void-and-reissue the bill to change it; vendor dimension not moved");
    if (target.account_id && p.source_transaction_line_id) {
      const r = await client.query(`UPDATE accounting.bill_lines SET account_id = $3::uuid WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`, [p.source_transaction_line_id, companyId, target.account_id]);
      if ((r.rowCount ?? 0) === 0) notes.push("bill line not found or voided; ledger moved, bill line unchanged");
    } else if (target.account_id) {
      notes.push("bill posting carries no line id; ledger moved, bill line unchanged");
    }
    return { updated: notes.length === 0, note: notes.length ? notes.join("; ") : null };
  }
  if (type === "invoice") {
    // QBO parity: an invoice line's income account can be reclassified; the customer is the A/R subledger
    // (void-and-reissue), and invoices carry no class header -- class moves on the ledger only.
    if (target.entity_uuid) notes.push("invoice customer is the A/R subledger: void-and-reissue the invoice to change it; customer dimension not moved");
    if (target.class_id) notes.push("invoice has no class header; class moved on the ledger only");
    if (target.account_id) {
      let lineUpdated = 0;
      if (p.source_transaction_line_id) {
        const r = await client.query(
          `UPDATE accounting.invoice_lines SET account_id = $3::uuid WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`,
          [p.source_transaction_line_id, companyId, target.account_id],
        );
        lineUpdated = r.rowCount ?? 0;
      } else {
        // posting carries no line id: the one live invoice line with this exact income account + amount
        const r = await client.query(
          `UPDATE accounting.invoice_lines SET account_id = $4::uuid
            WHERE id = (SELECT id FROM accounting.invoice_lines WHERE invoice_id = $1::uuid AND operating_company_id = $2::uuid
                          AND account_id = $3::uuid AND line_total_cents = $5::bigint AND soft_deleted_at IS NULL ORDER BY display_order LIMIT 1)`,
          [p.source_transaction_id, companyId, p.account_id, target.account_id, p.amount_cents],
        );
        lineUpdated = r.rowCount ?? 0;
      }
      if (lineUpdated === 0) notes.push("no 1:1 live invoice line matched this posting; ledger moved, invoice line unchanged");
    }
    return { updated: notes.length === 0, note: notes.length ? notes.join("; ") : null };
  }
  if (type === "bill_payment" || type === "customer_payment" || type === "transfer" || type === "bank_categorization") {
    return { updated: false, note: `${type}: a cash document carries no category line; the bank side is a control account and the offset is the subledger -- ledger moved by the reclass JE only` };
  }
  return { updated: false, note: `${type}: ledger moved by the reclass JE; this document type has no line rewrite yet` };
}

const INSERT_LINE = `
  INSERT INTO accounting.reclassify_batch_lines
    (batch_id, operating_company_id, posting_id, journal_entry_id, source_transaction_type, source_transaction_id, source_transaction_line_id,
     from_account_id, from_class_id, from_location_id, from_entity_uuid, from_entity_type, to_account_id, to_class_id, to_location_id, to_entity_uuid, to_entity_type,
     debit_or_credit, amount_cents, result, refusal_reason, reclass_journal_entry_id, document_updated, document_update_note, override_of_refusal,
     from_item_id, to_item_id, from_load_id, to_load_id)
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid, $9::uuid, $10::uuid, $11::uuid, $12, $13::uuid, $14::uuid, $15::uuid, $16::uuid, $17, $18, $19, $20, $21, $22::uuid, $23, $24, $25,
          $26::uuid, $27::uuid, $28::uuid, $29::uuid)`;

export async function applyReclassify(input: ApplyReclassifyInput, actor: { userId: string; role: string }): Promise<ReclassifyBatchResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("reclassify_reason_required");
  if (!input.to_account_id && !input.to_class_id && !input.to_location_id && !input.to_entity_uuid && !input.to_item_id && !input.to_load_id) throw new Error("reclassify_changes_nothing");
  if (!!input.to_entity_uuid !== !!input.to_entity_type) throw new Error("reclassify_entity_pair_incomplete");
  const postingIds = Array.from(new Set(input.posting_ids));
  if (postingIds.length === 0) throw new Error("reclassify_no_lines_selected");
  if (postingIds.length > 500) throw new Error("reclassify_too_many_lines_max_500");
  const overrideRefusals = input.override_refusals === true;
  if (overrideRefusals && actor.role !== "Owner") throw new Error("reclassify_override_owner_only");
  const target = { to_account_id: input.to_account_id ?? null, to_class_id: input.to_class_id ?? null, to_location_id: input.to_location_id ?? null, to_entity_uuid: input.to_entity_uuid ?? null, to_entity_type: input.to_entity_type ?? null, to_item_id: input.to_item_id ?? null, to_load_id: input.to_load_id ?? null };

  return withCurrentUser(actor.userId, async (client) => {
    const companyId = input.operating_company_id;
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);

    // U24 — an item move carries the item's own expense account (unless the account is given explicitly), so the ledger
    // moves with the item; an item with no account is refused rather than moving the item alone.
    if (target.to_item_id) {
      const it = await client.query<{ ok: boolean; acct: string | null }>(
        `SELECT (deactivated_at IS NULL) AS ok, default_expense_account_id::text AS acct
           FROM catalogs.items WHERE id = $1::uuid AND (operating_company_id = $2::uuid OR operating_company_id IS NULL)`, [target.to_item_id, companyId]);
      if (!it.rows[0]?.ok) throw new Error("reclassify_target_item_not_found");
      if (!target.to_account_id) {
        if (!it.rows[0].acct) throw new Error("reclassify_target_item_has_no_account");
        target.to_account_id = it.rows[0].acct;
      }
    }
    if (target.to_load_id) {
      const ld = await client.query(`SELECT 1 FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`, [target.to_load_id, companyId]);
      if (!ld.rows[0]) throw new Error("reclassify_target_load_not_found");
    }

    if (target.to_account_id) {
      const acc = await client.query<{ ok: boolean; account_type: string | null; account_subtype: string | null; system_purpose: string | null; is_bank_ledger: boolean }>(
        `SELECT (deactivated_at IS NULL AND is_postable) AS ok, account_type, account_subtype, system_purpose,
                EXISTS (SELECT 1 FROM banking.bank_accounts ba WHERE ba.ledger_account_id = a.id) AS is_bank_ledger
           FROM catalogs.accounts a WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [target.to_account_id, companyId]);
      if (!acc.rows[0]) throw new Error("reclassify_target_account_not_found");
      if (!acc.rows[0].ok) throw new Error("reclassify_target_account_not_postable");
      const targetRefusal = lineRefusal(acc.rows[0]);
      if (targetRefusal && !(targetRefusal.overridable && overrideRefusals)) throw new Error("reclassify_target_is_control_account");
    }
    if (target.to_class_id) {
      const cls = await client.query<{ ok: boolean }>(`SELECT (deactivated_at IS NULL) AS ok FROM catalogs.classes WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [target.to_class_id, companyId]);
      if (!cls.rows[0]?.ok) throw new Error("reclassify_target_class_not_found");
    }
    if (target.to_location_id) {
      const loc = await client.query<{ ok: boolean }>(`SELECT (deactivated_at IS NULL) AS ok FROM mdata.locations WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [target.to_location_id, companyId]);
      if (!loc.rows[0]?.ok) throw new Error("reclassify_target_location_not_found");
    }

    const batchRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.reclassify_batches
         (operating_company_id, created_by_user_id, reason, filter_snapshot, to_account_id, to_class_id, to_location_id, to_entity_uuid, to_entity_type, lines_requested, override_refusals, to_item_id, to_load_id)
       VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9, $10, $11, $12::uuid, $13::uuid) RETURNING id::text`,
      [companyId, actor.userId, reason, JSON.stringify(input.filter_snapshot ?? {}), target.to_account_id, target.to_class_id, target.to_location_id, target.to_entity_uuid, target.to_entity_type, postingIds.length, overrideRefusals, target.to_item_id, target.to_load_id],
    );
    const batchId = batchRes.rows[0]!.id;
    const result: ReclassifyBatchResult = { batch_id: batchId, lines_requested: postingIds.length, lines_applied: 0, lines_refused: 0, amount_cents_moved: 0, documents: [] };

    const recordRefusal = async (p: SelectedPosting, why: string) => {
      result.lines_refused += 1;
      await client.query(INSERT_LINE, [
        batchId, companyId, p.posting_id, p.journal_entry_id, p.source_transaction_type, p.source_transaction_id, p.source_transaction_line_id,
        p.account_id, p.class_id, p.location_id, p.entity_uuid, p.entity_type,
        target.to_account_id ?? p.account_id, target.to_class_id ?? p.class_id, target.to_location_id ?? p.location_id, target.to_entity_uuid ?? p.entity_uuid, target.to_entity_uuid ? target.to_entity_type : p.entity_type,
        p.debit_or_credit, p.amount_cents, "refused", why, null, false, null, null,
        p.item_id ?? null, target.to_item_id ?? p.item_id ?? null, p.load_id ?? null, target.to_load_id ?? p.load_id ?? null,
      ]);
      result.documents.push({ source_transaction_type: p.source_transaction_type, source_transaction_id: p.source_transaction_id, document_number: p.document_number, reclass_journal_entry_id: null, lines_applied: 0, lines_refused: 1, document_updated: false, document_update_note: null, refusal_reason: why });
    };

    const postings = await loadSelectedPostings(client as DbClient, companyId, postingIds);
    const found = new Set(postings.map((p) => p.posting_id));
    const missing = postingIds.filter((id) => !found.has(id));
    result.lines_refused += missing.length;
    for (const id of missing) result.documents.push({ source_transaction_type: null, source_transaction_id: id, document_number: null, reclass_journal_entry_id: null, lines_applied: 0, lines_refused: 1, document_updated: false, document_update_note: null, refusal_reason: "posting not found in this company" });

    const groups = new Map<string, SelectedPosting[]>();
    for (const p of postings) {
      const key = p.source_transaction_type && p.source_transaction_id ? `${p.source_transaction_type}:${p.source_transaction_id}` : `je:${p.journal_entry_id}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }

    for (const [, group] of groups) {
      const head = group[0]!;
      const { eligible, refused, overridden } = classifySelection(group, target, { overrideRefusals });
      for (const r of refused) await recordRefusal(r.posting, r.why);
      if (eligible.length === 0) continue;
      const entryDate = head.entry_date; // the document's own period; closed → refused, never shifted
      const lines = buildReclassPairs(eligible, target, batchId);

      await client.query("SAVEPOINT reclass_doc");
      try {
        // ROUND 326 queue item 16 — NO HALF-WRITE. The document line is rewritten FIRST; if any selected line of this
        // document cannot be rewritten (no 1:1 line, a subledger dimension, a document type without a line rewrite),
        // the whole document rolls back and is refused by name — the ledger never moves without its document. Before,
        // the reclass JE posted first and a failed rewrite was only a note ("ledger moved, line unchanged").
        // A hand-keyed journal entry has no separate document: the reclass JE itself is the record.
        const rewrites = new Map<string, { updated: boolean; note: string | null }>();
        for (const p of eligible) {
          const handKeyed = isHandKeyed(p);
          const rw = handKeyed
            ? { updated: true, note: null }
            : await rewriteDocumentLine(client as DbClient, companyId, p, { account_id: target.to_account_id, class_id: target.to_class_id, location_id: target.to_location_id, entity_uuid: target.to_entity_uuid, entity_type: target.to_entity_type, item_id: target.to_item_id, load_id: target.to_load_id });
          if (!rw.updated) throw new ReclassifyDocumentNotRewritableError(rw.note ?? "document line could not be rewritten");
          rewrites.set(p.posting_id, rw);
        }
        const je = await createJournalEntryOnClient(
          client as never,
          {
            operating_company_id: companyId,
            entry_date: entryDate,
            memo: `Reclassify batch ${batchId}: ${reason}${head.document_number ? ` · ${head.source_transaction_type} ${head.document_number}` : ""}`,
            source: "auto",
            journal_entry_type_code: "RECLASSIFICATION",
            postings: lines,
          } as never,
          actor,
        );
        const jeId = (je as { id: string }).id;
        await linkReclassEntry(
          client as DbClient,
          companyId,
          jeId,
          head.source_transaction_type && head.source_transaction_id
            ? { type: head.source_transaction_type, id: head.source_transaction_id }
            : { type: "journal_entry", id: head.journal_entry_id },
          batchId,
          "reclassification",
        );
        let docUpdated = true;
        const notes: string[] = [];
        for (const p of eligible) {
          const rw = rewrites.get(p.posting_id)!;
          if (!rw.updated) { docUpdated = false; if (rw.note) notes.push(rw.note); }
          await client.query(INSERT_LINE, [
            batchId, companyId, p.posting_id, p.journal_entry_id, p.source_transaction_type, p.source_transaction_id, p.source_transaction_line_id,
            p.account_id, p.class_id, p.location_id, p.entity_uuid, p.entity_type,
            target.to_account_id ?? p.account_id, target.to_class_id ?? p.class_id, target.to_location_id ?? p.location_id, target.to_entity_uuid ?? p.entity_uuid, target.to_entity_uuid ? target.to_entity_type : p.entity_type,
            p.debit_or_credit, p.amount_cents, "applied", null, jeId, rw.updated, rw.note, overridden.get(p.posting_id) ?? null,
            p.item_id ?? null, target.to_item_id ?? p.item_id ?? null, p.load_id ?? null, target.to_load_id ?? p.load_id ?? null,
          ]);
          result.lines_applied += 1;
          result.amount_cents_moved += p.amount_cents;
        }
        await client.query(
          `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
           VALUES (gen_random_uuid(), now(), 'accounting.reclassify.document_reclassified', 'info', $1::jsonb, $2::uuid, 'RECLASSIFY-ENGINE')`,
          [JSON.stringify({ batch_id: batchId, reclass_journal_entry_id: jeId, source_transaction_type: head.source_transaction_type, source_transaction_id: head.source_transaction_id, document_number: head.document_number, lines: eligible.length, ...target, reason }), actor.userId],
        );
        // LAW 363.5 — an override is never silent: one audit row per overridden line naming who (actor), when (the row),
        // the before and after account, and the refusal it bypassed.
        for (const p of eligible) {
          const bypassed = overridden.get(p.posting_id);
          if (!bypassed) continue;
          await client.query(
            `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
             VALUES (gen_random_uuid(), now(), 'accounting.reclassify.refusal_overridden', 'warning', $1::jsonb, $2::uuid, 'RECLASSIFY-ENGINE')`,
            [JSON.stringify({ batch_id: batchId, reclass_journal_entry_id: jeId, posting_id: p.posting_id, source_transaction_type: p.source_transaction_type, source_transaction_id: p.source_transaction_id, from_account_id: p.account_id, to_account_id: target.to_account_id, amount_cents: p.amount_cents, debit_or_credit: p.debit_or_credit, refusal_bypassed: bypassed, actor_role: actor.role, reason }), actor.userId],
          );
        }
        await client.query("RELEASE SAVEPOINT reclass_doc");
        result.documents.push({ source_transaction_type: head.source_transaction_type, source_transaction_id: head.source_transaction_id, document_number: head.document_number, reclass_journal_entry_id: jeId, lines_applied: eligible.length, lines_refused: refused.length, document_updated: docUpdated, document_update_note: notes.length ? Array.from(new Set(notes)).join("; ") : null, refusal_reason: null });
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT reclass_doc");
        await client.query("RELEASE SAVEPOINT reclass_doc");
        const why = error instanceof PostingEngineError && error.code === "PERIOD_LOCKED"
          ? `period closed for ${entryDate}: reopen the period or post a dated adjusting entry`
          : error instanceof ReclassifyDocumentNotRewritableError
            ? `not reclassified — the document cannot follow the ledger (${error.message}); nothing was moved`
            : error instanceof Error ? error.message : String(error);
        for (const p of eligible) await recordRefusal(p, why);
      }
    }

    await client.query(`UPDATE accounting.reclassify_batches SET lines_applied = $2, lines_refused = $3, amount_cents_moved = $4 WHERE id = $1::uuid`, [batchId, result.lines_applied, result.lines_refused, result.amount_cents_moved]);
    return result;
  });
}

export async function undoReclassifyBatch(input: { operating_company_id: string; batch_id: string; reason: string }, actor: { userId: string; role: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("reclassify_undo_reason_required");
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const batch = await client.query<{ status: string }>(`SELECT status FROM accounting.reclassify_batches WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [input.batch_id, input.operating_company_id]);
    if (!batch.rows[0]) throw new Error("reclassify_batch_not_found");
    if (batch.rows[0].status !== "applied") throw new Error("reclassify_batch_already_undone");
    const jes = await client.query<{ je: string }>(`SELECT DISTINCT reclass_journal_entry_id::text AS je FROM accounting.reclassify_batch_lines WHERE batch_id = $1::uuid AND result = 'applied' AND reclass_journal_entry_id IS NOT NULL`, [input.batch_id]);
    let reversed = 0;
    for (const row of jes.rows) {
      const r = await reverseJournalEntryNoFlip(client as never, { operatingCompanyId: input.operating_company_id, journalEntryId: row.je, reason: `Undo reclassify batch ${input.batch_id}: ${reason}`, actorUserId: actor.userId });
      const undoId = r.reversal.reversal_journal_entry_id ?? null;
      if (undoId) await linkReclassEntry(client as DbClient, input.operating_company_id, undoId, { type: "journal_entry", id: row.je }, input.batch_id, "reclassify_undo");
      await client.query(`UPDATE accounting.reclassify_batch_lines SET undo_journal_entry_id = $2::uuid WHERE batch_id = $1::uuid AND reclass_journal_entry_id = $3::uuid`, [input.batch_id, undoId, row.je]);
      reversed += 1;
    }
    const lines = await client.query<{ source_transaction_type: string | null; source_transaction_id: string | null; source_transaction_line_id: string | null; from_account_id: string; from_class_id: string | null; from_location_id: string | null; from_entity_uuid: string | null; document_updated: boolean; from_item_id: string | null; to_item_id: string | null; from_load_id: string | null; to_load_id: string | null }>(
      `SELECT source_transaction_type, source_transaction_id, source_transaction_line_id, from_account_id::text, from_class_id::text, from_location_id::text, from_entity_uuid::text, document_updated,
              from_item_id::text, to_item_id::text, from_load_id::text, to_load_id::text
         FROM accounting.reclassify_batch_lines WHERE batch_id = $1::uuid AND result = 'applied'`,
      [input.batch_id],
    );
    for (const l of lines.rows) {
      if (!l.document_updated) continue;
      // U24 — an item / load move goes back on the document line it was made on.
      const itemMoved = l.to_item_id !== l.from_item_id;
      const loadMoved = l.to_load_id !== l.from_load_id;
      if ((itemMoved || loadMoved) && l.source_transaction_line_id && (l.source_transaction_type === "expense" || l.source_transaction_type === "bill")) {
        const table = l.source_transaction_type === "expense" ? "accounting.expense_lines" : "accounting.bill_lines";
        await client.query(
          `UPDATE ${table} SET item_id = CASE WHEN $2 THEN $3::uuid ELSE item_id END, load_id = CASE WHEN $4 THEN $5::uuid ELSE load_id END WHERE id = $1::uuid`,
          [l.source_transaction_line_id, itemMoved, l.from_item_id, loadMoved, l.from_load_id],
        );
        // U25 — undoing Diesel -> Reefer Diesel puts the fuel transaction back in its category (and back on IFTA).
        if (itemMoved && l.source_transaction_type === "expense") {
          await syncReeferFuelForExpenseLine(client, input.operating_company_id, l.source_transaction_line_id);
        }
      }
      if (l.source_transaction_type === "expense" && l.source_transaction_id) {
        if (l.source_transaction_line_id) await client.query(`UPDATE accounting.expense_lines SET expense_account_uuid = $2::uuid WHERE id = $1::uuid`, [l.source_transaction_line_id, l.from_account_id]);
        await client.query(`UPDATE accounting.expenses SET class_id = $2::uuid, location_id = $4::uuid, vendor_uuid = coalesce($3::uuid, vendor_uuid), updated_at = now() WHERE id = $1::uuid`, [l.source_transaction_id, l.from_class_id, l.from_entity_uuid, l.from_location_id]);
      } else if (l.source_transaction_type === "bill" && l.source_transaction_line_id) {
        await client.query(`UPDATE accounting.bill_lines SET account_id = $2::uuid WHERE id = $1::uuid`, [l.source_transaction_line_id, l.from_account_id]);
      } else if (l.source_transaction_type === "invoice" && l.source_transaction_id) {
        if (l.source_transaction_line_id) {
          await client.query(`UPDATE accounting.invoice_lines SET account_id = $2::uuid WHERE id = $1::uuid`, [l.source_transaction_line_id, l.from_account_id]);
        } else {
          // the applied line was matched by (to_account, amount) at apply time; restore the one line that now carries the target
          await client.query(
            `UPDATE accounting.invoice_lines SET account_id = $2::uuid
              WHERE id = (SELECT il.id FROM accounting.invoice_lines il
                           JOIN accounting.reclassify_batch_lines bl ON bl.batch_id = $3::uuid AND bl.source_transaction_id = il.invoice_id::text
                          WHERE il.invoice_id = $1::uuid AND il.account_id = bl.to_account_id AND il.line_total_cents = bl.amount_cents AND il.soft_deleted_at IS NULL
                          ORDER BY il.display_order LIMIT 1)`,
            [l.source_transaction_id, l.from_account_id, input.batch_id],
          );
        }
      }
    }
    await client.query(`UPDATE accounting.reclassify_batches SET status = 'undone', undone_at = now(), undone_by_user_id = $2::uuid, undo_reason = $3 WHERE id = $1::uuid`, [input.batch_id, actor.userId, reason]);
    await client.query(
      `INSERT INTO audit.audit_events (uuid, created_at, event_class, severity, payload, actor_user_uuid, source)
       VALUES (gen_random_uuid(), now(), 'accounting.reclassify.batch_undone', 'info', $1::jsonb, $2::uuid, 'RECLASSIFY-ENGINE')`,
      [JSON.stringify({ batch_id: input.batch_id, journal_entries_reversed: reversed, reason }), actor.userId],
    );
    return { batch_id: input.batch_id, journal_entries_reversed: reversed };
  });
}

export async function listReclassifyBatches(userId: string, operatingCompanyId: string, limit = 50) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<Record<string, unknown>>(
      `SELECT b.id::text, b.created_at::text, b.reason, b.status, b.lines_requested, b.lines_applied, b.lines_refused, b.amount_cents_moved::bigint AS amount_cents_moved, b.override_refusals,
              b.to_account_id::text, a.account_number AS to_account_number, a.account_name AS to_account_name,
              b.to_class_id::text, c.class_name AS to_class_name, b.to_location_id::text, loc.location_name AS to_location_name,
              b.to_entity_uuid::text, b.to_entity_type,
              b.undone_at::text, b.undo_reason, u.email AS created_by_email
         FROM accounting.reclassify_batches b
         LEFT JOIN catalogs.accounts a ON a.id = b.to_account_id
         LEFT JOIN catalogs.classes c ON c.id = b.to_class_id
         LEFT JOIN mdata.locations loc ON loc.id = b.to_location_id
         LEFT JOIN identity.users u ON u.id = b.created_by_user_id
        WHERE b.operating_company_id = $1::uuid
        ORDER BY b.created_at DESC LIMIT $2`,
      [operatingCompanyId, Math.min(limit, 200)],
    );
    return res.rows.map((r) => ({ ...r, amount_cents_moved: Number(r.amount_cents_moved) }));
  });
}

export async function getReclassifyBatchLines(userId: string, operatingCompanyId: string, batchId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<Record<string, unknown>>(
      `SELECT l.id::text, l.posting_id::text, l.journal_entry_id::text, l.source_transaction_type, l.source_transaction_id, l.source_transaction_line_id,
              l.from_account_id::text, fa.account_number AS from_account_number, fa.account_name AS from_account_name,
              l.to_account_id::text, ta.account_number AS to_account_number, ta.account_name AS to_account_name,
              l.from_class_id::text, fc.class_name AS from_class_name, l.to_class_id::text, tc.class_name AS to_class_name,
              l.from_entity_uuid::text, l.from_entity_type, l.to_entity_uuid::text, l.to_entity_type,
              l.debit_or_credit, l.amount_cents::bigint AS amount_cents, l.result, l.refusal_reason, l.override_of_refusal,
              l.reclass_journal_entry_id::text, l.undo_journal_entry_id::text, l.document_updated, l.document_update_note
         FROM accounting.reclassify_batch_lines l
         LEFT JOIN catalogs.accounts fa ON fa.id = l.from_account_id
         LEFT JOIN catalogs.accounts ta ON ta.id = l.to_account_id
         LEFT JOIN catalogs.classes fc ON fc.id = l.from_class_id
         LEFT JOIN catalogs.classes tc ON tc.id = l.to_class_id
        WHERE l.batch_id = $1::uuid AND l.operating_company_id = $2::uuid
        ORDER BY l.created_at, l.id`,
      [batchId, operatingCompanyId],
    );
    return res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  });
}

/** ROUND 368.1 / LAW 363.8 — which statement an account's QBO type belongs to. */
export function statementSide(accountType: string | null): "balance_sheet" | "profit_and_loss" | "statistical" {
  const t = String(accountType ?? "").toLowerCase();
  if (/^(asset|bank|accountsreceivable|othercurrentasset|fixedasset|otherasset|liability|accountspayable|creditcard|othercurrentliability|longtermliability|equity)$/.test(t)) return "balance_sheet";
  if (/^(income|costofgoodssold|expense|otherincome|otherexpense)$/.test(t)) return "profit_and_loss";
  return "statistical";
}

export type ReclassifyTreeAccount = {
  account_id: string;
  account_number: string | null;
  account_name: string;
  account_type: string | null;
  account_subtype: string | null;
  detail_type_name: string | null;
  parent_account_id: string | null;
  side: "balance_sheet" | "profit_and_loss" | "statistical";
  is_active: boolean;
  is_postable: boolean;
  /** derived from the GL postings (fn_account_balances_as_of's predicate) — never a stored total */
  opening_cents: number;
  period_activity_cents: number;
  closing_balance_cents: number;
  period_line_count: number;
};

/**
 * ROUND 368.1 — THE WHOLE CHART OF ACCOUNTS for the Reclassify balance inspector: every row of catalogs.accounts for the
 * company (0.00 included, inactive flagged — active = deactivated_at IS NULL), its parent, its statement side, and its
 * balances DERIVED from the postings with exactly the predicate accounting.fn_account_balances_as_of uses. The rolled-up
 * parent total is computed by the caller from these own balances (parent own balance stays separate).
 */
export async function getReclassifyAccountTree(userId: string, input: { operating_company_id: string; from_date: string; to_date: string }) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const res = await client.query<{
      account_id: string; account_number: string | null; account_name: string; account_type: string | null; account_subtype: string | null;
      detail_type_name: string | null; parent_account_id: string | null; is_active: boolean; is_postable: boolean;
      opening: string; activity: string; closing: string; n: string;
    }>(
      `WITH g AS (
         SELECT p.account_id,
                sum(CASE WHEN je.entry_date < $2::date THEN (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END) AS opening,
                sum(CASE WHEN je.entry_date BETWEEN $2::date AND $3::date THEN (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END) AS activity,
                sum(CASE WHEN je.entry_date <= $3::date THEN (CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END) AS closing,
                count(*) FILTER (WHERE je.entry_date BETWEEN $2::date AND $3::date) AS n
           FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
           LEFT JOIN accounting.posting_batches pb ON pb.id = p.posting_batch_id AND pb.operating_company_id = p.operating_company_id
          WHERE p.operating_company_id = $1::uuid
            AND je.status <> 'voided'
            AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
          GROUP BY p.account_id
       )
       SELECT a.id::text AS account_id, a.account_number, a.account_name, a.account_type::text AS account_type, a.account_subtype,
              dt.name AS detail_type_name, a.parent_account_id::text AS parent_account_id,
              (a.deactivated_at IS NULL) AS is_active, COALESCE(a.is_postable, true) AS is_postable,
              COALESCE(g.opening, 0)::text AS opening, COALESCE(g.activity, 0)::text AS activity,
              COALESCE(g.closing, 0)::text AS closing, COALESCE(g.n, 0)::text AS n
         FROM catalogs.accounts a
         LEFT JOIN catalogs.detail_types dt ON dt.id = a.detail_type_id
         LEFT JOIN g ON g.account_id = a.id
        WHERE a.operating_company_id = $1::uuid
        ORDER BY a.account_number NULLS LAST, a.account_name`,
      [input.operating_company_id, input.from_date, input.to_date],
    );
    const accounts: ReclassifyTreeAccount[] = res.rows.map((r) => ({
      account_id: r.account_id,
      account_number: r.account_number,
      account_name: r.account_name,
      account_type: r.account_type,
      account_subtype: r.account_subtype,
      detail_type_name: r.detail_type_name,
      parent_account_id: r.parent_account_id,
      side: statementSide(r.account_type),
      is_active: r.is_active,
      is_postable: r.is_postable,
      opening_cents: Number(r.opening),
      period_activity_cents: Number(r.activity),
      closing_balance_cents: Number(r.closing),
      period_line_count: Number(r.n),
    }));
    return {
      from_date: input.from_date,
      to_date: input.to_date,
      accounts,
      longest_account_name_chars: accounts.reduce((m, a) => Math.max(m, a.account_name.length), 0),
    };
  });
}
