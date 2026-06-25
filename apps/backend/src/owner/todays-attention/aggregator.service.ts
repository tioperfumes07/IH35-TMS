/**
 * GAP-65 — Owner Today's Attention Aggregator
 *
 * Computes a ranked list of the top N (default 5) highest-priority items
 * the Owner needs to address today. Sources are queried in parallel and each
 * contributes a scored AttentionItem. The final list is deduplicated and the
 * top N by score are returned.
 *
 * Sources and base scores (per spec):
 *   425C filing deadline within 7 days               100
 *   Open critical fuel fraud alerts (GAP-61)          95
 *   Bank account drift detection (GAP-53)             90
 *   Open severe engine fault WOs (GAP-58)             90
 *   Period-close pending entries with warnings        80
 *   Open driver damage liabilities                    80
 *   Out-of-range cargo sensor incidents (GAP-64)      85
 *   Pending Owner approval for detention (GAP-19)     75
 *   Cooling customers (GAP-36) top tier               70
 *   At-risk units brake/tire within 7 days            65
 *
 * Each source uses graceful degradation: if the underlying table/module
 * has not shipped, the source is skipped and a warning is logged.
 */

export type AttentionSeverity = "info" | "warning" | "error" | "critical";

export interface AttentionItem {
  item_id: string;
  source: string;
  score: number;
  title: string;
  body: string;
  action_url: string;
  action_label: string;
  severity: AttentionSeverity;
  extra: Record<string, unknown>;
}

type DbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

async function tableExists(client: DbClient, qualifiedName: string): Promise<boolean> {
  try {
    const r = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [qualifiedName]);
    return Boolean(r.rows[0]?.ok);
  } catch {
    return false;
  }
}

// ─── Source: 425C filing deadline ────────────────────────────────────────────

async function source425CDeadline(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "legal.form_425c_filings"))) return [];
    const res = await client.query(
      `
        SELECT id::text, deadline_date::text AS deadline
        FROM legal.form_425c_filings
        WHERE operating_company_id = $1::uuid
          AND status != 'filed'
          AND deadline_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + 7)
        LIMIT 5
      `,
      [ociId]
    );
    return res.rows.map((r) => ({
      item_id: `form_425c:${str(r.id)}`,
      source: "form_425c_deadline",
      score: 100,
      title: `425C filing due ${str(r.deadline)}`,
      body: "Transportation Ch.11 filing deadline within 7 days. File or request extension.",
      action_url: "/legal/form-425c",
      action_label: "Open filings",
      severity: "critical" as AttentionSeverity,
      extra: { deadline: r.deadline },
    }));
  } catch {
    return [];
  }
}

// ─── Source: Critical fuel fraud alerts ──────────────────────────────────────

