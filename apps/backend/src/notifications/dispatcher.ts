import { withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { sendSms } from "../sms/sender.js";
import { sendWhatsAppMessage } from "../whatsapp/sender.js";
import { whatsappTemplateRegistry } from "../whatsapp/templates/index.js";

export type NotificationEventType =
  | "load_assignment"
  | "settlement_ready"
  | "cash_advance_request"
  | "qbo_sync_error"
  | "abandoned_load";

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};

type ChannelSnapshot = { attempted?: boolean; ok?: boolean; error?: string };

export type DispatchNotificationInput = {
  user_id: string;
  event_type: NotificationEventType;
  payload: Record<string, unknown>;
  actor_user_id?: string | null;
};

export type DispatchNotificationResult = {
  ok: boolean;
  channels?: Record<string, ChannelSnapshot>;
  error?: string;
};

function readBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

async function loadPrefs(client: QueryableClient, userId: string) {
  const defaults = { email: true, sms: false, whatsapp: false };
  try {
    const reg = await client.query(`SELECT to_regclass('identity.user_notification_preferences') AS r`);
    const exists = Boolean((reg.rows[0] as { r?: unknown } | undefined)?.r);
    if (!exists) return defaults;

    let rowRes: { rows: Record<string, unknown>[] };
    try {
      rowRes = (await client.query(`SELECT * FROM identity.user_notification_preferences WHERE user_uuid = $1::uuid LIMIT 1`, [
        userId,
      ])) as { rows: Record<string, unknown>[] };
    } catch {
      rowRes = (await client.query(`SELECT * FROM identity.user_notification_preferences WHERE user_id = $1::uuid LIMIT 1`, [
        userId,
      ])) as { rows: Record<string, unknown>[] };
    }

    const row = rowRes.rows[0];
    if (!row) return defaults;

    return {
      email: readBool(row.email_enabled ?? row.notify_email ?? row.email, true),
      sms: readBool(row.sms_enabled ?? row.notify_sms ?? row.sms, false),
      whatsapp: readBool(row.whatsapp_enabled ?? row.notify_whatsapp ?? row.whatsapp, false),
    };
  } catch (error) {
    console.warn("[notifications] preference_lookup_failed", String((error as Error)?.message ?? error));
    return defaults;
  }
}

async function appendNotificationAudit(
  client: QueryableClient,
  input: DispatchNotificationInput,
  channels: Record<string, ChannelSnapshot>
) {
  try {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      "notification.sent",
      "info",
      JSON.stringify({
        action: "notification.sent",
        user_id: input.user_id,
        event_type: input.event_type,
        channels,
      }),
      input.actor_user_id ?? null,
      "P7-BLOCK-F-NOTIFICATIONS",
    ]);
  } catch (error) {
    console.warn("[notifications] audit_append_failed", String((error as Error)?.message ?? error));
  }
}

