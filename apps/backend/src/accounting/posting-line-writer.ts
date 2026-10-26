// C6-MONEY-JE-EXEMPT: this IS the posting-line writer the balanced-JE posters call (posting engine, createJournalEntry and every
// door repointed in ROUND 393.2); it writes one line + its spine row inside the caller's balanced entry, never a JE on its own.
/**
 * posting-line-writer — THE ONE PLACE A GL POSTING LINE IS WRITTEN.
 *
 * WHY THIS FILE EXISTS (measured live, USMCA, 2026-10-03):
 *   accounting.journal_entry_postings  7,909 rows
 *   accounting.transaction_source_links  4,355 rows
 *   => 3,908 postings carry NO row on the canonical lineage spine.
 *
 *   Nine services INSERT INTO accounting.journal_entry_postings directly. Exactly ONE of them
 *   (fuel-posting/poster.service.ts) also writes the matching transaction_source_links row. The other
 *   eight — amortization-posting, bank-recon/match, journal-entries, lease-asc842/lease-posting,
 *   period-close-retained-earnings, recurring.worker, settlement-posting, void — write the money and
 *   not the lineage. That is the entire 3,908, and it is one defect with nine doors, not nine defects.
 *
 *   The damage is not to the ledger. The ledger is correct: debits 217,802,925 = credits 217,802,925,
 *   0 unbalanced entries, 0 postings missing their inline source_transaction_type/id, 3,083 reversal
 *   pairs that all net to zero on the same account. The damage is to what can be FOUND. The purge
 *   walks the spine to decide what to reverse, void and re-create; a posting that is not on it is
 *   invisible to that walk, so it is neither purged nor recognised when the same document is uploaded
 *   again — which is precisely how a duplicate is born.
 *
 * THE FIX IS STRUCTURAL, NOT A BACKFILL. Writing 3,908 links after the fact teaches a guard to say
 * yes while the next posting written through any of those eight doors is born detached again. Instead
 * the posting line and its spine row are inserted here, together, in the caller's transaction — so a
 * posting WITHOUT its lineage row is not something a caller can choose to write. Repoint the writer;
 * never drag the FK.
 *
 * The existing rows need no backfill either: the owner is purging and re-creating this data. With the
 * writers fixed first, every re-created document gets a complete spine by construction.
 */
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

