/**
 * CLOSURE-10 — Idempotent parts seed loader.
 * Reads CSVs from data/seeds/maintenance-parts/ and UPSERTs into mdata.maintenance_parts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PartRow = {
  sku: string;
  part_name: string;
  manufacturer: string;
  model_compatibility: string;
  category: string;
  sub_category: string;
  typical_unit_cost_cents: number;
  barcode_upc: string;
};

const SEED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../data/seeds/maintenance-parts");

function parseCsv(filePath: string): PartRow[] {
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
      sku: obj.sku ?? "",
      part_name: obj.part_name ?? "",
      manufacturer: obj.manufacturer ?? "",
      model_compatibility: obj.model_compatibility ?? "",
      category: obj.category ?? "other",
      sub_category: obj.sub_category ?? "",
      typical_unit_cost_cents: Math.round(Number(obj.typical_unit_cost_cents ?? "0")),
      barcode_upc: obj.barcode_upc ?? "",
    };
  }).filter((r) => r.sku && r.part_name);
}

export async function seedMaintenanceParts(
  client: { query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string
): Promise<{ upserted: number; skipped: number }> {
  const csvFiles = ["detroit-diesel.csv", "cummins.csv", "freightliner.csv", "peterbilt.csv", "kenworth.csv"];
  const allParts: PartRow[] = csvFiles.flatMap((f) => parseCsv(path.join(SEED_DIR, f)));

  // mdata.maintenance_parts does not exist yet (the parts-master feature's table was never created;
  // see memory bucket3-phantom-schema-disposition — pending a Jorge data-model decision). No-op rather
  // than 42P01 so this manual seed is safe to invoke before the table is provisioned.
  const tableOk = await client.query<{ ok: boolean }>(`SELECT to_regclass('mdata.maintenance_parts') IS NOT NULL AS ok`);
  if (!tableOk.rows[0]?.ok) return { upserted: 0, skipped: allParts.length };

  let upserted = 0;
  let skipped = 0;

  for (const part of allParts) {
    if (!part.sku || !part.manufacturer) { skipped++; continue; }
    const models = part.model_compatibility ? `{${part.model_compatibility}}` : "{}";
    await client.query(
      `INSERT INTO mdata.maintenance_parts
         (operating_company_id, sku, part_name, manufacturer, model_compatibility, category, sub_category, typical_unit_cost_cents, barcode_upc)
       VALUES ($1, $2, $3, $4, $5::text[], $6, NULLIF($7, ''), $8, NULLIF($9, ''))
       ON CONFLICT (operating_company_id, sku) DO UPDATE
         SET part_name = EXCLUDED.part_name,
             manufacturer = EXCLUDED.manufacturer,
             model_compatibility = EXCLUDED.model_compatibility,
             category = EXCLUDED.category,
             sub_category = EXCLUDED.sub_category,
             typical_unit_cost_cents = EXCLUDED.typical_unit_cost_cents,
             barcode_upc = EXCLUDED.barcode_upc,
             updated_at = now()`,
      [operatingCompanyId, part.sku, part.part_name, part.manufacturer, models, part.category, part.sub_category, part.typical_unit_cost_cents, part.barcode_upc]
    );
    upserted++;
  }

  return { upserted, skipped };
}
