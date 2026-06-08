/**
 * CLOSURE-11 — Maintenance services catalog seed loader.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../data/seeds/maintenance-services");

type ServiceRow = {
  service_code: string; service_name: string; service_category: string;
  applies_to_type: string; interval_miles: number | null; interval_months: number | null;
  interval_hours: number | null; is_safety_critical: boolean;
  typical_duration_hours: number | null; typical_cost_cents: number; compliance_ref: string | null;
};

function parseCsv(filePath: string): ServiceRow[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const [header, ...rows] = lines;
  if (!header) return [];
  const keys = header.split(",").map((k) => k.trim());
  return rows.map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    keys.forEach((k, i) => { obj[k] = vals[i] ?? ""; });
    return {
      service_code: obj.service_code ?? "",
      service_name: obj.service_name ?? "",
      service_category: obj.service_category ?? "general",
      applies_to_type: obj.applies_to_type ?? "all",
      interval_miles: obj.interval_miles ? Number(obj.interval_miles) : null,
      interval_months: obj.interval_months ? Number(obj.interval_months) : null,
      interval_hours: obj.interval_hours ? Number(obj.interval_hours) : null,
      is_safety_critical: obj.is_safety_critical === "true",
      typical_duration_hours: obj.typical_duration_hours ? Number(obj.typical_duration_hours) : null,
      typical_cost_cents: obj.typical_cost_cents ? Math.round(Number(obj.typical_cost_cents)) : 0,
      compliance_ref: obj.compliance_ref || null,
    };
  }).filter((r) => r.service_code && r.service_name);
}

export async function seedMaintenanceServices(
  client: { query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string
): Promise<{ upserted: number; skipped: number }> {
  const csvFiles = ["pm-services.csv", "repair-services.csv", "reefer-services.csv"];
  const allServices: ServiceRow[] = csvFiles.flatMap((f) => parseCsv(path.join(SEED_DIR, f)));

  let upserted = 0;
  let skipped = 0;

  for (const svc of allServices) {
    if (!svc.service_code) { skipped++; continue; }
    await client.query(
      `INSERT INTO mdata.maintenance_services
         (operating_company_id, service_code, service_name, service_category, applies_to_type, interval_miles, interval_months, interval_hours, is_safety_critical, typical_duration_hours, typical_cost_cents, compliance_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (operating_company_id, service_code) DO UPDATE
         SET service_name = EXCLUDED.service_name,
             service_category = EXCLUDED.service_category,
             interval_miles = EXCLUDED.interval_miles,
             interval_months = EXCLUDED.interval_months,
             interval_hours = EXCLUDED.interval_hours,
             is_safety_critical = EXCLUDED.is_safety_critical,
             typical_cost_cents = EXCLUDED.typical_cost_cents,
             compliance_ref = EXCLUDED.compliance_ref,
             updated_at = now()`,
      [operatingCompanyId, svc.service_code, svc.service_name, svc.service_category, svc.applies_to_type, svc.interval_miles, svc.interval_months, svc.interval_hours, svc.is_safety_critical, svc.typical_duration_hours, svc.typical_cost_cents, svc.compliance_ref]
    );
    upserted++;
  }

  return { upserted, skipped };
}
