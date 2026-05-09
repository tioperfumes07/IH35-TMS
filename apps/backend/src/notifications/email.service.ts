import { Resend } from "resend";
import { withLuciaBypass } from "../auth/db.js";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type EmailSender = "noreply" | "dispatch";

type EmailTag = { name: string; value: string };

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  sender: EmailSender;
  replyTo?: string;
  tags?: EmailTag[];
  eventClass: string;
  recipientUserUuid?: string | null;
  actorUserId?: string | null;
};

async function appendEmailAudit(
  eventClass: "email.sent" | "email.failed",
  payload: Record<string, unknown>,
  actorUserId: string | null
) {
  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
        eventClass,
        eventClass === "email.failed" ? "warning" : "info",
        JSON.stringify(payload),
        actorUserId ?? null,
        "BT-3-NOTIFICATIONS-EMAIL",
      ]);
    });
  } catch {
    // Do not throw from audit logging in the email path.
  }
}

async function isSuppressed(recipientUserUuid: string | null | undefined, eventClass: string): Promise<boolean> {
  if (!recipientUserUuid) return false;
  try {
    return await withLuciaBypass(async (client) => {
      const regclass = await client.query<{ regclass: string | null }>(`SELECT to_regclass('notifications.suppression_rules') AS regclass`);
      if (!regclass.rows[0]?.regclass) return false;

      const suppressed = await client.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM notifications.suppression_rules
            WHERE user_uuid = $1::uuid
              AND event_class = $2
              AND now() BETWEEN effective_from AND effective_to
          ) AS exists
        `,
        [recipientUserUuid, eventClass]
      );
      return Boolean(suppressed.rows[0]?.exists);
    });
  } catch {
    return false;
  }
}

function senderAddress(sender: EmailSender) {
  if (sender === "dispatch") {
    if (!process.env.EMAIL_FROM_DISPATCH) throw new Error("E_EMAIL_SEND_FAILED: EMAIL_FROM_DISPATCH is missing");
    return { fromAddress: process.env.EMAIL_FROM_DISPATCH, fromName: "IH 35 Dispatch" };
  }
  if (!process.env.EMAIL_FROM_NOREPLY) throw new Error("E_EMAIL_SEND_FAILED: EMAIL_FROM_NOREPLY is missing");
  return { fromAddress: process.env.EMAIL_FROM_NOREPLY, fromName: "IH 35 TMS" };
}

export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  if (!resend) {
    const err = "RESEND_API_KEY is missing";
    await appendEmailAudit(
      "email.failed",
      {
        event_class: params.eventClass,
        sender: params.sender,
        subject: params.subject,
        to_count: Array.isArray(params.to) ? params.to.length : 1,
        error: err,
      },
      params.actorUserId ?? null
    );
    throw new Error(`E_EMAIL_SEND_FAILED: ${err}`);
  }

  if (await isSuppressed(params.recipientUserUuid, params.eventClass)) {
    await appendEmailAudit(
      "email.failed",
      {
        event_class: params.eventClass,
        sender: params.sender,
        subject: params.subject,
        to_count: Array.isArray(params.to) ? params.to.length : 1,
        error: "suppressed_by_rule",
      },
      params.actorUserId ?? null
    );
    throw new Error("E_EMAIL_SEND_FAILED: suppressed_by_rule");
  }

  const { fromAddress, fromName } = senderAddress(params.sender);
  const result = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
    tags: params.tags,
  });

  if (result.error || !result.data?.id) {
    const message = result.error?.message ?? "unknown_error";
    await appendEmailAudit(
      "email.failed",
      {
        event_class: params.eventClass,
        sender: params.sender,
        subject: params.subject,
        to_count: Array.isArray(params.to) ? params.to.length : 1,
        error: message,
      },
      params.actorUserId ?? null
    );
    throw new Error(`E_EMAIL_SEND_FAILED: ${message}`);
  }

  await appendEmailAudit(
    "email.sent",
    {
      event_class: params.eventClass,
      sender: params.sender,
      subject: params.subject,
      to_count: Array.isArray(params.to) ? params.to.length : 1,
      email_id: result.data.id,
      tags: params.tags ?? [],
    },
    params.actorUserId ?? null
  );

  return { id: result.data.id };
}
