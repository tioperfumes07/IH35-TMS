export async function emitOk(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }) {
  await client.query("INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())", [
    "known.event",
    "{}",
  ]);
}
