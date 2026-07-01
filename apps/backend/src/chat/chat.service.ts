// CHAT-2 — per-load dispatch chat service. Runs INSIDE a withCompanyScope/withCurrentUser
// transaction (SET LOCAL ROLE ih35_app + app.current_user_id + app.operating_company_id already
// set → two-layer RLS enforced, and the whole callback is one atomic BEGIN..COMMIT). Schema =
// CHAT-1 (db/migrations/202607012000_chat_dispatch_schema.sql). NO money path — chat never posts GL.
//
// Invariants carried from the CHAT-1 directive:
//   - seq is server-authoritative, gap-free, race-safe: lock the thread row FOR UPDATE, dedup on
//     client_key BEFORE consuming a seq, then increment last_seq. A retried client_key never burns a seq.
//   - every committed message emits ONE events.log_event row (auto hash-chained) in the SAME txn;
//     subject_type is 'load'/'driver' (the spine CHECK excludes 'message') with message_id in payload;
//     the returned event_id is stored back on chat.messages.event_log_id.
//   - append-only: no UPDATE of content (DB trigger enforces); tombstone is the only mutation.

type Client = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount: number }> };

export type ChatSender =
  | { party_type: "office"; office_user_id: string }
  | { party_type: "driver"; driver_id: string }
  | { party_type: "system" };

export type PostMessageInput = {
  thread_id: string;
  /** Ignored for writes — the locked thread's own operating_company_id is authoritative. Kept for callers. */
  operating_company_id?: string;
  sender: ChatSender;
  msg_type: "text" | "photo" | "document" | "confirmation_request" | "confirmation_ack" | "cash_advance_card" | "system_event";
  body?: string | null;
  body_lang?: string | null;
  client_key: string;
  content_sha256: string;
  cash_advance_request_id?: string | null;
  references_message_id?: string | null;
  ack_content_sha256?: string | null;
};

const MESSAGE_COLS =
  "id, thread_id, operating_company_id, seq, sender_party_type, sender_office_user_id, sender_driver_id, " +
  "msg_type, body, body_lang, client_key, content_sha256, cash_advance_request_id, references_message_id, " +
  "ack_content_sha256, status, tombstoned_at, event_log_id, server_ts, created_at";

/** Get the existing per-load thread or create it (kind='load'), seeding office creator + assigned driver. */
export async function getOrCreateLoadThread(
  client: Client,
  args: { operating_company_id: string; load_id: string; actor_user_id: string },
): Promise<{ id: string; created: boolean }> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM chat.threads WHERE operating_company_id = $1 AND load_id = $2 AND kind = 'load' LIMIT 1`,
    [args.operating_company_id, args.load_id],
  );
  if (existing.rows[0]) {
    // ensure the acting office user is a participant (idempotent) so they can see the thread under RLS.
    await client.query(
      `INSERT INTO chat.participants (thread_id, operating_company_id, party_type, office_user_id, role)
       VALUES ($1, $2, 'office', $3, 'dispatcher')
       ON CONFLICT (thread_id, party_type, office_user_id, driver_id) DO NOTHING`,
      [existing.rows[0].id, args.operating_company_id, args.actor_user_id],
    );
    return { id: existing.rows[0].id, created: false };
  }

  const load = await client.query<{ load_number: string | null; assigned_primary_driver_id: string | null }>(
    `SELECT load_number, assigned_primary_driver_id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
    [args.load_id, args.operating_company_id],
  );
  if (!load.rows[0]) throw new Error("load_not_found");

  const thread = await client.query<{ id: string }>(
    `INSERT INTO chat.threads (operating_company_id, kind, load_id, load_ref_cache, created_by)
     VALUES ($1, 'load', $2, $3, $4) RETURNING id`,
    [args.operating_company_id, args.load_id, load.rows[0].load_number, args.actor_user_id],
  );
  const threadId = thread.rows[0].id;

  await client.query(
    `INSERT INTO chat.participants (thread_id, operating_company_id, party_type, office_user_id, role)
     VALUES ($1, $2, 'office', $3, 'dispatcher')`,
    [threadId, args.operating_company_id, args.actor_user_id],
  );
  if (load.rows[0].assigned_primary_driver_id) {
    await client.query(
      `INSERT INTO chat.participants (thread_id, operating_company_id, party_type, driver_id, role)
       VALUES ($1, $2, 'driver', $3, 'primary_driver')`,
      [threadId, args.operating_company_id, load.rows[0].assigned_primary_driver_id],
    );
  }
  return { id: threadId, created: true };
}

/** List the caller's threads (RLS already restricts to threads they participate in). */
export async function listThreads(client: Client): Promise<Array<Record<string, unknown>>> {
  const res = await client.query(
    `SELECT id, kind, load_id, load_ref_cache, subject, status, last_seq, updated_at
     FROM chat.threads ORDER BY updated_at DESC LIMIT 200`,
  );
  return res.rows;
}