async function writeLine(
  client: PostingWriterClient,
  line: PostingLineWrite,
  opts: { skipOnIdempotencyConflict: boolean }
): Promise<string | null> {
  if (!line.source_transaction_type || !line.source_transaction_id) {
    // Fail closed and loudly. A posting with no source cannot be traced, reversed by document, or
    // purged — the exact condition this file exists to make impossible.
    throw new Error(
      `posting_line_requires_source: journal_entry ${line.journal_entry_uuid} line ${line.line_sequence} ` +
        `was written with source_transaction_type=${String(line.source_transaction_type)} ` +
        `source_transaction_id=${String(line.source_transaction_id)}`
    );
  }

  // ROUND 390.1 — A REVERSAL LINE IS TERMINAL. Reversing a line that is itself a reversal re-posts the original's sign
  // and manufactures money that is not owed (measured 2026-10-04: 60 of 60 phantom A/P lines, $2,976.63, were
  // "Void reversal: REVERSAL: …" — the second void reversing the first void's line). Every reversal in the system is
  // written through this function, so it is refused here, by name, before anything is written.
  if (line.reversal_of_line_id) {
    const target = await client.query<{ is_reversal: boolean }>(
      `SELECT reversal_of_line_id IS NOT NULL AS is_reversal FROM accounting.journal_entry_postings WHERE id = $1::uuid`,
      [line.reversal_of_line_id]
    );
    if (target.rows[0]?.is_reversal) {
      throw new PostingLineIsAlreadyAReversalError(line.reversal_of_line_id);
    }
  }

  // D6 — every posting names its entity: the caller's, else its source document's (see resolvePostingSourceEntity).
  if (!line.entity_uuid) {
    const derived = await resolvePostingSourceEntity(client, line);
    if (derived) line = { ...line, entity_uuid: derived.entity_uuid, entity_type: derived.entity_type };
  }
  // LEAD 443.113 I-02 — the invariant is universal: a source type nobody classified is refused (no silent party-less
  // poster). A PARTY_FROM_DOCUMENT document's party was stamped just above whenever the document names one.
  if (postingPartyClass(line.source_transaction_type) === "unclassified") {
    throw new UnclassifiedPostingSourceTypeError(String(line.source_transaction_type));
  }
  // RULING 443.65 #2d — a line on a "Due to / from <party>" account names its party, or it is refused.
  if (!line.entity_uuid) {
    const party = await client.query<{ hit: number }>(
      `SELECT 1 AS hit FROM catalogs.accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND account_name LIKE 'Due to / from %' LIMIT 1`,
      [line.account_id, line.operating_company_id]
    );
    if (party.rows[0]) throw new RelatedPartyPostingWithoutPartyError(String(line.account_id), String(line.journal_entry_uuid));
  }
  // 443.42 #6 / 443.110 G8 — a Relay fill posting and a factoring lifecycle event carry their document's load
  // (posting_source_load_id cannot reach them).
  if (!line.load_id) {
    const load = await resolvePostingSourceLoad(client, line);
    if (load) line = { ...line, load_id: load };
  }
  // 443.110 G8 — a posting's load is its OWN company's load. A caller naming another company's load is refused by name.
  if (line.load_id) {
    // (A load that does not exist at all is refused by journal_entry_postings_load_id_fkey.)
    const foreign = await client.query<{ foreign_load: number }>(
      `SELECT 1 AS foreign_load FROM mdata.loads WHERE id = $1::uuid AND operating_company_id <> $2::uuid`,
      [line.load_id, line.operating_company_id]
    );
    if (foreign.rows[0]?.foreign_load === 1) {
      throw new PostingLoadOfAnotherCompanyError(String(line.load_id), String(line.operating_company_id));
    }
  }

  const ins = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.journal_entry_postings (
        operating_company_id,
        journal_entry_uuid,
        line_sequence,
        account_id,
        debit_or_credit,
        amount_cents,
        description,
        source_transaction_type,
        source_transaction_id,
        source_transaction_line_id,
        posting_batch_id,
        idempotency_key,
        class_id,
        entity_uuid,
        reversal_of_line_id,
        location_id,
        entity_type,
        load_id,
        settlement_id,
        created_at,
        updated_at
      )
      -- ROUND 363-CC1-A: the load stamp, resolved from this posting's own source document in the
      -- same statement, so it can never disagree with the source it was derived from. A reversal line
      -- carries the load of the line it reverses (its document may already be gone).
      VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11::uuid, $12, $13::uuid, $14::uuid, $15::uuid,
              $16::uuid, $17,
              -- 443.110 G8: a load derived from the source document stamps only when it is this company's load.
              COALESCE($18::uuid, (SELECT sl.id FROM mdata.loads sl
                                    WHERE sl.id = accounting.posting_source_load_id($8::text, $9::text, $10::text, $15::uuid)
                                      AND sl.operating_company_id = $1::uuid)),
              $19::uuid, now(), now())
      ${opts.skipOnIdempotencyConflict
        ? "ON CONFLICT (operating_company_id, idempotency_key, line_sequence) WHERE idempotency_key IS NOT NULL DO NOTHING"
        : ""}
      RETURNING id::text
    `,
    [
      line.operating_company_id,
      line.journal_entry_uuid,
      line.line_sequence,
      line.account_id,
      line.debit_or_credit,
      line.amount_cents,
      line.description,
      line.source_transaction_type,
      line.source_transaction_id,
      line.source_transaction_line_id ?? null,
      line.posting_batch_id ?? null,
      line.idempotency_key ?? null,
      line.class_id ?? null,
      line.entity_uuid ?? null,
      line.reversal_of_line_id ?? null,
      line.location_id ?? null,
      line.entity_type ?? null,
      line.load_id ?? null,
      line.settlement_id ?? null,
    ]
  );

  const postingId = ins.rows[0]?.id;
  if (!postingId) {
    // Only the idempotent variant may come back empty: the same key + line already exists — nothing was written,
    // so there is nothing to link.
    if (opts.skipOnIdempotencyConflict) return null;
    throw new Error("posting_line_insert_failed");
  }

  // AUTH-400 — BOTH DIRECTIONS, ALWAYS, HERE. A reversal line names its original (reversal_of_line_id); the original
  // must name it back (reversed_by_line_id) in the same transaction, or every liveness check reads the original as
  // live and the next void reverses it again. Callers no longer have to remember the second half (reclassify did not).
  // Only an unreversed original is stamped; one already reversed by ANOTHER line refuses the whole write.
  if (line.reversal_of_line_id) {
    const back = await client.query<{ id: string }>(
      `UPDATE accounting.journal_entry_postings
          SET reversed_by_line_id = $2::uuid, updated_at = now()
        WHERE id = $1::uuid AND (reversed_by_line_id IS NULL OR reversed_by_line_id = $2::uuid)
          AND operating_company_id = $3::uuid
        RETURNING id::text`,
      [line.reversal_of_line_id, postingId, line.operating_company_id]
    );
    if (!back.rows[0]) throw new PostingLineAlreadyReversedError(line.reversal_of_line_id);
  }

  await client.query(
    `
      INSERT INTO accounting.transaction_source_links (
        operating_company_id,
        journal_entry_posting_id,
        linked_object_type,
        linked_object_id,
        relationship_role
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5)
    `,
    [
      line.operating_company_id,
      postingId,
      line.spine_link?.linked_object_type ?? line.source_transaction_type,
      line.spine_link?.linked_object_id ?? line.source_transaction_id,
      line.relationship_role ?? "source_transaction",
    ]
  );

  return postingId;
}

/**
 * Insert ONE posting line and its lineage row, in the caller's transaction.
 *
 * Both statements run on the client the caller passes, so they commit or roll back together. There is
 * no path through this function that writes the posting and not the link.
 */
export async function insertPostingLineWithSpine(client: PostingWriterClient, line: PostingLineWrite): Promise<string> {
  return (await writeLine(client, line, { skipOnIdempotencyConflict: false }))!;
}

/**
 * ROUND 393.3 — the idempotent door (void, lease, period close, recurring): a line whose
 * (operating_company_id, idempotency_key, line_sequence) already exists is NOT written again and gets no second link;
 * returns null for it. Anything else is exactly insertPostingLineWithSpine.
 */
export async function insertPostingLineWithSpineIfNew(client: PostingWriterClient, line: PostingLineWrite): Promise<string | null> {
  return writeLine(client, line, { skipOnIdempotencyConflict: true });
}

/** Insert a whole balanced set in sequence, each line with its spine row. Returns the posting ids. */
export async function insertPostingLinesWithSpine(
  client: PostingWriterClient,
  lines: PostingLineWrite[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const line of lines) ids.push(await insertPostingLineWithSpine(client, line));
  return ids;
}
