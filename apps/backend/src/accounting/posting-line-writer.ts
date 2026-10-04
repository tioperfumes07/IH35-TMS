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
};

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
        created_at,
        updated_at
      )
      -- ROUND 363-CC1-A: the load stamp, resolved from this posting's own source document in the
      -- same statement, so it can never disagree with the source it was derived from. A reversal line
      -- carries the load of the line it reverses (its document may already be gone).
      VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11::uuid, $12, $13::uuid, $14::uuid, $15::uuid,
              $16::uuid, $17,
              COALESCE($18::uuid, accounting.posting_source_load_id($8::text, $9::text, $10::text, $15::uuid)), now(), now())
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
    ]
  );

  const postingId = ins.rows[0]?.id;
  if (!postingId) {
    // Only the idempotent variant may come back empty: the same key + line already exists — nothing was written,
    // so there is nothing to link.
    if (opts.skipOnIdempotencyConflict) return null;
    throw new Error("posting_line_insert_failed");
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
