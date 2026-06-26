// BLOCK-RELIABILITY-08 — shared reliability-alarm spine (3-channel: on-screen + email + SMS).
//
// The ONE place every reliability monitor (R-05 spine heartbeat, R-01 balanced-ledger, R-03 drift)
// raises an alarm, so they all "tell Jorge everywhere" truthfully (00b-ALARM-DELIVERY-SPEC). Reuses the
// EXISTING senders — does NOT build a new notifier:
//   - on-screen : createNotification(type='system')  -> notifications.user_notifications
//   - email     : enqueueEmail(templateKey='notification-dispatch')  (vars: title, bodyText)
//   - SMS       : sendSms(...)  for CRITICAL only
//
// SEVERITY → CHANNELS (00b): critical = on-screen + email + SMS;  warning = on-screen + email;
//   info = on-screen only.  CRITICAL bypasses per-user preference gating AND quiet-hours — a money/
//   audit/spine alarm must not be silenceable (Jorge: "tell me everywhere so I find out fast").
//
// FAIL-LOUD: every channel send is wrapped so one failure is logged + recorded and NEVER swallowed
// (else we'd rebuild the silent-failure inside the alarm system). Each alarm is also written to
// audit.append_event (append-only durable record), mirroring error-digest.cron.
//
// SCHEMA REALITY (verified 2026-06-26 — do not "fix" against stale assumptions):
//   - There is NO `notifications.alarm_event`. The only alarm_event is `driveralert.alarm_event`, which
//     is dispatch-coupled (dispatch_id NOT NULL) and CANNOT host reliability alarms. So the ack /
//     re-alarm / office-override / expire LIFECYCLE needs its own table — a gated follow-up
//     (notifications.reliability_alarm), NOT built here. This module is the DISPATCH spine only.
//   - identity.users has no phone column → SMS target comes from env RELIABILITY_ALARM_SMS_TO (a gated
//     users.phone column is the cleaner long-term source; flagged).

import { withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { sendSms } from "../sms/sender.js";
import { createNotification, type NotificationSeverity } from "./notification.service.js";

export type ReliabilityAlarmSeverity = "critical" | "warning" | "info";

export type ReliabilityAlarmInput = {
  operatingCompanyId: string;
  severity: ReliabilityAlarmSeverity;
  /** short source tag, e.g. "spine-heartbeat" / "balanced-ledger" / "recon-drift" (BLOCK-RELIABILITY-0x). */
  source: string;
  title: string;
  body: string;
  /** optional short SMS text; falls back to title. */
  smsBody?: string;
};

export type ReliabilityAlarmResult = {
  onScreen: { ok: boolean; recipients: number; error?: string };
  email: { ok: boolean; recipients: number; error?: string; skipped?: boolean };
  sms: { ok: boolean; error?: string; skipped?: boolean };
  audit: { ok: boolean; error?: string };
};

type Logger = { error: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void };
const consoleLogger: Logger = {
  error: (o, m) => console.error(m ?? "", o),
  warn: (o, m) => console.warn(m ?? "", o),
};

const SEVERITY_MAP: Record<ReliabilityAlarmSeverity, NotificationSeverity> = {
  critical: "critical",
  warning: "high",
  info: "info",
};

/** Owner/Admin/Manager recipients (id + email) for the company — mirrors listCompanyNotifyUserIds. */
async function loadRecipients(client: {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ id: string; email: string | null }> }>;
}, operatingCompanyId: string) {
  const res = await client.query(
    `SELECT DISTINCT u.id::text AS id, u.email AS email
       FROM identity.users u
       LEFT JOIN org.user_company_access uca ON uca.user_id = u.id
      WHERE u.deactivated_at IS NULL
        AND u.role = ANY($2::text[])
        AND (u.default_company_id = $1::uuid OR uca.company_id = $1::uuid)`,
    [operatingCompanyId, ["Owner", "Administrator", "Manager"]],
  );
  return res.rows;
}

/**
 * Raise a reliability alarm across the channels appropriate to its severity. Best-effort per channel,
 * fail-loud (logged + returned), never throws — a monitor must never crash because an alarm channel did.
 */