function stringPayload(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function buildEmailPlan(eventType: NotificationEventType, payload: Record<string, unknown>) {
  if (eventType === "settlement_ready") {
    return {
      templateKey: "settlement-ready",
      subject:
        stringPayload(payload, "email_subject") ||
        `Settlement ready — ${stringPayload(payload, "settlement_no") || "settlement"}`,
      templateVars: {
        driverName: stringPayload(payload, "driverName"),
        settlementLabel: stringPayload(payload, "settlementLabel"),
        amountLabel: stringPayload(payload, "amountLabel"),
      },
    };
  }

  if (eventType === "qbo_sync_error") {
    const headline = stringPayload(payload, "headline") || "QuickBooks sync issue";
    const bodyText = stringPayload(payload, "bodyText") || "";
    return {
      templateKey: "qbo-sync-alert",
      subject: headline,
      templateVars: { headline, bodyText },
    };
  }

  const title = stringPayload(payload, "headline") || stringPayload(payload, "title") || "IH35 notification";
  const bodyText = stringPayload(payload, "bodyText") || stringPayload(payload, "body") || "";
  return {
    templateKey: "notification-dispatch",
    subject: title,
    templateVars: { title, bodyText },
  };
}

function resolveWhatsAppPlan(
  eventType: NotificationEventType,
  payload: Record<string, unknown>
): { to: string; template_name: string; variables: Record<string, string> } | null {
  if (payload.whatsapp_skip === true) return null;
  const to = stringPayload(payload, "whatsapp_to") || stringPayload(payload, "sms_to");
  if (!to) return null;

  if (eventType === "load_assignment") {
    return {
      to,
      template_name: "ih35_load_assignment_v1",
      variables: {
        driver_name: stringPayload(payload, "driver_name"),
        origin: stringPayload(payload, "origin"),
        dest: stringPayload(payload, "dest"),
        rate: stringPayload(payload, "rate"),
        link: stringPayload(payload, "link"),
      },
    };
  }
  if (eventType === "settlement_ready") {
    return {
      to,
      template_name: "ih35_settlement_ready_v1",
      variables: {
        settlement_no: stringPayload(payload, "settlement_no"),
        net: stringPayload(payload, "net"),
        link: stringPayload(payload, "link"),
      },
    };
  }
  if (eventType === "abandoned_load") {
    return {
      to,
      template_name: "ih35_abandoned_load_v1",
      variables: {
        load_no: stringPayload(payload, "load_no"),
        driver_name: stringPayload(payload, "driver_name"),
      },
    };
  }
  return null;
}

function templateExists(templateName: string) {
  return whatsappTemplateRegistry.some((entry) => entry.name === templateName);
}

function buildSmsBody(eventType: NotificationEventType, payload: Record<string, unknown>): string {
  const explicit = stringPayload(payload, "sms_body");
  if (explicit) return explicit.slice(0, 480);
  if (eventType === "load_assignment") {
    return `New load assigned: ${stringPayload(payload, "load_label") || stringPayload(payload, "load_id")}.`;
  }
  if (eventType === "settlement_ready") {
    return `Settlement ${stringPayload(payload, "settlement_no")} is ready (${stringPayload(payload, "net")}).`;
  }
  if (eventType === "cash_advance_request") {
    return stringPayload(payload, "headline") || "Cash advance request submitted.";
  }
  if (eventType === "qbo_sync_error") {
    return stringPayload(payload, "sms_body_short") || `QBO sync error: ${stringPayload(payload, "kind") || "failure"}`;
  }
  if (eventType === "abandoned_load") {
    return `Load ${stringPayload(payload, "load_no")} marked abandoned (${stringPayload(payload, "driver_name")}).`;
  }
  return "IH35 notification";
}

export async function dispatchNotification(input: DispatchNotificationInput): Promise<DispatchNotificationResult> {
  const payload = input.payload ?? {};
  const operatingCompanyId = stringPayload(payload, "operating_company_id");
  if (!operatingCompanyId || !input.user_id) {
    return { ok: false, error: "missing_operating_company_or_user" };
  }

  const channels: Record<string, ChannelSnapshot> = {};

  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const prefs = await loadPrefs(client as QueryableClient, input.user_id);

      const userRes = await client.query<{ email: string | null }>(
        `SELECT email FROM identity.users WHERE uuid = $1::uuid LIMIT 1`,
        [input.user_id]
      );
      const email = String(userRes.rows[0]?.email ?? "").trim();

      const skipEmail = payload.skip_email === true;

      if (prefs.email && email && !skipEmail) {
        channels.email = { attempted: true };
        try {
          const plan = buildEmailPlan(input.event_type, payload);
          await enqueueEmail({
            operatingCompanyId,
            toAddresses: [email],
            subject: plan.subject,
            templateKey: plan.templateKey,
            templateVars: plan.templateVars,
            queuedByUserId: input.actor_user_id ?? null,
          });
          channels.email.ok = true;
        } catch (error) {
          channels.email.ok = false;
          channels.email.error = String((error as Error)?.message ?? "email_enqueue_failed");
          console.warn("[notifications] email_enqueue_failed", channels.email.error);
        }
      }

      const smsTo = stringPayload(payload, "sms_to");
      if (prefs.sms && smsTo) {
        channels.sms = { attempted: true };
        const body = buildSmsBody(input.event_type, payload);
        const smsResult = await sendSms({ to: smsTo, body });
        channels.sms.ok = smsResult.success;
        if (!smsResult.success) channels.sms.error = smsResult.error;
      }

      const waPlan = resolveWhatsAppPlan(input.event_type, payload);
      if (prefs.whatsapp && waPlan) {
        channels.whatsapp = { attempted: true };
        if (!templateExists(waPlan.template_name)) {
          channels.whatsapp.ok = false;
          channels.whatsapp.error = "unknown_whatsapp_template";
        } else {
          const result = await sendWhatsAppMessage({
            to: waPlan.to,
            template_name: waPlan.template_name,
            variables: waPlan.variables,
          });
          channels.whatsapp.ok = result.success;
          if (!result.success) channels.whatsapp.error = result.error;
        }
      }

      await appendNotificationAudit(client as QueryableClient, input, channels);
    });

    return { ok: true, channels };
  } catch (error) {
    const message = String((error as Error)?.message ?? "dispatch_failed");
    console.warn("[notifications] dispatch_notification_failed", message);
    return { ok: false, error: message, channels };
  }
}

