/**
 * GAP-52 — CAP-15 Driver ↔ QBO vendor mapping integrity monitor.
 */
import type { PoolClient } from "pg";

export type DriftSeverity = "critical" | "warning" | "info";
export type DriftReason =
  | "qbo_vendor_name_drift"
  | "samsara_id_drift"
  | "manual_override_drift"
  | "qbo_vendor_missing";

export interface MappingFinding {
  driver_uuid: string;
  qbo_vendor_uuid: string | null;
  drift_reason: DriftReason;
  severity: DriftSeverity;
  details: Record<string, unknown>;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function normalizeName(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export async function checkAllMappings(
  client: PoolClient,
  operatingCompanyId: string
): Promise<MappingFinding[]> {
  const findings: MappingFinding[] = [];

  // USMCA cross-entity leak fix: mdata.drivers RLS is role/identity-scoped, not entity-scoped, and the
  // daily worker scans on a lucia-bypass connection (RLS off), so an unscoped read blends every operating
  // company's drivers into each company's findings. Bind the operating company explicitly so a scan for
  // one carrier (TRANSP/TRK/USMCA) only ever sees — and persists findings for — its own drivers.
  const drivers = await client.query<{
    id: string;
    display_name: string | null;
    qbo_vendor_id: string | null;
    samsara_driver_id: string | null;
  }>(
    `SELECT d.id::text, concat_ws(' ', d.first_name, d.last_name) AS display_name,
            d.qbo_vendor_id::text, sd.samsara_driver_id
     FROM mdata.drivers d
     LEFT JOIN integrations.samsara_drivers sd ON sd.local_driver_id = d.id
     WHERE d.qbo_vendor_id IS NOT NULL AND d.deactivated_at IS NULL
       AND d.operating_company_id = $1::uuid`,
    [operatingCompanyId]
  );

  for (const driver of drivers.rows) {
    const vendorId = driver.qbo_vendor_id;
    if (!vendorId) continue;

    const vendorRes = await client.query<{ id: string; display_name: string | null; company_name: string | null }>(
      `SELECT id::text, display_name, company_name FROM accounting.qbo_vendors WHERE id = $1::uuid LIMIT 1`,
      [vendorId]
    );
    const vendor = vendorRes.rows[0];
    if (!vendor) {
      findings.push({
        driver_uuid: driver.id,
        qbo_vendor_uuid: vendorId,
        drift_reason: "qbo_vendor_missing",
        severity: "critical",
        details: { driver_name: driver.display_name },
      });
      continue;
    }

    const driverName = normalizeName(driver.display_name ?? "");
    const vendorName = normalizeName(vendor.display_name ?? vendor.company_name ?? "");
    if (driverName && vendorName) {
      const dist = levenshtein(driverName, vendorName);
      if (dist > 3) {
        findings.push({
          driver_uuid: driver.id,
          qbo_vendor_uuid: vendorId,
          drift_reason: "qbo_vendor_name_drift",
          severity: dist > 8 ? "critical" : "warning",
          details: { driver_name: driverName, vendor_name: vendorName, levenshtein: dist },
        });
      }
    }

    if (driver.samsara_driver_id) {
      const samsaraRes = await client.query<{ samsara_driver_id: string; local_driver_id: string | null }>(
        `SELECT samsara_driver_id, local_driver_id::text
         FROM integrations.samsara_drivers WHERE samsara_driver_id = $1 LIMIT 1`,
        [driver.samsara_driver_id]
      );
      const sRow = samsaraRes.rows[0];
      if (sRow && sRow.local_driver_id && sRow.local_driver_id !== driver.id) {
        findings.push({
          driver_uuid: driver.id,
          qbo_vendor_uuid: vendorId,
          drift_reason: "samsara_id_drift",
          severity: "critical",
          details: { mapped_driver: sRow.local_driver_id, samsara_driver_id: driver.samsara_driver_id },
        });
      }
    }
  }

  return findings;
}

export async function persistFindings(
  client: PoolClient,
  operatingCompanyId: string,
  findings: MappingFinding[]
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  for (const f of findings) {
    await client.query(
      `INSERT INTO safety.integrity_findings
         (operating_company_id, report_date, anomaly_class, load_uuid, details, resolved)
       VALUES ($1, $2::date, $3, $4::uuid, $5::jsonb, false)`,
      [operatingCompanyId, today, f.drift_reason, f.driver_uuid, JSON.stringify({ ...f.details, severity: f.severity, qbo_vendor_uuid: f.qbo_vendor_uuid })]
    );
  }
}
