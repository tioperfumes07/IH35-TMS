/**
 * WF-064 OVERRIDE NOTICE — enqueue onto the outbox the processor ACTUALLY drains.
 *
 * THE DEFECT, MEASURED ON PROD 2026-08-03 (positive control mdata.vendors = 2,828):
 *   outbox.outbox_queue   49 rows · ALL status 'PENDING' · attempts = 0 on every row · oldest 2026-06-16
 *   outbox.events     31,622 rows · 31,618 delivered · 0 undelivered · last delivery minutes ago
 * There are TWO outbox tables. processor.ts reads `outbox.events` and nothing anywhere in the backend
 * issues a SELECT or UPDATE against `outbox.outbox_queue` — it is written by a dozen producers and read
 * by no one. `attempts = 0` across 6.5 weeks is the proof: these events were never picked up even once.
 *
 * THIS CORRECTS AN EARLIER CLAIM OF MINE. The DispatchOverrideNoticeHandler header states the notices
 * had been "PERMANENTLY FAILING" because processor.ts calls markFailedNow() for an unregistered
 * event_type. That was wrong. The handler IS registered (handlers/registry.ts:101) and the processor is
 * healthy; the notices simply went into a table it never reads. Nothing failed — nothing was ever tried.
 *
 * WHY THIS MATTERS: an Owner pushing a dispatch past an OOS unit, a HOS violation or a federal
 * driver-qualification stop is exactly the event an insurer, a DOT reviewer or another Owner would
 * expect to be announced. Every one of those announcements has been sitting in a dead table.
 *
 * SCOPE, HONESTLY STATED: this repoints ONLY the override notice, because it is the only orphaned
 * event_type whose handler exists and is registered. The other seven types in outbox_queue
 * (driver_sms, factoring_packet, fuel_planner, load.created, load_notification, qbo_bill, qbo_invoice)
 * have NO registered handler — repointing them would convert a silent no-op into a loud failure loop
 * without delivering anything. They need handlers built first and are reported, not silently moved.
 *
 * THE 49 STRANDED ROWS ARE NOT REPLAYED HERE. Draining six-week-old events would fire real SMS,
 * factoring packets and QBO pushes for loads long since moved on. That is an owner decision about real
 * outbound side effects, not a migration.
 */

type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const OVERRIDE_NOTICE_EVENT_TYPE = "dispatch.wf064.override_notice";

export type OverrideNoticePayload = {
  override_type: string;
  operating_company_id: string;
  override_reason?: string | null;
  override_by_user_id?: string | null;
  override_class?: string;
  overridden_reasons?: unknown;
  notify_channels?: string[];
  load_context?: unknown;
};

/**
 * Enqueue a WF-064 override notice on the canonical outbox.
 *
 * `outbox.events` has no aggregate_type/aggregate_id columns, so the aggregate identity that
 * outbox_queue carried in dedicated columns is folded into the payload rather than dropped — losing
 * "which unit/driver was this override about" would make the alert unactionable.
 */
export async function enqueueOverrideNotice(
  client: Queryable,
  aggregateId: string | null | undefined,
  payload: OverrideNoticePayload
): Promise<void> {
  await client.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
    `,
    [
      OVERRIDE_NOTICE_EVENT_TYPE,
      JSON.stringify({
        aggregate_type: "dispatch.loads",
        aggregate_id: aggregateId ?? null,
        ...payload,
      }),
    ]
  );
}