export async function listCompanyUserIdsByRoles(
  operatingCompanyId: string,
  roles: readonly string[]
): Promise<string[]> {
  try {
    return await withLuciaBypass(async (client) => {
      const res = await client.query<{ uuid: string }>(
        `
          SELECT DISTINCT u.uuid
          FROM identity.users u
          JOIN org.user_company_access uca
            ON uca.user_id = u.uuid
           AND uca.deactivated_at IS NULL
           AND uca.company_id = $1::uuid
          WHERE u.deactivated_at IS NULL
            AND u.role::text = ANY($2::text[])
        `,
        [operatingCompanyId, roles]
      );
      return res.rows.map((row) => String(row.uuid));
    });
  } catch (error) {
    console.warn("[notifications] list_company_users_failed", String((error as Error)?.message ?? error));
    return [];
  }
}

export async function notifyOwnersCashAdvanceSubmitted(input: {
  operatingCompanyId: string;
  request: Record<string, unknown>;
  actorUserId: string;
}) {
  const owners = await listCompanyUserIdsByRoles(input.operatingCompanyId, ["Owner"]);
  const displayId = String(input.request.display_id ?? "");
  const cents = Number(input.request.requested_amount_cents ?? 0);
  const amountLabel = `USD ${(cents / 100).toFixed(2)}`;
  const headline = `Cash advance request ${displayId}`;
  const bodyText = `A driver submitted cash advance ${displayId} for ${amountLabel}.`;

  await Promise.all(
    owners.map((userId) =>
      dispatchNotification({
        user_id: userId,
        event_type: "cash_advance_request",
        actor_user_id: input.actorUserId,
        payload: {
          operating_company_id: input.operatingCompanyId,
          request_id: String(input.request.id ?? ""),
          headline,
          bodyText,
          sms_body: `${headline} (${amountLabel}).`,
          whatsapp_skip: true,
        },
      }).catch(() => undefined)
    )
  );
}

export async function notifyAbandonedLoadStakeholders(input: {
  operatingCompanyId: string;
  loadId: string;
  actorUserId: string;
}) {
  const detail = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const res = await client.query<{ load_number: string | null; driver_name: string | null }>(
      `
        SELECT
          l.load_number,
          concat_ws(' ', d.first_name, d.last_name) AS driver_name
        FROM mdata.loads l
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
        WHERE l.id = $1::uuid
          AND l.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.loadId, input.operatingCompanyId]
    );
    return res.rows[0] ?? null;
  }).catch(() => null);

  const loadNo = String(detail?.load_number ?? input.loadId.slice(0, 8));
  const driverName = String(detail?.driver_name ?? "Unassigned");
  const headline = `Load ${loadNo} abandoned`;
  const bodyText = `Load ${loadNo} was moved to abandoned status (driver: ${driverName}).`;

  const recipients = await listCompanyUserIdsByRoles(input.operatingCompanyId, ["Owner", "Administrator"]);
  await Promise.all(
    recipients.map((userId) =>
      dispatchNotification({
        user_id: userId,
        event_type: "abandoned_load",
        actor_user_id: input.actorUserId,
        payload: {
          operating_company_id: input.operatingCompanyId,
          load_id: input.loadId,
          load_no: loadNo,
          driver_name: driverName,
          headline,
          bodyText,
          sms_body: `${headline}. Driver ${driverName}.`,
        },
      }).catch(() => undefined)
    )
  );
}
