import { sendEmail } from "./email.service.js";
import { createNotification, listCompanyNotifyUserIds } from "./notification.service.js";
import { bridgeDriverSms } from "./sms-bridge.service.js";
import { notifyDriverWebPush } from "../services/push-notification.service.js";
import type { FaultSeverity } from "../integrations/samsara/engine-faults/severe-fault-catalog.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type EngineFaultNotificationInput = {
  operating_company_id: string;
  unit_label: string;
  fault_description: string;
  severity: FaultSeverity;
  work_order_id: string;
  driver_id?: string | null;
};

function notificationSeverity(severity: FaultSeverity): "critical" | "high" | "medium" | "low" | "info" {
  if (severity === "critical") return "critical";
  if (severity === "severe") return "high";
  if (severity === "warn") return "medium";
  return "info";
}

export async function notifyEngineFaultWorkOrder(
  client: DbClient,
  input: EngineFaultNotificationInput
): Promise<{ in_app: number; email: number; push: number; sms: number }> {
  const notifSeverity = notificationSeverity(input.severity);
  const title = `Engine fault — ${input.unit_label}`;
  const body = `${input.fault_description}. Auto work order created (${input.severity}).`;

  const maintenanceUserIds = await listCompanyNotifyUserIds(client, input.operating_company_id, [
    "Owner",
    "Administrator",
    "Manager",
    "Maintenance",
  ]);

  let inApp = 0;
  for (const userId of maintenanceUserIds) {
    await createNotification(
      {
        operating_company_id: input.operating_company_id,
        user_id: userId,
        type: "maintenance_alert",
        severity: notifSeverity,
        title,
        body,
        action_link: `/maintenance/work-orders/${input.work_order_id}`,
        entity_type: "work_order",
        entity_id: input.work_order_id,
        source_block: "gap-58-engine-fault-auto-wo",
      },
      client
    );
    inApp += 1;
  }

  let email = 0;
  try {
    await sendEmail({
      to: process.env.ENGINE_FAULT_ALERT_EMAIL ?? "maintenance@ih35dispatch.com",
      subject: `[${input.severity.toUpperCase()}] Engine fault — ${input.unit_label}`,
      html: `<p>${body}</p><p>Work order: ${input.work_order_id}</p>`,
      sender: "noreply",
      eventClass: "maintenance.engine_fault.auto_wo",
    });
    email = 1;
  } catch {
    // Non-blocking when Resend is not configured.
  }

  let push = 0;
  let sms = 0;
  if (input.driver_id) {
    const pushResult = await notifyDriverWebPush({
      operatingCompanyId: input.operating_company_id,
      driverId: input.driver_id,
      title: "Engine fault detected",
      body: `${input.fault_description}. Maintenance has been notified.`,
      tag: `engine-fault-${input.work_order_id}`,
      data: { work_order_id: input.work_order_id },
    });
    push = pushResult.sent;

    const phoneRes = await client.query<{ phone: string | null }>(
      `
        SELECT phone
        FROM mdata.drivers
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.driver_id, input.operating_company_id]
    );
    const phone = phoneRes.rows[0]?.phone?.trim();
    if (phone) {
      const smsResult = await bridgeDriverSms({
        to: phone,
        body: `IH35: Engine fault on ${input.unit_label}. ${input.fault_description}. WO ${input.work_order_id.slice(0, 8)}.`,
      });
      if (smsResult.success) sms = 1;
    }
  }

  return { in_app: inApp, email, push, sms };
}
