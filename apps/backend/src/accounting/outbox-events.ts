export async function enqueueAccountingOutbox(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  operatingCompanyId: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>
) {
  await client.query(
    `
      INSERT INTO accounting.outbox_events (
        operating_company_id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        status
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
    `,
    [operatingCompanyId, eventType, aggregateType, aggregateId, JSON.stringify(payload)]
  );
}
