// Read-only posting source resolution and shared types. All writes belong to posting-engine.service.
/**
 * The minimum client shape this writer needs — satisfied by pg.Client, PoolClient and the app's wrappers (DbClient,
 * QueryableClient). ROUND 393.2: it reads only `rows`, so it asks for only `rows`; demanding pg's full QueryResult
 * refused the app's own client types at every repointed door.
 */
export type PostingWriterClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
};

export type PostingLineWrite = {
  operating_company_id: string;
  journal_entry_uuid: string;
  line_sequence: number;
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  /** The document this line came from. Both halves are required — a line with no source is not writable. */
  source_transaction_type: string;
  source_transaction_id: string;
  source_transaction_line_id?: string | null;
  posting_batch_id?: string | null;
  idempotency_key?: string | null;
  class_id?: string | null;
  /**
   * Spine relationship. "source_transaction" is the document that caused the line; a reversal line
   * passes "reversal_of" so the spine says what it undoes rather than claiming to be an original.
   */
  relationship_role?: string;
  /** ROUND 393.3 — the party on the line (vendor / customer / driver), as the void and recurring doors carried it. */
  entity_uuid?: string | null;
  /** ROUND 393.3 — a reversal line points at the line it reverses; its load is that line's load. */
  reversal_of_line_id?: string | null;
  /**
   * ROUND 393.3 — the spine row names the source document by default. A reversal names the document it UNDOES
   * (void.service: the voided entity, which on a reinstate hop differs from the line's resolved true source).
   */
  spine_link?: { linked_object_type: string; linked_object_id: string } | null;
  /** ROUND 393.2 — the location dimension a hand-keyed journal line carries. */
  location_id?: string | null;
  /** ROUND 393.2 — travels with entity_uuid (202612670000's CHECK refuses one set without the other). */
  entity_type?: string | null;
  /**
   * ROUND 393.2 — a load the CALLER names (a hand-keyed journal line can name its load). Wins over the stamp resolved
   * from the source document only when given; omitted, the load is resolved exactly as before.
   */
  load_id?: string | null;
  /** 443.37 — the settlement this line belongs to; fill-once at INSERT (settlement-ap-chain only). */
  settlement_id?: string | null;
};

/** ROUND 390.1 — refused: the line named in reversal_of_line_id is itself a reversal (a reversal is terminal). */
export class PostingLineIsAlreadyAReversalError extends Error {
  readonly code = "posting_line_is_already_a_reversal";
  constructor(readonly targetLineId: string) {
    super(`posting_line_is_already_a_reversal: posting ${targetLineId} is itself a reversal — a reversal line is terminal and is never reversed`);
    this.name = "PostingLineIsAlreadyAReversalError";
  }
}

/**
 * AUTH-400 — refused: the line named in reversal_of_line_id is ALREADY reversed by another line. A line is reversed
 * exactly once; a second reversal manufactures the opposite of the original's money (measured on the AUTH-400 rehearsal:
 * reclassify's out-leg named expense line 8314452b without stamping its reversed_by_line_id, so the line read as live
 * and the expense void reversed it a second time).
 */
/**
 * RULING 443.65 #2d (443.59 item 8) — a posting on a related party's "Due to / from <party>" account (202615560900) must
 * name its party: without an entity nobody can say whose balance the line moves. Refused here, the one writer every
 * posting goes through, after the entity is derived from the source document.
 */
export class RelatedPartyPostingWithoutPartyError extends Error {
  constructor(accountId: string, journalEntryUuid: string) {
    super(`related_party_posting_without_party: journal_entry ${journalEntryUuid} posts to "Due to / from" account ${accountId} with no party entity`);
    this.name = "RelatedPartyPostingWithoutPartyError";
  }
}

/**
 * LEAD 443.113 I-02 — the entity invariant is UNIVERSAL: every posting source type is classified here, explicitly.
 *   PARTY_FROM_DOCUMENT — the document names its party (vendor / customer / driver); resolvePostingSourceEntity stamps
 *                         it on every line the caller did not stamp, so such a document can never post party-less while
 *                         it names a party (a bank line categorized straight to an account names none, and stays NULL).
 *   PARTYLESS           — the document has no single party (GL journals, depreciation, transfers, deposits/sweeps of
 *                         many customers, factoring events whose legs belong to different parties and are stamped by
 *                         their caller per line, loans / leases / claims whose counterparty is on their own bill/line).
 * (A line with no source at all is already refused: posting_line_requires_source.) Any OTHER type is refused until it is
 * classified, so a new poster can never silently write party-less lines.
 */
