/**
 * ROUND 326 item 4 — LEGAL DEADLINE + EXPIRY ENGINE.
 *
 * Surfaces real dashboard alerts from:
 *   - legal.matter_deadlines (statute / hearing / filing / renewal — any open row)
 *   - legal.matters.statute_of_limitations_at (scalar SOL when no deadline row)
 *   - legal.contract_signing_tokens.expires_at (unsigned signature links about to die)
 *   - legal.contract_attorney_review_tokens.expires_at (attorney review links)
 *
 * Silent failure is a defect: every open alert is returned with severity + deep link.
 * No feed. No Chrome. Read-only engine.
 */
export type LegalDeadlineAlertSeverity = "critical" | "warning" | "info";

export type LegalDeadlineAlert = {
  alert_id: string;
  kind:
    | "matter_deadline"
    | "statute_of_limitations"
    | "signature_expiry"
    | "attorney_review_expiry";
  severity: LegalDeadlineAlertSeverity;
  title: string;
  subtitle: string;
  due_at: string;
  days_until: number;
  operating_company_id: string;
  matter_id: string | null;
  matter_number: string | null;
  contract_instance_id: string | null;
  href: string;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function daysUntil(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.floor((t - nowMs) / 86_400_000);
}

function severityForDays(days: number, overdueIsCritical: boolean): LegalDeadlineAlertSeverity {
  if (days < 0) return overdueIsCritical ? "critical" : "warning";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "info";
}

/**
 * List every open legal deadline / expiry alert for one operating company.
 * Window: overdue OR due within `horizonDays` (default 90).
 */
export async function listLegalDeadlineAlerts(
  client: DbClient,
  operatingCompanyId: string,
  opts?: { horizonDays?: number; now?: Date }
): Promise<LegalDeadlineAlert[]> {
  const horizonDays = opts?.horizonDays ?? 90;
  const now = opts?.now ?? new Date();
  const nowMs = now.getTime();
  const alerts: LegalDeadlineAlert[] = [];

  const deadlines = await client.query<{
    id: string;
    matter_id: string;
    matter_number: string;
    title: string;
    deadline_type: string;
    deadline_at: string;
    operating_company_id: string;
  }>(
    `SELECT d.id::text, d.matter_id::text, m.matter_number, d.title, d.deadline_type,
            d.deadline_at::text, d.operating_company_id::text
       FROM legal.matter_deadlines d
       JOIN legal.matters m ON m.id = d.matter_id
      WHERE d.operating_company_id = $1::uuid
        AND d.completed_at IS NULL
        AND m.status IS DISTINCT FROM 'closed'
        AND d.deadline_at <= (now() + ($2::text || ' days')::interval)
      ORDER BY d.deadline_at ASC
      LIMIT 500`,
    [operatingCompanyId, String(horizonDays)]
  );
  for (const row of deadlines.rows) {
    const days = daysUntil(row.deadline_at, nowMs);
    alerts.push({
      alert_id: `matter_deadline:${row.id}`,
      kind: "matter_deadline",
      severity: severityForDays(days, true),
      title: row.title || row.deadline_type || "Matter deadline",
      subtitle: `Matter ${row.matter_number} · ${row.deadline_type}`,
      due_at: row.deadline_at,
      days_until: days,
      operating_company_id: row.operating_company_id,
      matter_id: row.matter_id,
      matter_number: row.matter_number,
      contract_instance_id: null,
      href: `/legal/matters/${row.matter_id}?tab=deadlines`,
    });
  }

  // Scalar SOL on the matter when there is no open statute deadline row (avoid double-count).
  const sols = await client.query<{
    id: string;
    matter_number: string;
    statute_of_limitations_at: string;
    operating_company_id: string;
  }>(
    `SELECT m.id::text, m.matter_number, m.statute_of_limitations_at::text, m.operating_company_id::text
       FROM legal.matters m
      WHERE m.operating_company_id = $1::uuid
        AND m.status IN ('open','investigating','litigation')
        AND m.statute_of_limitations_at IS NOT NULL
        AND m.statute_of_limitations_at::timestamptz <= (now() + ($2::text || ' days')::interval)
        AND NOT EXISTS (
          SELECT 1 FROM legal.matter_deadlines d
           WHERE d.matter_id = m.id
             AND d.completed_at IS NULL
             AND d.deadline_type = 'statute_of_limitations'
        )
      ORDER BY m.statute_of_limitations_at ASC
      LIMIT 200`,
    [operatingCompanyId, String(horizonDays)]
  );
  for (const row of sols.rows) {
    const days = daysUntil(row.statute_of_limitations_at, nowMs);
    alerts.push({
      alert_id: `statute:${row.id}`,
      kind: "statute_of_limitations",
      severity: severityForDays(days, true),
      title: "Statute of limitations",
      subtitle: `Matter ${row.matter_number}`,
      due_at: row.statute_of_limitations_at,
      days_until: days,
      operating_company_id: row.operating_company_id,
      matter_id: row.id,
      matter_number: row.matter_number,
      contract_instance_id: null,
      href: `/legal/matters/${row.id}?tab=deadlines`,
    });
  }

  const signTokens = await client.query<{
    id: string;
    contract_instance_id: string;
    expires_at: string;
    operating_company_id: string;
    display_ref: string | null;
  }>(
    `SELECT t.id::text, t.contract_instance_id::text, t.expires_at::text, t.operating_company_id::text,
            coalesce(ci.template_code, left(ci.id::text, 8)) AS display_ref
       FROM legal.contract_signing_tokens t
       JOIN legal.contract_instances ci ON ci.id = t.contract_instance_id
      WHERE t.operating_company_id = $1::uuid
        AND t.consumed_at IS NULL
        AND t.expires_at IS NOT NULL
        AND t.expires_at <= (now() + ($2::text || ' days')::interval)
        AND ci.voided_at IS NULL
        AND ci.signed_at IS NULL
      ORDER BY t.expires_at ASC
      LIMIT 200`,
    [operatingCompanyId, String(Math.min(horizonDays, 30))]
  );
  for (const row of signTokens.rows) {
    const days = daysUntil(row.expires_at, nowMs);
    alerts.push({
      alert_id: `signature_expiry:${row.id}`,
      kind: "signature_expiry",
      severity: severityForDays(days, true),
      title: "Signature link expires",
      subtitle: `Contract ${row.display_ref ?? row.contract_instance_id.slice(0, 8)}`,
      due_at: row.expires_at,
      days_until: days,
      operating_company_id: row.operating_company_id,
      matter_id: null,
      matter_number: null,
      contract_instance_id: row.contract_instance_id,
      href: `/legal/contracts?highlight=${row.contract_instance_id}`,
    });
  }

  const reviewTokens = await client.query<{
    id: string;
    contract_template_id: string;
    expires_at: string;
    operating_company_id: string;
  }>(
    `SELECT t.id::text, t.contract_template_id::text, t.expires_at::text, t.operating_company_id::text
       FROM legal.contract_attorney_review_tokens t
      WHERE t.operating_company_id = $1::uuid
        AND t.consumed_at IS NULL
        AND t.expires_at IS NOT NULL
        AND t.expires_at <= (now() + ($2::text || ' days')::interval)
      ORDER BY t.expires_at ASC
      LIMIT 100`,
    [operatingCompanyId, String(Math.min(horizonDays, 30))]
  );
  for (const row of reviewTokens.rows) {
    const days = daysUntil(row.expires_at, nowMs);
    alerts.push({
      alert_id: `attorney_review_expiry:${row.id}`,
      kind: "attorney_review_expiry",
      severity: severityForDays(days, false),
      title: "Attorney review link expires",
      subtitle: `Template ${row.contract_template_id.slice(0, 8)}`,
      due_at: row.expires_at,
      days_until: days,
      operating_company_id: row.operating_company_id,
      matter_id: null,
      matter_number: null,
      contract_instance_id: null,
      href: `/legal/templates/${row.contract_template_id}`,
    });
  }

  alerts.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 } as const;
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
    return a.days_until - b.days_until;
  });
  return alerts;
}

export function summarizeLegalDeadlineAlerts(alerts: LegalDeadlineAlert[]) {
  return {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
    overdue: alerts.filter((a) => a.days_until < 0).length,
  };
}
