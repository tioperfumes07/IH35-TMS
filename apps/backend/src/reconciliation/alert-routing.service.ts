type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type AlertSeverity = "critical" | "important" | "cleanup";

export type ReconciliationAlertFinding = {
  id: string;
  operating_company_id: string;
  integration: "qbo" | "samsara" | "plaid" | "fmcsa";
  mirror_category: string;
  finding_type: string;
  severity: AlertSeverity;
  status: "open" | "acknowledged" | "resolved" | "suppressed";
  detected_at: string;
};

export async function routeFindingAlert(args: {
  client: DbClient;
  finding: ReconciliationAlertFinding;
  isNew: boolean;
  severityEscalated: boolean;
}) {
  const { client, finding, isNew, severityEscalated } = args;
  if (finding.severity !== "critical") return;
  if (finding.status === "resolved") return;
  if (!isNew && !severityEscalated) return;

  const recipient = await resolveRecipientPhone(client, finding.operating_company_id);
  if (!recipient) {
    await appendAudit(client, "alert_recipient_missing", "warning", {
      finding_id: finding.id,
      operating_company_id: finding.operating_company_id,
      integration: finding.integration,
      mirror_category: finding.mirror_category,
      finding_type: finding.finding_type,
    });
    return;
  }

  const phase = severityEscalated ? "escalation" : "initial";
  const dedupeKey = `recon_alert:${finding.id}:${phase}`;
  const payload = {
    to: recipient,
    body: buildSmsBody(finding, severityEscalated),
    source: "reconciliation.alert_router",
    finding_id: finding.id,
    operating_company_id: finding.operating_company_id,
    integration: finding.integration,
    mirror_category: finding.mirror_category,
    finding_type: finding.finding_type,
    severity: "critical",
    severity_escalated: severityEscalated,
    detected_at: finding.detected_at,
  };

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at, dedupe_key)
      VALUES ($1, $2::jsonb, now(), $3)
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id::text
    `,
    ["twilio.sms.send", JSON.stringify(payload), dedupeKey]
  );

  if (!inserted.rows[0]?.id) return;
  await appendAudit(client, "alert_enqueued", "info", {
    finding_id: finding.id,
    operating_company_id: finding.operating_company_id,
    severity: "critical",
    severity_escalated: severityEscalated,
    dedupe_key: dedupeKey,
  });
}

function buildSmsBody(finding: ReconciliationAlertFinding, severityEscalated: boolean) {
  const prefix = severityEscalated ? "IH35 ESCALATED->Critical" : "IH35 ALERT [critical]";
  const findingIdShort = finding.id.slice(0, 8);
  return `${prefix}: ${finding.integration}/${finding.mirror_category} ${finding.finding_type}. Finding ${findingIdShort}. Open: app.ih35dispatch.com/admin/reconciliation`;
}

async function resolveRecipientPhone(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  const row = await client.query<{ phone: string | null; code: string | null }>(
    `
      SELECT phone, code
      FROM org.companies
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const company = row.rows[0] ?? null;
  const phone = String(company?.phone ?? "").trim();
  if (phone.length > 0) return phone;

  const code = String(company?.code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  if (!code) return null;

  const fallback = process.env[`ALERT_PHONE_${code}`];
  const fallbackPhone = String(fallback ?? "").trim();
  return fallbackPhone.length > 0 ? fallbackPhone : null;
}

async function appendAudit(
  client: DbClient,
  eventClass: "alert_enqueued" | "alert_recipient_missing",
  severity: "info" | "warning",
  payload: Record<string, unknown>
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    "DS-REMEDIATE-5",
  ]);
}