export const PARTY_FROM_DOCUMENT_SOURCE_TYPES = [
  "invoice", "bill", "bill_payment", "expense", "customer_payment", "credit_memo", "vendor_credit",
  "driver_settlement", "driver_advance", "cash_advance", "driver_reimbursement", "driver_liability", "relay_deposit",
  "bank_categorization", "fuel_event",
  // LEAD 443.185 G8 — every advance leg is with the factor (resolvePostingSourceEntity: factoring_company_vendor_id).
  "factoring_advance",
  // its poster (party-entry-post.service.ts) stamps the party itself; the Due to / from refusal backs it.
  "related_party_loan",
] as const;
export const PARTYLESS_SOURCE_TYPES = [
  "journal_entry", "manual_je", "period_close", "recurring_template", "transfer", "bank_reconciliation", "bank_transaction",
  "bank_deposit", "customer_payment_deposit", "fixed_asset", "fixed_asset_depreciation", "prepaid_purchase",
  "prepaid_amortization", "loan", "loan_payment", "lease_contract", "lease_rental", "lease_disposal", "liability",
  "escrow_account", "property_tax_rendition", "accident_liability", "insurance_claim", "warranty_claim", "safety_fine",
  "settlement_dispute", "load", "factoring_advance_deposit", "factoring_funding",
  "factoring_customer_payment", "factoring_reserve_release", "factoring_default_interest", "faro_reserve_entry",
  "faro_cash_reserve_reclass", "factoring_chargeback" ,
  // legacy aliases still read by reports; no live writer posts under them
  "payment", "settlement"
] as const;

export type PostingPartyClass = "from_document" | "partyless" | "unclassified";
export function postingPartyClass(sourceType: string | null | undefined): PostingPartyClass {
  if ((PARTY_FROM_DOCUMENT_SOURCE_TYPES as readonly string[]).includes(String(sourceType))) return "from_document";
  if ((PARTYLESS_SOURCE_TYPES as readonly string[]).includes(String(sourceType))) return "partyless";
  return "unclassified";
}

/** I-02 — a posting source type nobody classified: refused until it is added to the classification above. */
export class UnclassifiedPostingSourceTypeError extends Error {
  readonly code = "posting_source_type_unclassified";
  constructor(readonly sourceType: string) {
    super(`posting_source_type_unclassified: source type "${sourceType}" is not classified for its party (posting-line-writer.ts)`);
    this.name = "UnclassifiedPostingSourceTypeError";
  }
}

/** 443.110 G8 — a posting may only carry a load of its own company. */
export class PostingLoadOfAnotherCompanyError extends Error {
  readonly code = "posting_load_of_another_company";
  constructor(loadId: string, companyId: string) {
    super(`posting_load_of_another_company: load ${loadId} is not a load of company ${companyId}`);
    this.name = "PostingLoadOfAnotherCompanyError";
  }
}

export class PostingLineAlreadyReversedError extends Error {
  readonly code = "posting_line_already_reversed";
  constructor(readonly targetLineId: string) {
    super(`posting_line_already_reversed: posting ${targetLineId} is already reversed by another line — a line is reversed exactly once`);
    this.name = "PostingLineAlreadyReversedError";
  }
}

/**
 * D6 (Lead order 2026-10-11, measured on prod: 206 of 229 Creator-caused postings had entity_uuid NULL) — the entity a posting
 * names when its caller did not: taken from the posting's OWN source document, the same way the load stamp is
 * (posting_source_load_id). A reversal line names what the line it reverses named. An explicit entity always wins.
 *   invoice -> its customer · bill -> its driver (a driver bill) else its vendor · bill_payment -> its bill's driver, else its vendor ·
 *   expense -> its vendor, else its driver, else its payee customer · driver_settlement / driver_advance -> the driver ·
 *   relay_deposit (every leg) and a Relay fuel_event -> the vendor Relay · another fuel_event -> its fuel transaction's vendor ·
 *   factoring_advance (every leg) -> the factoring company vendor (LEAD 443.185 G8).
 */
