// CHAT-7 — driver PWA offline outbox for chat messages. Drivers lose signal crossing to Mexico /
// at truck stops; a message is queued locally the instant they hit Send and flushed when back online.
// The server dedups on client_key (CHAT-1 UNIQUE (thread_id, client_key)), so a flush is retry-safe:
// re-sending a queued item is a no-op that returns the existing row, never a duplicate.
const KEY = "ih35:chat-outbox";

export type OutboxItem = {
  thread_id: string;
  body: string;
  client_key: string; // stable idempotency key — the SAME key is reused on every retry
  created_at: number;
};

function readAll(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: OutboxItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / private mode — best effort */
  }
}

/** Queue a message. Idempotent on client_key (re-enqueuing the same key does not duplicate). */
export function enqueue(item: OutboxItem): void {
  const items = readAll();
  if (items.some((i) => i.client_key === item.client_key)) return;
  items.push(item);
  writeAll(items);
}

export function list(threadId?: string): OutboxItem[] {
  const items = readAll();
  return threadId ? items.filter((i) => i.thread_id === threadId) : items;
}

export function pendingCount(threadId?: string): number {
  return list(threadId).length;
}

export function remove(clientKey: string): void {
  writeAll(readAll().filter((i) => i.client_key !== clientKey));
}

/**
 * Flush the outbox oldest-first via `send`. On success an item is removed; on the FIRST failure we
 * stop (assume offline — don't hammer) and leave the rest queued. Returns how many were sent.
 * `send` MUST forward each item's client_key so the server dedups retries.
 */
export async function flush(send: (item: OutboxItem) => Promise<void>): Promise<number> {
  const items = readAll().sort((a, b) => a.created_at - b.created_at);
  let sent = 0;
  for (const item of items) {
    try {
      await send(item);
      remove(item.client_key);
      sent++;
    } catch {
      break; // offline / server error — keep this and the rest for the next flush
    }
  }
  return sent;
}
