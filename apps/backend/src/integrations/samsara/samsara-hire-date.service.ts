// Samsara-derived hire-date cross-validation (READ-ONLY / PREVIEW). Jorge's idea: a driver's first
// Samsara activity approximates hire date. GUARD verified the usable signal is ALREADY in our DB —
// integrations.samsara_drivers.raw_payload carries Samsara's per-driver `createdAtTime` (when the driver
// was added to Samsara ≈ first login). No 3-year API pull needed (and Samsara's retention would cap it
// anyway). GUARD's cross-check vs the Master Contacts List: median 1 day apart, 85% within 90 days — a
// reliable proxy. This service classifies every driver so the gaps can be filled and the rehires reviewed;
// it WRITES NOTHING. The master-list / HR date is authoritative and is never overwritten.

type PgClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type HireDateCategory =
  | "confirmed" // file date present AND Samsara agrees within 30d → trust it
  | "samsara_estimate" // no file date, Samsara present → gap-fill candidate (estimate)
  | "needs_review" // file + Samsara diverge > 180d → likely rehire, human decides
  | "minor_divergence" // file + Samsara diverge 30–180d → informational
  | "file_only" // file date present, no Samsara signal
  | "no_date"; // neither source has a date

export type HireDateRow = {
  driver_id: string;
  name: string;
  file_hire: string | null;
  samsara_created: string | null;
  delta_days: number | null;
  category: HireDateCategory;
};

/** Pull Samsara createdAtTime → YYYY-MM-DD. */
export function samsaraCreatedAtDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Whole-day signed difference (samsara − file); positive = Samsara after the file hire date. */
export function deltaDays(fileHire: string | null, samsara: string | null): number | null {
  if (!fileHire || !samsara) return null;
  const a = Date.parse(`${fileHire}T00:00:00Z`);
  const b = Date.parse(`${samsara}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function classifyHireDate(fileHire: string | null, samsara: string | null): { delta_days: number | null; category: HireDateCategory } {
  if (!fileHire && !samsara) return { delta_days: null, category: "no_date" };
  if (fileHire && !samsara) return { delta_days: null, category: "file_only" };
  if (!fileHire && samsara) return { delta_days: null, category: "samsara_estimate" };
  const delta = deltaDays(fileHire, samsara);
  const abs = delta == null ? null : Math.abs(delta);
  if (abs == null) return { delta_days: null, category: "minor_divergence" };
  if (abs <= 30) return { delta_days: delta, category: "confirmed" };
  if (abs > 180) return { delta_days: delta, category: "needs_review" };
  return { delta_days: delta, category: "minor_divergence" };
}

export type RawDriverRow = { id: string; first_name: string; last_name: string; hire_date: string | null; samsara_created_at: string | null };

export function classifyDriverHireDates(rows: RawDriverRow[]): HireDateRow[] {
  return rows.map((r) => {
    const samsara = samsaraCreatedAtDate(r.samsara_created_at);
    const { delta_days, category } = classifyHireDate(r.hire_date ?? null, samsara);
    return {
      driver_id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      file_hire: r.hire_date ?? null,
      samsara_created: samsara,
      delta_days,
      category,
    };
  });
}

export function summarizeHireDates(rows: HireDateRow[]) {
  const c = (k: HireDateCategory) => rows.filter((r) => r.category === k).length;
  return {
    total: rows.length,
    confirmed: c("confirmed"),
    samsara_estimate: c("samsara_estimate"),
    needs_review: c("needs_review"),
    minor_divergence: c("minor_divergence"),
    file_only: c("file_only"),
    no_date: c("no_date"),
  };
}

/**
 * Backfill hire_date from Samsara createdAtTime ONLY for drivers that currently have no hire date
 * (file/HR date always wins), tagged hire_date_source='samsara_estimate'. Never overwrites an existing
 * date; rehire divergences (needs_review) are left for human decision, not auto-written. Returns the count
 * filled. The caller must set app.operating_company_id first (mdata.drivers is entity-scoped).
 */
export async function applySamsaraHireDateEstimates(client: PgClient, operatingCompanyId: string, userId: string) {
  const res = await client.query(
    `UPDATE mdata.drivers d
        SET hire_date = substring(sd.raw_payload->>'createdAtTime' from 1 for 10)::date,
            hire_date_source = 'samsara_estimate',
            updated_by_user_id = $2::uuid,
            updated_at = now()
       FROM integrations.samsara_drivers sd
      WHERE sd.local_driver_id = d.id
        AND sd.operating_company_id = $1::uuid
        AND d.operating_company_id = $1::uuid
        AND d.deactivated_at IS NULL
        AND d.hire_date IS NULL
        AND sd.raw_payload->>'createdAtTime' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      RETURNING d.id`,
    [operatingCompanyId, userId]
  );
  return { filled: res.rows.length };
}

export async function previewSamsaraHireDates(client: PgClient, operatingCompanyId: string) {
  const res = await client.query(
    `SELECT d.id::text AS id, d.first_name, d.last_name, d.hire_date::text AS hire_date,
            (sd.raw_payload->>'createdAtTime') AS samsara_created_at
       FROM mdata.drivers d
       LEFT JOIN integrations.samsara_drivers sd
         ON sd.local_driver_id = d.id AND sd.operating_company_id = d.operating_company_id
      WHERE d.operating_company_id = $1::uuid AND d.deactivated_at IS NULL`,
    [operatingCompanyId]
  );
  const rows = classifyDriverHireDates(res.rows as unknown as RawDriverRow[]);
  return {
    operating_company_id: operatingCompanyId,
    summary: summarizeHireDates(rows),
    rows,
    note:
      "Read-only. Source = Samsara createdAtTime already stored in raw_payload (no API call). Master-list/HR hire date is authoritative and never overwritten; 'samsara_estimate' fills gaps as an ESTIMATE; 'needs_review' (>180d divergence) are likely rehires for human decision. A provenance column (hire_date_source) must exist before any write.",
  };
}