/** Thread messages after a seq cursor (RLS enforces participant membership). */
export async function getThreadMessages(
  client: Client,
  threadId: string,
  opts: { after_seq?: number; limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const res = await client.query(
    `SELECT ${MESSAGE_COLS} FROM chat.messages
     WHERE thread_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT $3`,
    [threadId, opts.after_seq ?? 0, limit],
  );
  return res.rows;
}

/**
 * Post a message: gap-free, race-safe, idempotent, atomically event-log-chained + receipted.
 * subjectTypeForEvent/subjectIdForEvent MUST be a valid events.event_log subject_type ('load'/'driver').
 */
export async function postMessage(
  client: Client,
  input: PostMessageInput,
  eventSubject: { subject_type: "load" | "driver"; subject_id: string },
): Promise<{ message: Record<string, unknown>; deduped: boolean }> {
  // 1. lock the thread row FIRST (serializes concurrent posts on this thread; no seq consumed yet).
  const locked = await client.query<{ last_seq: string; operating_company_id: string }>(
    `SELECT last_seq, operating_company_id FROM chat.threads WHERE id = $1 FOR UPDATE`,
    [input.thread_id],
  );
  if (!locked.rows[0]) throw new Error("thread_not_found");
  // The thread's own entity is authoritative — never trust a caller-supplied operating_company_id.
  const operatingCompanyId = locked.rows[0].operating_company_id;

  // 2. dedup BEFORE consuming a seq — a retried client_key returns the existing row, no gap.
  const dup = await client.query(
    `SELECT ${MESSAGE_COLS} FROM chat.messages WHERE thread_id = $1 AND client_key = $2 LIMIT 1`,
    [input.thread_id, input.client_key],
  );
  if (dup.rows[0]) return { message: dup.rows[0], deduped: true };

  // 3. consume the next seq.
  const nextSeq = Number(locked.rows[0].last_seq) + 1;
  await client.query(`UPDATE chat.threads SET last_seq = $2, updated_at = now() WHERE id = $1`, [input.thread_id, nextSeq]);

  const s = input.sender;
  const inserted = await client.query(
    `INSERT INTO chat.messages
       (thread_id, operating_company_id, seq, sender_party_type, sender_office_user_id, sender_driver_id,
        msg_type, body, body_lang, client_key, content_sha256, cash_advance_request_id,
        references_message_id, ack_content_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING ${MESSAGE_COLS}`,
    [
      input.thread_id, operatingCompanyId, nextSeq, s.party_type,
      s.party_type === "office" ? s.office_user_id : null,
      s.party_type === "driver" ? s.driver_id : null,
      input.msg_type, input.body ?? null, input.body_lang ?? null, input.client_key, input.content_sha256,
      input.cash_advance_request_id ?? null, input.references_message_id ?? null, input.ack_content_sha256 ?? null,
    ],
  );
  const message = inserted.rows[0] as Record<string, unknown>;
  const messageId = message.id as string;

  // 4. emit exactly one events.log_event row (auto hash-chained) — same txn, so a message is never un-chained.
  const actorType = s.party_type === "office" ? "user" : s.party_type === "driver" ? "driver" : "system";
  const actorId = s.party_type === "office" ? s.office_user_id : s.party_type === "driver" ? s.driver_id : null;
  const eventType =
    input.msg_type === "confirmation_ack" ? "chat.confirmation_ack" :
    input.msg_type === "cash_advance_card" ? "chat.cash_advance_card" : "chat.message";
  const payload = {
    thread_id: input.thread_id, message_id: messageId, seq: nextSeq,
    sender_party_type: s.party_type, msg_type: input.msg_type, content_sha256: input.content_sha256,
    cash_advance_request_id: input.cash_advance_request_id ?? null, ack_content_sha256: input.ack_content_sha256 ?? null,
  };
  // system messages have no actor uuid; log_event requires actor_id NOT NULL → attribute to the thread's load/driver subject.
  const evActorType = actorId ? actorType : "system";
  const evActorId = actorId ?? eventSubject.subject_id;
  const ev = await client.query<{ log_event: string }>(
    `SELECT events.log_event($1, $2, $3, $4, $5, $6, $7::jsonb, $8) AS log_event`,
    [operatingCompanyId, eventType, evActorType, evActorId, eventSubject.subject_type, eventSubject.subject_id, JSON.stringify(payload), message.server_ts],
  );
  await client.query(`UPDATE chat.messages SET event_log_id = $2 WHERE id = $1`, [messageId, ev.rows[0].log_event]);

  // 5. seed 'sent' receipts for every other participant.
  await client.query(
    `INSERT INTO chat.message_receipts (message_id, participant_id, operating_company_id, state)
     SELECT $1, p.id, $2, 'sent' FROM chat.participants p
     WHERE p.thread_id = $3 AND p.left_at IS NULL
       AND NOT (p.party_type = 'office' AND p.office_user_id = $4)
       AND NOT (p.party_type = 'driver' AND p.driver_id = $5)
     ON CONFLICT (message_id, participant_id) DO NOTHING`,
    [messageId, operatingCompanyId, input.thread_id,
     s.party_type === "office" ? s.office_user_id : null,
     s.party_type === "driver" ? s.driver_id : null],
  );

  return { message: { ...message, event_log_id: ev.rows[0].log_event }, deduped: false };
}

/** Advance a recipient's receipt state forward only (sent -> delivered -> read). */
export async function advanceReceipt(
  client: Client,
  args: { message_id: string; participant_id: string; state: "delivered" | "read" },
): Promise<void> {
  const rank = args.state === "read" ? 2 : 1;
  // operating_company_id is derived from the message (chat.* — the message's entity is authoritative).
  await client.query(
    `INSERT INTO chat.message_receipts (message_id, participant_id, operating_company_id, state, state_at)
     SELECT $1, $2, m.operating_company_id, $3, now() FROM chat.messages m WHERE m.id = $1
     ON CONFLICT (message_id, participant_id) DO UPDATE SET state = EXCLUDED.state, state_at = now()
     WHERE (CASE chat.message_receipts.state WHEN 'read' THEN 2 WHEN 'delivered' THEN 1 ELSE 0 END) < $4`,
    [args.message_id, args.participant_id, args.state, rank],
  );
}

/** Presign an R2 upload for a chat attachment (upload-then-commit: the message/attachment commits only after upload). */
export function attachmentR2Key(operatingCompanyId: string, threadId: string, sha256: string, ext: string): string {
  return `chat/${operatingCompanyId}/${threadId}/${sha256}.${ext}`;
}
