import { randomUUID } from "node:crypto";
import type { AnomalyType, Severity, SubjectType } from "./anomaly.shared.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export const ANOMALY_DETECTOR_VERSION = "int-3-v1";

type DetectedAnomaly = {
  anomaly_type: AnomalyType;
  severity: Severity;
  subject_type: SubjectType;
  subject_id: string;
  evidence: Record<string, unknown>;
};

export class AnomalyDetectorService {
  constructor(private readonly client: Queryable, private readonly detectorVersion = ANOMALY_DETECTOR_VERSION) {}

  async detectAll(tenantId: string): Promise<{ scanned: number; inserted: number }> {
    const detected = [
      ...(await this.detectOrphanedBills(tenantId)),
      ...(await this.detectDriversWithoutMedCard(tenantId)),
      ...(await this.detectUnitsOverduePm(tenantId)),
    ];

    let inserted = 0;
    for (const anomaly of detected) {
      inserted += await this.insertIfNew(tenantId, anomaly);
    }

    return { scanned: detected.length, inserted };
  }

  private async detectOrphanedBills(tenantId: string): Promise<DetectedAnomaly[]> {
    const result = await this.client.query<{
      bill_id: string;
      bill_number: string | null;
      amount_cents: number | null;
    }>(
      `
        SELECT
          b.id::text AS bill_id,
          b.bill_number::text AS bill_number,
          b.amount_cents
        FROM accounting.bills b
        LEFT JOIN accounting.bill_lines bl ON bl.bill_id = b.id
        WHERE b.operating_company_id = $1::uuid
          AND b.voided_at IS NULL
        GROUP BY b.id, b.bill_number, b.amount_cents
        HAVING COUNT(bl.id) = 0
        ORDER BY b.id
      `,
      [tenantId]
    );

    return result.rows.map((row) => ({
      anomaly_type: "orphaned-bill",
      severity: "medium",
      subject_type: "invoice",
      subject_id: String(row.bill_id),
      evidence: {
        bill_number: row.bill_number,
        amount_cents: Number(row.amount_cents ?? 0),
        reason: "bill has no lines",
      },
    }));
  }

  private async detectDriversWithoutMedCard(tenantId: string): Promise<DetectedAnomaly[]> {
    const result = await this.client.query<{
      driver_id: string;
      first_name: string | null;
      last_name: string | null;
    }>(
      `
        SELECT
          d.id::text AS driver_id,
          d.first_name::text,
          d.last_name::text
        FROM mdata.drivers d
        LEFT JOIN safety.medical_cards mc
          ON mc.driver_id = d.id
         AND mc.operating_company_id = d.operating_company_id
         AND mc.voided_at IS NULL
         AND (mc.expiry_date IS NULL OR mc.expiry_date >= current_date)
        WHERE d.operating_company_id = $1::uuid
          AND COALESCE(d.active, true) = true
          AND d.deactivated_at IS NULL
          AND mc.id IS NULL
        ORDER BY d.id
      `,
      [tenantId]
    );

    return result.rows.map((row) => ({
      anomaly_type: "driver-without-medcard",
      severity: "high",
      subject_type: "driver",
      subject_id: String(row.driver_id),
      evidence: {
        driver_name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null,
        reason: "active driver missing valid medical card",
      },
    }));
  }

  private async detectUnitsOverduePm(tenantId: string): Promise<DetectedAnomaly[]> {
    const result = await this.client.query<{
      unit_id: string;
      unit_number: string | null;
      triggered_at: string;
      pm_schedule_id: string;
    }>(
      `
        SELECT
          a.unit_id::text AS unit_id,
          u.unit_number::text AS unit_number,
          a.triggered_at::text AS triggered_at,
          a.pm_schedule_id::text AS pm_schedule_id
        FROM maintenance.pm_alerts a
        LEFT JOIN mdata.units u ON u.id = a.unit_id
        WHERE a.operating_company_id = $1::uuid
          AND a.state = 'open'
        ORDER BY a.triggered_at DESC
      `,
      [tenantId]
    );

    return result.rows.map((row) => ({
      anomaly_type: "unit-overdue-pm",
      severity: "medium",
      subject_type: "unit",
      subject_id: String(row.unit_id),
      evidence: {
        unit_number: row.unit_number,
        triggered_at: row.triggered_at,
        pm_schedule_id: row.pm_schedule_id,
        reason: "unit has open PM alert",
      },
    }));
  }

  private async insertIfNew(tenantId: string, anomaly: DetectedAnomaly): Promise<number> {
    const insertResult = await this.client.query(
      `
        INSERT INTO integrity.anomalies (
          id,
          tenant_id,
          anomaly_type,
          severity,
          subject_type,
          subject_id,
          detector_version,
          evidence,
          status
        )
        SELECT
          $1::uuid,
          $2::uuid,
          $3::text,
          $4::text,
          $5::text,
          $6::uuid,
          $7::text,
          $8::jsonb,
          'new'
        WHERE NOT EXISTS (
          SELECT 1
          FROM integrity.anomalies existing
          WHERE existing.tenant_id = $2::uuid
            AND existing.subject_id = $6::uuid
            AND existing.anomaly_type = $3::text
            AND existing.status = 'new'
        )
      `,
      [
        randomUUID(),
        tenantId,
        anomaly.anomaly_type,
        anomaly.severity,
        anomaly.subject_type,
        anomaly.subject_id,
        this.detectorVersion,
        JSON.stringify(anomaly.evidence),
      ]
    );

    return Number(insertResult.rowCount ?? 0);
  }
}

export async function runAnomalyDetectionForTenant(client: Queryable, tenantId: string) {
  const service = new AnomalyDetectorService(client);
  return service.detectAll(tenantId);
}
