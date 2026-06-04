import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { Eta } from "eta";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { sendEmail } from "../notifications/email.service.js";
import { sendSms } from "../sms/sender.js";

export type CustomerNotifyMilestone = "departed" | "arrived" | "near_arrival" | "delayed";

export type CustomerNotifyPreferences = {
  customer_id: string;
  opt_in: boolean;
  notify_sms: boolean;
  notify_email: boolean;
  notify_on_departed: boolean;
  notify_on_arrived: boolean;
  notify_on_near_arrival: boolean;
  notify_on_delayed: boolean;
};

const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../email/templates");
const eta = new Eta({ views: templatesDir, cache: process.env.NODE_ENV === "production" });

const DEFAULT_PREFS: Omit<CustomerNotifyPreferences, "customer_id"> = {
  opt_in: false,
  notify_sms: false,
  notify_email: true,
  notify_on_departed: true,
  notify_on_arrived: true,
  notify_on_near_arrival: true,
  notify_on_delayed: true,
};

type DbClient = Pick<PoolClient, "query">;

async function withCompany<T>(userId: string, operatingCompanyId: string, fn: (client: PoolClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_BASE_URL || "https://app.ih35dispatch.com").replace(/\/$/, "");
}

function portalTrackingUrl(loadId: string): string {
  return `${getFrontendBaseUrl()}/portal/loads/${encodeURIComponent(loadId)}`;
}

export function templateKeyForMilestone(type: CustomerNotifyMilestone, stopType?: string | null): string {
  if (type === "departed") return "portal-dispatched";
  if (type === "arrived") return stopType === "delivery" ? "portal-delivered" : "portal-arrived-pickup";
  if (type === "near_arrival") return "customer-notify-near-arrival";
  return "customer-notify-delayed";
}

export function shouldNotifyForMilestone(prefs: CustomerNotifyPreferences, type: CustomerNotifyMilestone): boolean {
  if (!prefs.opt_in) return false;
  if (type === "departed") return prefs.notify_on_departed;
  if (type === "arrived") return prefs.notify_on_arrived;
  if (type === "near_arrival") return prefs.notify_on_near_arrival;
  return prefs.notify_on_delayed;
}

export function shouldDispatchNearArrival(confidenceClass: string | null | undefined, predictedAt: string | null | undefined): boolean {
  if (!predictedAt) return false;
  const cls = (confidenceClass ?? "").toLowerCase();
  if (cls === "late" || cls === "late_risk") return false;
  const ms = new Date(predictedAt).getTime();
  if (!Number.isFinite(ms)) return false;
  const hoursUntil = (ms - Date.now()) / 3_600_000;
  return hoursUntil >= 0 && hoursUntil <= 2;
}

export function shouldDispatchDelayed(confidenceClass: string | null | undefined): boolean {
  const cls = (confidenceClass ?? "").toLowerCase();
  return cls === "late" || cls === "late_risk";
}

export function renderNotifyTemplate(
  templateKey: string,
  ctx: { title: string; loadNumber: string; route: string; trackingUrl: string; etaNote: string }
): string {
  return eta.render(templateKey, ctx);
}

export function buildSmsBody(milestone: CustomerNotifyMilestone, loadNumber: string, etaNote: string): string {
  if (milestone === "departed") return `IH35: Load ${loadNumber} has departed. ${etaNote}`;
  if (milestone === "arrived") return `IH35: Load ${loadNumber} has arrived at stop. ${etaNote}`;
  if (milestone === "near_arrival") return `IH35: Load ${loadNumber} is nearing arrival. ${etaNote}`;
  return `IH35: Load ${loadNumber} may be delayed. ${etaNote}`;
}