async function sourceFuelFraudAlerts(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "fuel.fraud_alerts"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM fuel.fraud_alerts
        WHERE operating_company_id = $1::uuid
          AND severity = 'critical'
          AND resolved_at IS NULL
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `fuel_fraud_critical:${ociId}`,
        source: "fuel_fraud",
        score: 95,
        title: `${count} critical fuel fraud alert${count === 1 ? "" : "s"}`,
        body: "Unresolved critical fuel card fraud alerts require immediate review.",
        action_url: "/fuel/fraud-alerts",
        action_label: "Review alerts",
        severity: "critical",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: Bank account drift ───────────────────────────────────────────────

async function sourceBankDrift(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "banking.reconciliation_drift_alerts"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM banking.reconciliation_drift_alerts
        WHERE operating_company_id = $1::uuid
          AND resolved_at IS NULL
          AND detected_at >= (now() - interval '24 hours')
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `bank_drift:${ociId}`,
        source: "bank_drift",
        score: 90,
        title: `${count} bank reconciliation drift${count === 1 ? "" : "s"} detected`,
        body: "Bank balance does not match book balance within tolerance. Review and reconcile.",
        action_url: "/banking",
        action_label: "Open banking",
        severity: "error",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: Severe engine fault WOs ─────────────────────────────────────────

async function sourceEngFaultWOs(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "maintenance.work_orders"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM maintenance.work_orders
        WHERE operating_company_id = $1::uuid
          AND severity IN ('critical','severe')
          AND status NOT IN ('completed','cancelled')
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `engine_fault_wo:${ociId}`,
        source: "engine_fault_wo",
        score: 90,
        title: `${count} severe engine fault work order${count === 1 ? "" : "s"} open`,
        body: "Severe/critical engine faults require owner decision on repair authorization.",
        action_url: "/maintenance",
        action_label: "Open maintenance",
        severity: "critical",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: Cargo sensor out-of-range incidents ──────────────────────────────

async function sourceCargoSensorIncidents(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "telematics.cargo_sensor_incidents"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM telematics.cargo_sensor_incidents
        WHERE operating_company_id = $1::uuid
          AND resolved_at IS NULL
          AND severity = 'critical'
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `cargo_sensor:${ociId}`,
        source: "cargo_sensor",
        score: 85,
        title: `${count} cargo sensor out-of-range incident${count === 1 ? "" : "s"}`,
        body: "Temperature or humidity outside safe range. Customer claims risk.",
        action_url: "/dispatch",
        action_label: "View dispatch",
        severity: "critical",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: Period-close pending entries with warnings ───────────────────────

async function sourcePeriodCloseWarnings(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "accounting.period_close_warnings"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM accounting.period_close_warnings
        WHERE operating_company_id = $1::uuid
          AND resolved_at IS NULL
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `period_close_warnings:${ociId}`,
        source: "period_close",
        score: 80,
        title: `${count} period-close warning${count === 1 ? "" : "s"} pending`,
        body: "Journal entries or invoices have unresolved warnings preventing period close.",
        action_url: "/accounting/invoices",
        action_label: "Open accounting",
        severity: "warning",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: Driver damage liabilities awaiting Owner decision ────────────────

async function sourceDamageLiabilities(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "safety.accident_liabilities"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM safety.accident_liabilities
        WHERE operating_company_id = $1::uuid
          AND owner_decision IS NULL
          AND created_at >= (now() - interval '30 days')
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `damage_liabilities:${ociId}`,
        source: "damage_liability",
        score: 80,
        title: `${count} driver damage liabilit${count === 1 ? "y" : "ies"} awaiting decision`,
        body: "Accident liabilities require Owner decision on driver chargeback or company absorption.",
        action_url: "/safety",
        action_label: "Open safety",
        severity: "error",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: Pending Owner detention approvals ────────────────────────────────

async function sourceDetentionApprovals(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    // Canonical detention table is dispatch.detention_requests (mdata.detention_requests does not
    // exist). "Pending Owner approval" = status = 'pending_review' (per detention-approval.service.ts).
    if (!(await tableExists(client, "dispatch.detention_requests"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM dispatch.detention_requests
        WHERE operating_company_id = $1::uuid
          AND status = 'pending_review'
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `detention_approvals:${ociId}`,
        source: "detention_approval",
        score: 75,
        title: `${count} detention request${count === 1 ? "" : "s"} pending Owner approval`,
        body: "Drivers are waiting on Owner approval to charge detention fees to customers.",
        action_url: "/dispatch",
        action_label: "View dispatch",
        severity: "warning",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: Cooling customers (top-tier cold) ────────────────────────────────

async function sourceCoolingCustomers(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "mdata.customer_health_scores"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM mdata.customer_health_scores
        WHERE operating_company_id = $1::uuid
          AND tier = 'cold'
          AND updated_at >= (now() - interval '7 days')
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `cooling_customers:${ociId}`,
        source: "cooling_customers",
        score: 70,
        title: `${count} cooling customer${count === 1 ? "" : "s"} at risk`,
        body: "Top-tier customers flagged as cold. Proactive outreach recommended.",
        action_url: "/dispatch",
        action_label: "View customers",
        severity: "warning",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Source: At-risk units (brake/tire) within 7 days ────────────────────────

async function sourceAtRiskUnits(client: DbClient, ociId: string): Promise<AttentionItem[]> {
  try {
    if (!(await tableExists(client, "maintenance.predictive_alerts"))) return [];
    const res = await client.query(
      `
        SELECT COUNT(*)::text AS c
        FROM maintenance.predictive_alerts
        WHERE operating_company_id = $1::uuid
          AND alert_type IN ('brake_wear','tire_tread')
          AND predicted_failure_date <= (CURRENT_DATE + 7)
          AND resolved_at IS NULL
      `,
      [ociId]
    );
    const count = num(res.rows[0]?.c);
    if (count === 0) return [];
    return [
      {
        item_id: `at_risk_units:${ociId}`,
        source: "at_risk_units",
        score: 65,
        title: `${count} unit${count === 1 ? "" : "s"} at brake/tire risk within 7 days`,
        body: "Predictive alerts indicate brake or tire failure risk within the next 7 days.",
        action_url: "/maintenance",
        action_label: "Open maintenance",
        severity: "warning",
        extra: { count },
      },
    ];
  } catch {
    return [];
  }
}

// ─── Main aggregator ──────────────────────────────────────────────────────────

export async function computeTodaysAttention(
  client: DbClient,
  operatingCompanyId: string,
  topN = 5
): Promise<AttentionItem[]> {
  const sourceFns = [
    source425CDeadline,
    sourceFuelFraudAlerts,
    sourceBankDrift,
    sourceEngFaultWOs,
    sourceCargoSensorIncidents,
    sourcePeriodCloseWarnings,
    sourceDamageLiabilities,
    sourceDetentionApprovals,
    sourceCoolingCustomers,
    sourceAtRiskUnits,
  ];

  const results = await Promise.allSettled(sourceFns.map((fn) => fn(client, operatingCompanyId)));

  const all: AttentionItem[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const item of r.value) {
        if (!seen.has(item.item_id)) {
          seen.add(item.item_id);
          all.push(item);
        }
      }
    }
  }

  return all
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
