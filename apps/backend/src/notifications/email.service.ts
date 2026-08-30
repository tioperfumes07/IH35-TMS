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

export type EmailSuppressionMatch = {
  reason: string;
  auto_suppressed: boolean;
};

export async function findActiveSuppression(
  recipientUserUuid: string | null | undefined,
  eventClass: string,
): Promise<EmailSuppressionMatch | null> {
  if (!recipientUserUuid) return null;
  // LV-EMAIL-SUPPRESSION-FAILS-OPEN: never fail-OPEN. Missing table / query error must throw
  // (fail-loud) so sendEmail does not silently mail opted-out / bouncing recipients.
  return await withLuciaBypass(async (client) => {
    const regclass = await client.query<{ regclass: string | null }>(
      `SELECT to_regclass('notifications.suppression_rules') AS regclass`
    );
    if (!regclass.rows[0]?.regclass) {
      throw new Error(
        "E_SUPPRESSION_CONTROL_UNAVAILABLE: notifications.suppression_rules missing — fail-closed"
      );
    }

    const suppressed = await client.query<EmailSuppressionMatch>(
      `
          SELECT reason, auto_suppressed
          FROM notifications.suppression_rules
          WHERE user_uuid = $1::uuid
            AND event_class = $2
            AND now() BETWEEN effective_from AND effective_to
          ORDER BY effective_from DESC, created_at DESC
          LIMIT 1
        `,
      [recipientUserUuid, eventClass]
    );
    return suppressed.rows[0] ?? null;
  });
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
  const emailTestMode = process.env.EMAIL_TEST_MODE === "1";
  if (emailTestMode) {
    const fakeId = `test-email-${Date.now()}`;
    await appendEmailAudit(
      "email.sent",
      {
        event_class: params.eventClass,
        sender: params.sender,
        subject: params.subject,
        to_count: Array.isArray(params.to) ? params.to.length : 1,
        email_id: fakeId,
        mode: "test_bypass",
      },
      params.actorUserId ?? null
    );
    return { id: fakeId };
  }

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

  let suppression: EmailSuppressionMatch | null = null;
  try {
    suppression = await findActiveSuppression(params.recipientUserUuid, params.eventClass);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
    throw err instanceof Error ? err : new Error(message);
  }

  if (suppression) {
    await appendEmailAudit(
      "email.failed",
      {
        event_class: params.eventClass,
        sender: params.sender,
        subject: params.subject,
        to_count: Array.isArray(params.to) ? params.to.length : 1,
        error: "suppressed_by_rule",
        suppression_reason: suppression.reason,
        auto_suppressed: suppression.auto_suppressed,
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