export async function dispatchReliabilityAlarm(
  input: ReliabilityAlarmInput,
  logger: Logger = consoleLogger,
): Promise<ReliabilityAlarmResult> {
  const { operatingCompanyId, severity, source, title, body } = input;
  const wantEmail = severity === "critical" || severity === "warning";
  const wantSms = severity === "critical";
  const result: ReliabilityAlarmResult = {
    onScreen: { ok: false, recipients: 0 },
    email: { ok: false, recipients: 0 },
    sms: { ok: false },
    audit: { ok: false },
  };

  await withLuciaBypass(async (client) => {
    let recipients: Array<{ id: string; email: string | null }> = [];
    try {
      recipients = await loadRecipients(client as never, operatingCompanyId);
    } catch (e) {
      logger.error({ err: e, source }, "[reliability-alarm] failed to load recipients");
    }

    // 1) ON-SCREEN — always, every recipient. createNotification(type='system').
    try {
      for (const r of recipients) {
        await createNotification(
          {
            operating_company_id: operatingCompanyId,
            user_id: r.id,
            type: "system",
            severity: SEVERITY_MAP[severity],
            title,
            body,
            source_block: `BLOCK-RELIABILITY-08:${source}`,
          },
          client as never,
        );
      }
      result.onScreen = { ok: true, recipients: recipients.length };
    } catch (e) {
      result.onScreen = { ok: false, recipients: 0, error: String((e as Error)?.message ?? e) };
      logger.error({ err: e, source }, "[reliability-alarm] on-screen channel failed");
    }

    // 4) DURABLE record (append-only), mirroring error-digest.cron.
    try {
      await client.query(
        `SELECT audit.append_event($1::text, $2::text, $3::jsonb, NULL::uuid, $4::text)`,
        ["admin.reliability_alarm", severity, JSON.stringify({ source, title, body }), "BLOCK-RELIABILITY-08"],
      );
      result.audit = { ok: true };
    } catch (e) {
      result.audit = { ok: false, error: String((e as Error)?.message ?? e) };
      logger.error({ err: e, source }, "[reliability-alarm] audit record failed (NOT swallowed)");
    }

    // 2) EMAIL — critical+warning. notification-dispatch template (vars: title, bodyText).
    if (wantEmail) {
      const to = recipients.map((r) => r.email).filter((e): e is string => Boolean(e && e.trim()));
      if (to.length === 0) {
        result.email = { ok: false, recipients: 0, skipped: true, error: "no recipient emails" };
        logger.warn({ source }, "[reliability-alarm] email skipped — no recipient emails");
      } else {
        try {
          await enqueueEmail({
            operatingCompanyId,
            toAddresses: to,
            subject: `[IH35 ${severity.toUpperCase()}] ${title}`,
            templateKey: "notification-dispatch",
            templateVars: { title, bodyText: body },
          });
          result.email = { ok: true, recipients: to.length };
        } catch (e) {
          result.email = { ok: false, recipients: 0, error: String((e as Error)?.message ?? e) };
          logger.error({ err: e, source }, "[reliability-alarm] email channel failed");
        }
      }
    } else {
      result.email = { ok: true, recipients: 0, skipped: true };
    }
  }).catch((e) => {
    logger.error({ err: e, source }, "[reliability-alarm] DB context failed");
  });

  // 3) SMS — CRITICAL only; bypasses quiet-hours + per-user prefs by design. Target from env
  //    (identity.users has no phone column — gated users.phone is the cleaner future source).
  if (wantSms) {
    const to = (process.env.RELIABILITY_ALARM_SMS_TO ?? "").trim();
    if (!to) {
      result.sms = { ok: false, skipped: true, error: "RELIABILITY_ALARM_SMS_TO not set" };
      logger.warn({ source }, "[reliability-alarm] SMS skipped — RELIABILITY_ALARM_SMS_TO unset");
    } else {
      try {
        const r = await sendSms({ to, body: (input.smsBody ?? title).slice(0, 320) });
        result.sms = r.success ? { ok: true } : { ok: false, error: r.error ?? "sms send failed" };
        if (!r.success) logger.error({ source, error: r.error }, "[reliability-alarm] SMS channel failed");
      } catch (e) {
        result.sms = { ok: false, error: String((e as Error)?.message ?? e) };
        logger.error({ err: e, source }, "[reliability-alarm] SMS channel threw");
      }
    }
  } else {
    result.sms = { ok: true, skipped: true };
  }

  return result;
}