async function fetchPreferences(client: DbClient, operatingCompanyId: string, customerId: string): Promise<CustomerNotifyPreferences> {
  const res = await client.query<CustomerNotifyPreferences>(
    `
      SELECT
        customer_id::text,
        opt_in,
        notify_sms,
        notify_email,
        notify_on_departed,
        notify_on_arrived,
        notify_on_near_arrival,
        notify_on_delayed
      FROM dispatch.customer_notify_preferences
      WHERE operating_company_id = $1::uuid AND customer_id = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, customerId]
  );
  return res.rows[0] ?? { customer_id: customerId, ...DEFAULT_PREFS };
}

async function alreadyLogged(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    loadId: string;
    milestone: CustomerNotifyMilestone;
    channel: "sms" | "email";
    stopId?: string | null;
  }
): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1 FROM dispatch.notify_log
        WHERE operating_company_id = $1::uuid
          AND load_id = $2::uuid
          AND milestone_type = $3
          AND channel = $4
          AND COALESCE(stop_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          AND status IN ('sent', 'pending')
      ) AS exists
    `,
    [input.operatingCompanyId, input.loadId, input.milestone, input.channel, input.stopId ?? null]
  );
  return Boolean(res.rows[0]?.exists);
}

async function appendNotifyLog(
  client: DbClient,
  row: {
    operating_company_id: string;
    load_id: string;
    customer_id: string;
    stop_id?: string | null;
    milestone_type: CustomerNotifyMilestone;
    channel: "sms" | "email";
    recipient: string;
    template_key: string;
    subject?: string | null;
    status: "pending" | "sent" | "failed" | "skipped";
    provider_id?: string | null;
    error_message?: string | null;
    sent_at?: string | null;
  }
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO dispatch.notify_log (
        operating_company_id, load_id, customer_id, stop_id, milestone_type, channel,
        recipient, template_key, subject, provider_id, status, error_message, sent_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13::timestamptz)
      RETURNING id::text
    `,
    [
      row.operating_company_id,
      row.load_id,
      row.customer_id,
      row.stop_id ?? null,
      row.milestone_type,
      row.channel,
      row.recipient,
      row.template_key,
      row.subject ?? null,
      row.provider_id ?? null,
      row.status,
      row.error_message ?? null,
      row.sent_at ?? null,
    ]
  );
  return res.rows[0]?.id ?? "";
}

type LoadNotifyContext = {
  load_id: string;
  load_number: string;
  customer_id: string;
  customer_name: string | null;
  ar_email: string | null;
  ar_phone: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  latest_eta_prediction: Record<string, unknown> | null;
};

async function fetchLoadNotifyContext(client: DbClient, loadId: string): Promise<LoadNotifyContext | null> {
  const res = await client.query<LoadNotifyContext>(
    `
      SELECT
        l.id::text AS load_id,
        l.load_number,
        l.customer_id::text AS customer_id,
        c.customer_name,
        c.ar_email,
        c.ar_phone,
        sp.city AS pickup_city,
        sp.state AS pickup_state,
        sd.city AS delivery_city,
        sd.state AS delivery_state,
        l.latest_eta_prediction
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id
      LEFT JOIN LATERAL (
        SELECT city, state FROM mdata.load_stops WHERE load_id = l.id AND stop_type = 'pickup' ORDER BY sequence_number ASC LIMIT 1
      ) sp ON true
      LEFT JOIN LATERAL (
        SELECT city, state FROM mdata.load_stops WHERE load_id = l.id AND stop_type = 'delivery' ORDER BY sequence_number DESC LIMIT 1
      ) sd ON true
      WHERE l.id = $1::uuid AND l.soft_deleted_at IS NULL
      LIMIT 1
    `,
    [loadId]
  );
  return res.rows[0] ?? null;
}

async function dispatchCustomerNotify(
  client: DbClient,
  userId: string,
  operatingCompanyId: string,
  input: {
    load: LoadNotifyContext;
    prefs: CustomerNotifyPreferences;
    milestone: CustomerNotifyMilestone;
    stopId?: string | null;
    stopType?: string | null;
    etaNote: string;
  }
): Promise<{ sent: number; skipped: number }> {
  if (!shouldNotifyForMilestone(input.prefs, input.milestone)) {
    return { sent: 0, skipped: 1 };
  }

  const routeLabel =
    [input.load.pickup_city, input.load.pickup_state].filter(Boolean).join(", ") +
    " → " +
    [input.load.delivery_city, input.load.delivery_state].filter(Boolean).join(", ");
  const trackingUrl = portalTrackingUrl(input.load.load_id);
  const title = `Load ${input.load.load_number} update`;
  const templateKey = templateKeyForMilestone(input.milestone, input.stopType);
  const html = renderNotifyTemplate(templateKey, {
    title,
    loadNumber: input.load.load_number,
    route: routeLabel,
    trackingUrl,
    etaNote: input.etaNote,
  });
  const smsBody = buildSmsBody(input.milestone, input.load.load_number, input.etaNote);

  let sent = 0;
  let skipped = 0;

  if (input.prefs.notify_email) {
    const email = input.load.ar_email?.trim() ?? "";
    if (!email) {
      skipped += 1;
    } else if (await alreadyLogged(client, { operatingCompanyId, loadId: input.load.load_id, milestone: input.milestone, channel: "email", stopId: input.stopId })) {
      skipped += 1;
    } else {
      try {
        const result = await sendEmail({
          to: email,
          subject: title,
          html,
          sender: "dispatch",
          eventClass: `dispatch.customer_notify.${input.milestone}`,
          actorUserId: userId,
          tags: [
            { name: "type", value: "customer_eta_notify" },
            { name: "load_id", value: input.load.load_id },
            { name: "milestone", value: input.milestone },
          ],
        });
        await appendNotifyLog(client, {
          operating_company_id: operatingCompanyId,
          load_id: input.load.load_id,
          customer_id: input.load.customer_id,
          stop_id: input.stopId,
          milestone_type: input.milestone,
          channel: "email",
          recipient: email,
          template_key: templateKey,
          subject: title,
          provider_id: result.id,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        sent += 1;
      } catch (err) {
        await appendNotifyLog(client, {
          operating_company_id: operatingCompanyId,
          load_id: input.load.load_id,
          customer_id: input.load.customer_id,
          stop_id: input.stopId,
          milestone_type: input.milestone,
          channel: "email",
          recipient: email,
          template_key: templateKey,
          subject: title,
          status: "failed",
          error_message: String((err as Error)?.message ?? err),
        });
      }
    }
  }

  if (input.prefs.notify_sms) {
    const phone = input.load.ar_phone?.trim() ?? "";
    if (!phone) {
      skipped += 1;
    } else if (await alreadyLogged(client, { operatingCompanyId, loadId: input.load.load_id, milestone: input.milestone, channel: "sms", stopId: input.stopId })) {
      skipped += 1;
    } else {
      const sms = await sendSms({ to: phone, body: smsBody });
      if (sms.success) {
        await appendNotifyLog(client, {
          operating_company_id: operatingCompanyId,
          load_id: input.load.load_id,
          customer_id: input.load.customer_id,
          stop_id: input.stopId,
          milestone_type: input.milestone,
          channel: "sms",
          recipient: phone,
          template_key: templateKey,
          provider_id: sms.sid ?? null,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        sent += 1;
      } else {
        await appendNotifyLog(client, {
          operating_company_id: operatingCompanyId,
          load_id: input.load.load_id,
          customer_id: input.load.customer_id,
          stop_id: input.stopId,
          milestone_type: input.milestone,
          channel: "sms",
          recipient: phone,
          template_key: templateKey,
          status: "failed",
          error_message: sms.error ?? "sms_failed",
        });
      }
    }
  }

  return { sent, skipped };
}

/** Subscribes to confirmed stop arrivals — emits arrived milestone notifications. */
export async function processStopArrivalNotifications(
  client: DbClient,
  userId: string,
  operatingCompanyId: string
): Promise<{ processed: number; sent: number }> {
  const arrivals = await client.query<{
    load_id: string;
    stop_id: string;
    stop_type: string;
  }>(
    `
      SELECT l.id::text AS load_id, ls.id::text AS stop_id, ls.stop_type::text AS stop_type
      FROM dispatch.stop_arrivals sa
      JOIN mdata.load_stops ls ON ls.id = sa.stop_id
      JOIN mdata.loads l ON l.id = ls.load_id
      WHERE sa.operating_company_id = $1::uuid
        AND sa.confirmed_at IS NOT NULL
        AND sa.confirmed_at >= now() - interval '7 days'
        AND l.soft_deleted_at IS NULL
        AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery', 'delivered')
    `,
    [operatingCompanyId]
  );

  let processed = 0;
  let sent = 0;
  for (const row of arrivals.rows) {
    const load = await fetchLoadNotifyContext(client, row.load_id);
    if (!load) continue;
    const prefs = await fetchPreferences(client, operatingCompanyId, load.customer_id);
    const result = await dispatchCustomerNotify(client, userId, operatingCompanyId, {
      load,
      prefs,
      milestone: "arrived",
      stopId: row.stop_id,
      stopType: row.stop_type,
      etaNote: `Arrived at ${row.stop_type === "delivery" ? "delivery" : "pickup"} stop.`,
    });
    processed += 1;
    sent += result.sent;
  }

  const departures = await client.query<{ load_id: string; stop_id: string; stop_type: string }>(
    `
      SELECT l.id::text AS load_id, ls.id::text AS stop_id, ls.stop_type::text AS stop_type
      FROM mdata.load_stops ls
      JOIN mdata.loads l ON l.id = ls.load_id
      WHERE l.operating_company_id = $1::uuid
        AND ls.actual_departure_at IS NOT NULL
        AND ls.actual_departure_at >= now() - interval '7 days'
        AND l.soft_deleted_at IS NULL
        AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
    `,
    [operatingCompanyId]
  );

  for (const row of departures.rows) {
    const load = await fetchLoadNotifyContext(client, row.load_id);
    if (!load) continue;
    const prefs = await fetchPreferences(client, operatingCompanyId, load.customer_id);
    const result = await dispatchCustomerNotify(client, userId, operatingCompanyId, {
      load,
      prefs,
      milestone: "departed",
      stopId: row.stop_id,
      stopType: row.stop_type,
      etaNote: `Departed ${row.stop_type === "pickup" ? "pickup" : "stop"}.`,
    });
    processed += 1;
    sent += result.sent;
  }

  return { processed, sent };
}

/** Subscribes to ETA prediction updates — near-arrival and delayed milestones. */
export async function processEtaUpdateNotifications(
  client: DbClient,
  userId: string,
  operatingCompanyId: string
): Promise<{ processed: number; sent: number }> {
  const loads = await client.query<{ load_id: string; confidence_class: string | null; predicted_at: string | null }>(
    `
      SELECT
        l.id::text AS load_id,
        l.latest_eta_prediction->>'confidence_class' AS confidence_class,
        l.latest_eta_prediction->>'predicted_arrival_at' AS predicted_at
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')
        AND l.latest_eta_prediction IS NOT NULL
    `,
    [operatingCompanyId]
  );

  let processed = 0;
  let sent = 0;
  for (const row of loads.rows) {
    const load = await fetchLoadNotifyContext(client, row.load_id);
    if (!load) continue;
    const prefs = await fetchPreferences(client, operatingCompanyId, load.customer_id);
    const etaLabel = row.predicted_at ? new Date(row.predicted_at).toLocaleString() : "Check portal for live ETA.";

    if (shouldDispatchNearArrival(row.confidence_class, row.predicted_at)) {
      const result = await dispatchCustomerNotify(client, userId, operatingCompanyId, {
        load,
        prefs,
        milestone: "near_arrival",
        etaNote: etaLabel,
      });
      processed += 1;
      sent += result.sent;
    }

    if (shouldDispatchDelayed(row.confidence_class)) {
      const result = await dispatchCustomerNotify(client, userId, operatingCompanyId, {
        load,
        prefs,
        milestone: "delayed",
        etaNote: etaLabel,
      });
      processed += 1;
      sent += result.sent;
    }
  }

  return { processed, sent };
}

export async function syncCustomerNotifyFromEvents(userId: string, operatingCompanyId: string) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const arrivals = await processStopArrivalNotifications(client, userId, operatingCompanyId);
    const eta = await processEtaUpdateNotifications(client, userId, operatingCompanyId);

    await appendCrudAudit(
      client,
      userId,
      "dispatch.customer_notify.synced",
      {
        operating_company_id: operatingCompanyId,
        arrivals_processed: arrivals.processed,
        eta_processed: eta.processed,
        sent: arrivals.sent + eta.sent,
      },
      "info",
      "B21-D9"
    );

    return {
      arrivals_processed: arrivals.processed,
      eta_processed: eta.processed,
      sent: arrivals.sent + eta.sent,
    };
  });
}

export async function getCustomerNotifyPreferences(userId: string, operatingCompanyId: string, customerId: string) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const prefs = await fetchPreferences(client, operatingCompanyId, customerId);
    return { preferences: prefs };
  });
}

export async function upsertCustomerNotifyPreferences(
  userId: string,
  operatingCompanyId: string,
  customerId: string,
  patch: Partial<Omit<CustomerNotifyPreferences, "customer_id">>
) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const res = await client.query<CustomerNotifyPreferences>(
      `
        INSERT INTO dispatch.customer_notify_preferences (
          operating_company_id, customer_id,
          opt_in, notify_sms, notify_email,
          notify_on_departed, notify_on_arrived, notify_on_near_arrival, notify_on_delayed
        )
        VALUES (
          $1::uuid, $2::uuid,
          COALESCE($3, false), COALESCE($4, false), COALESCE($5, true),
          COALESCE($6, true), COALESCE($7, true), COALESCE($8, true), COALESCE($9, true)
        )
        ON CONFLICT (operating_company_id, customer_id) DO UPDATE SET
          opt_in = COALESCE($3, dispatch.customer_notify_preferences.opt_in),
          notify_sms = COALESCE($4, dispatch.customer_notify_preferences.notify_sms),
          notify_email = COALESCE($5, dispatch.customer_notify_preferences.notify_email),
          notify_on_departed = COALESCE($6, dispatch.customer_notify_preferences.notify_on_departed),
          notify_on_arrived = COALESCE($7, dispatch.customer_notify_preferences.notify_on_arrived),
          notify_on_near_arrival = COALESCE($8, dispatch.customer_notify_preferences.notify_on_near_arrival),
          notify_on_delayed = COALESCE($9, dispatch.customer_notify_preferences.notify_on_delayed),
          updated_at = now()
        RETURNING
          customer_id::text,
          opt_in, notify_sms, notify_email,
          notify_on_departed, notify_on_arrived, notify_on_near_arrival, notify_on_delayed
      `,
      [
        operatingCompanyId,
        customerId,
        patch.opt_in ?? null,
        patch.notify_sms ?? null,
        patch.notify_email ?? null,
        patch.notify_on_departed ?? null,
        patch.notify_on_arrived ?? null,
        patch.notify_on_near_arrival ?? null,
        patch.notify_on_delayed ?? null,
      ]
    );

    await appendCrudAudit(
      client,
      userId,
      "dispatch.customer_notify.preferences_updated",
      { operating_company_id: operatingCompanyId, customer_id: customerId, patch },
      "info",
      "B21-D9"
    );

    return { preferences: res.rows[0] };
  });
}

export async function listCustomerNotifyLog(
  userId: string,
  operatingCompanyId: string,
  options?: { customerId?: string; limit?: number }
) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
    const values: unknown[] = [operatingCompanyId];
    let customerFilter = "";
    if (options?.customerId) {
      values.push(options.customerId);
      customerFilter = `AND nl.customer_id = $2::uuid`;
    }
    values.push(limit);

    const res = await client.query(
      `
        SELECT
          nl.id::text,
          nl.load_id::text,
          nl.customer_id::text,
          nl.stop_id::text,
          nl.milestone_type,
          nl.channel,
          nl.recipient,
          nl.template_key,
          nl.subject,
          nl.provider_id,
          nl.status,
          nl.error_message,
          nl.sent_at::text,
          nl.created_at::text,
          l.load_number,
          c.customer_name
        FROM dispatch.notify_log nl
        JOIN mdata.loads l ON l.id = nl.load_id
        JOIN mdata.customers c ON c.id = nl.customer_id
        WHERE nl.operating_company_id = $1::uuid
          ${customerFilter}
        ORDER BY nl.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return { entries: res.rows, count: res.rowCount ?? 0 };
  });
}