export async function resolvePostingSourceEntity(
  client: PostingWriterClient,
  line: Pick<PostingLineWrite, "operating_company_id" | "source_transaction_type" | "source_transaction_id" | "reversal_of_line_id"> &
    Partial<Pick<PostingLineWrite, "source_transaction_line_id">>
): Promise<{ entity_uuid: string; entity_type: "customer" | "vendor" | "driver" } | null> {
  if (line.reversal_of_line_id) {
    const r = await client.query<{ entity_uuid: string | null; entity_type: string | null }>(
      `SELECT entity_uuid::text, entity_type FROM accounting.journal_entry_postings WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [line.reversal_of_line_id, line.operating_company_id]
    );
    const row = r.rows[0];
    if (row?.entity_uuid && row.entity_type) {
      return { entity_uuid: row.entity_uuid, entity_type: row.entity_type as "customer" | "vendor" | "driver" };
    }
    // The reversed line predates entity stamping -- attribute the reversal from its own source document instead.
  }
  const id = String(line.source_transaction_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql: Record<string, string> = {
    invoice: `SELECT customer_id::text AS e, 'customer' AS t FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    bill: `SELECT COALESCE(driver_id::text, vendor_uuid::text, CASE WHEN vendor_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN vendor_id::text END, mdata_vendor_id::text) AS e,
                  CASE WHEN driver_id IS NOT NULL THEN 'driver' ELSE 'vendor' END AS t
             FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    // A payment on a driver's bill carries the driver, the same party as that bill's A/P credit.
    // vendor_id is TEXT and carries QBO-mirror ids (TRANSP: 6,543 of 6,544 rows, e.g. '101'): only a uuid is a party.
    bill_payment: `SELECT COALESCE(b.driver_id::text, CASE WHEN bp.vendor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN bp.vendor_id END) AS e,
                          CASE WHEN b.driver_id IS NOT NULL THEN 'driver' ELSE 'vendor' END AS t
                     FROM accounting.bill_payments bp
                     LEFT JOIN accounting.bills b ON b.id = bp.bill_id AND b.operating_company_id = bp.operating_company_id
                    WHERE bp.id = $1::uuid AND bp.operating_company_id = $2::uuid`,
    expense: `SELECT COALESCE(vendor_uuid::text, driver_uuid::text, payee_customer_uuid::text) AS e,
                     CASE WHEN vendor_uuid IS NOT NULL THEN 'vendor' WHEN driver_uuid IS NOT NULL THEN 'driver' ELSE 'customer' END AS t
                FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    driver_settlement: `SELECT driver_id::text AS e, 'driver' AS t FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    // 443.113 I-02 — the remaining party-bearing documents the posting engine builds (buildPostingDraft).
    customer_payment: `SELECT customer_id::text AS e, 'customer' AS t FROM accounting.payments WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    credit_memo: `SELECT customer_id::text AS e, 'customer' AS t FROM accounting.credit_memos WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    vendor_credit: `SELECT CASE WHEN vendor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN vendor_id END AS e, 'vendor' AS t
                      FROM accounting.vendor_credits WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    cash_advance: `SELECT driver_id::text AS e, 'driver' AS t FROM driver_finance.cash_advance_requests WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    driver_reimbursement: `SELECT driver_id::text AS e, 'driver' AS t FROM driver_finance.driver_reimbursements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    driver_liability: `SELECT driver_id::text AS e, 'driver' AS t FROM driver_finance.driver_liabilities WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    driver_advance: `SELECT driver_id::text AS e, 'driver' AS t FROM driver_finance.driver_advances WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    // LEAD 443.185 G8 — every leg of a factoring advance is with the FACTOR (measured on prod: 1090 undeposited funds,
    // 6400 fees, 1230 reserves, 2150 advance liability, 6300 wire fees — no A/R leg), so its party is the factoring
    // company vendor. 155 of 155 lines carried no party before.
    factoring_advance: `SELECT factoring_company_vendor_id::text AS e, 'vendor' AS t FROM accounting.factoring_advances WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    // 443.110 G8 — a categorized bank line names the party it was categorized to: its vendor, else its driver.
    bank_categorization: `SELECT COALESCE(categorization_vendor_id::text, categorization_driver_id::text) AS e,
                                 CASE WHEN categorization_vendor_id IS NOT NULL THEN 'vendor' ELSE 'driver' END AS t
                            FROM banking.bank_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
  };
  // 443.110 G8 — a bank SPLIT line names its own party first (a split can carry a different vendor / driver).
  if (line.source_transaction_type === "bank_categorization" && line.source_transaction_line_id) {
    const sid = String(line.source_transaction_line_id);
    if (/^[0-9a-f-]{36}$/i.test(sid)) {
      const sp = await client.query<{ e: string | null; t: "vendor" | "driver" }>(
        `SELECT COALESCE(s.vendor_id::text, s.driver_id::text) AS e, CASE WHEN s.vendor_id IS NOT NULL THEN 'vendor' ELSE 'driver' END AS t
           FROM banking.bank_transaction_splits s
          WHERE s.id = $1::uuid AND s.operating_company_id = $2::uuid`,
        [sid, line.operating_company_id]
      );
      if (sp.rows[0]?.e) return { entity_uuid: sp.rows[0].e, entity_type: sp.rows[0].t };
    }
  }
  // 443.42 #6 — Relay documents name the vendor Relay: a wallet deposit (every leg, the funding leg included — Relay is the
  // payee of the card / bank charge) and a Relay fuel fill (source = the integrations.relay_fuel_transactions row). A
  // non-Relay fuel event names its fuel transaction's vendor.
  if (line.source_transaction_type === "relay_deposit" || line.source_transaction_type === "fuel_event") {
    const isRelay =
      line.source_transaction_type === "relay_deposit" ||
      (await client.query<{ one: number }>(`SELECT 1 AS one FROM integrations.relay_fuel_transactions WHERE id = $1::uuid`, [id])).rows.length > 0;
    if (isRelay) {
      const relay = await relayVendorId(client, line.source_transaction_type === "relay_deposit"
        ? `SELECT operating_company_id::text AS c FROM integrations.relay_deposits WHERE id = $1::uuid`
        : `SELECT operating_company_id::text AS c FROM integrations.relay_fuel_transactions WHERE id = $1::uuid`, id);
      return relay ? { entity_uuid: relay, entity_type: "vendor" } : null;
    }
    const v = await client.query<{ e: string | null }>(`SELECT vendor_id::text AS e FROM fuel.fuel_transactions WHERE id = $1::uuid`, [id]);
    return v.rows[0]?.e ? { entity_uuid: v.rows[0].e, entity_type: "vendor" } : null;
  }
  const q = sql[String(line.source_transaction_type ?? "")];
  if (!q) return null;
  const r = await client.query<{ e: string | null; t: "customer" | "vendor" | "driver" }>(q, [id, line.operating_company_id]);
  const row = r.rows[0];
  return row?.e ? { entity_uuid: row.e, entity_type: row.t } : null;
}

/** The one active vendor named Relay in the document's company, or null when there is not exactly one. */
async function relayVendorId(client: PostingWriterClient, companySql: string, id: string): Promise<string | null> {
  const company = (await client.query<{ c: string }>(companySql, [id])).rows[0]?.c;
  if (!company) return null;
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.vendors WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND vendor_name ~* '^relay( |$)' LIMIT 2`,
    [company]
  );
  return r.rows.length === 1 ? r.rows[0]!.id : null;
}

/**
 * 443.110 G8 — every factoring lifecycle event (customer payment, reserve release, chargeback, default interest, the
 * advance's deposit) is sourced by its FACTORING ADVANCE's id, and the advance names its load (source_load_id).
 * accounting.posting_source_load_id only maps 'factoring_advance', so these events posted with no load.
 */
export const FACTORING_EVENT_SOURCE_TYPES = [
  "factoring_customer_payment",
  "factoring_reserve_release",
  "factoring_chargeback",
  "factoring_default_interest",
  "factoring_advance_deposit",
] as const;

/**
 * 443.42 #6 — the load of a Relay fill posting. Its source is the integrations.relay_fuel_transactions row, which
 * accounting.posting_source_load_id cannot see (that function reads fuel.fuel_transactions by id); the fill's purchase
 * record carries the load through relay_fuel_transaction_id. Exactly one load, or none (never a guess).
 */
export async function resolvePostingSourceLoad(
  client: PostingWriterClient,
  line: Pick<PostingLineWrite, "source_transaction_type" | "source_transaction_id" | "reversal_of_line_id"> &
    Partial<Pick<PostingLineWrite, "operating_company_id">>
): Promise<string | null> {
  if (line.reversal_of_line_id) return null;
  const id = String(line.source_transaction_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  // LEAD 443.185 G8 — the advance itself is included (it was missing, so its lines never carried a load), and an advance
  // with no source_load_id carries the ONE load its live invoices name; invoices on several loads = no single load
  // (never a guess — a line cannot carry two loads).
  if (
    (line.source_transaction_type === "factoring_advance" ||
      (FACTORING_EVENT_SOURCE_TYPES as readonly string[]).includes(String(line.source_transaction_type))) &&
    line.operating_company_id
  ) {
    const fa = await client.query<{ load_id: string | null }>(
      `SELECT COALESCE(
                a.source_load_id,
                (SELECT (array_agg(DISTINCT i.source_load_id))[1]
                   FROM accounting.invoices i
                  WHERE i.factoring_advance_id = a.id AND i.operating_company_id = a.operating_company_id
                    AND i.voided_at IS NULL AND i.source_load_id IS NOT NULL
                 HAVING count(DISTINCT i.source_load_id) = 1)
              )::text AS load_id
         FROM accounting.factoring_advances a
        WHERE a.id = $1::uuid AND a.operating_company_id = $2::uuid`,
      [id, line.operating_company_id]
    );
    return fa.rows[0]?.load_id ?? null;
  }
  if (line.source_transaction_type !== "fuel_event") return null;
  const r = await client.query<{ load_id: string }>(
    `SELECT DISTINCT ft.load_id::text AS load_id FROM fuel.fuel_transactions ft
      WHERE ft.relay_fuel_transaction_id::text = $1 AND ft.archived_at IS NULL AND ft.load_id IS NOT NULL LIMIT 2`,
    [id]
  );
  return r.rows.length === 1 ? r.rows[0]!.load_id : null;
}
