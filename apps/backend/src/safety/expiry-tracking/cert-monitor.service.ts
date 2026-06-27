const DAY_MS = 24 * 60 * 60 * 1000;

export type CertType =
  | "cdl"
  | "medical_card"
  | "hazmat_endorsement"
  | "twic"
  | "passport"
  | "drug_test";

export type CertExpirySeverity = "critical" | "warn" | "info";

export type CertExpiryAlert = {
  operating_company_id: string;
  driver_uuid: string;
  driver_name: string;
  cert_type: CertType;
  cert_label: string;
  expiry_date: string;
  days_until_expiry: number;
  severity: CertExpirySeverity;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type DriverCertRow = {
  driver_uuid: string;
  driver_name: string;
  cdl_expires_at: string | null;
  medical_card_expires_at: string | null;
  hazmat_endorsement_expires_at: string | null;
  twic_expires_at: string | null;
  passport_expires_at: string | null;
  drug_test_due_date: string | null;
};

const CERT_DEFINITIONS: Array<{ type: CertType; label: string; key: keyof DriverCertRow }> = [
  { type: "cdl", label: "CDL", key: "cdl_expires_at" },
  { type: "medical_card", label: "Medical Card", key: "medical_card_expires_at" },
  { type: "hazmat_endorsement", label: "Hazmat Endorsement", key: "hazmat_endorsement_expires_at" },
  { type: "twic", label: "TWIC", key: "twic_expires_at" },
  { type: "passport", label: "Passport", key: "passport_expires_at" },
  { type: "drug_test", label: "Drug Test Due", key: "drug_test_due_date" },
];

function severityRank(severity: CertExpirySeverity): number {
  if (severity === "critical") return 0;
  if (severity === "warn") return 1;
  return 2;
}

export function computeDaysUntilExpiry(expiryDate: string | null, referenceDate = new Date()): number | null {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const expiryUtc = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const refUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  );
  return Math.floor((expiryUtc - refUtc) / DAY_MS);
}

export function computeSeverity(daysUntilExpiry: number | null): CertExpirySeverity | null {
  if (daysUntilExpiry == null) return null;
  if (daysUntilExpiry < 14) return "critical";
  if (daysUntilExpiry <= 30) return "warn";
  if (daysUntilExpiry <= 60) return "info";
  return null;
}

export async function scanAllDrivers(client: Queryable, operatingCompanyId: string): Promise<CertExpiryAlert[]> {
  const rows = await client.query<DriverCertRow>(
    `
      SELECT
        d.id::text AS driver_uuid,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), ''),
          NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), ''),
          d.id::text
        ) AS driver_name,
        d.cdl_expires_at::text,
        COALESCE(mc.expiry_date, d.dot_medical_expires_at)::text AS medical_card_expires_at,
        d.hazmat_endorsement_expires_at::text,
        d.twic_expiration::text AS twic_expires_at,
        d.passport_expires_at::text,
        dt.next_due::text AS drug_test_due_date
      FROM mdata.drivers d
      LEFT JOIN LATERAL (
        SELECT m.expiry_date
        FROM safety.medical_cards m
        WHERE m.driver_id = d.id
          AND m.operating_company_id = $1::uuid
          AND m.voided_at IS NULL
        ORDER BY m.expiry_date DESC NULLS LAST
        LIMIT 1
      ) mc ON true
      LEFT JOIN LATERAL (
        SELECT (t.test_date + interval '365 day')::date AS next_due
        FROM safety.drug_test t
        WHERE t.driver_id = d.id
          AND t.operating_company_id = $1::uuid
          AND t.voided_at IS NULL
        ORDER BY t.test_date DESC NULLS LAST
        LIMIT 1
      ) dt ON true
      WHERE d.operating_company_id = $1::uuid
        AND d.deactivated_at IS NULL
    `,
    [operatingCompanyId]
  );

  const alerts: CertExpiryAlert[] = [];
  for (const row of rows.rows) {
    for (const cert of CERT_DEFINITIONS) {
      const rawDate = row[cert.key];
      if (!rawDate) continue;
      const days = computeDaysUntilExpiry(String(rawDate));
      const severity = computeSeverity(days);
      if (severity == null || days == null) continue;
      alerts.push({
        operating_company_id: operatingCompanyId,
        driver_uuid: row.driver_uuid,
        driver_name: row.driver_name,
        cert_type: cert.type,
        cert_label: cert.label,
        expiry_date: String(rawDate).slice(0, 10),
        days_until_expiry: days,
        severity,
      });
    }
  }

  alerts.sort((a, b) => {
    const severityDiff = severityRank(a.severity) - severityRank(b.severity);
    if (severityDiff !== 0) return severityDiff;
    const dayDiff = a.days_until_expiry - b.days_until_expiry;
    if (dayDiff !== 0) return dayDiff;
    const driverDiff = a.driver_name.localeCompare(b.driver_name);
    if (driverDiff !== 0) return driverDiff;
    return a.cert_label.localeCompare(b.cert_label);
  });

  return alerts;
}

export async function scanDriverCerts(
  client: Queryable,
  operatingCompanyId: string,
  driverUuid: string
): Promise<CertExpiryAlert[]> {
  const alerts = await scanAllDrivers(client, operatingCompanyId);
  return alerts.filter((alert) => alert.driver_uuid === driverUuid);
}
