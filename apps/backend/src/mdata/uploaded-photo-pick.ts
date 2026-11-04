/**
 * Register row 3 — "Driver photo from uploaded IDs; unit photos."
 * Measured on prod 2026-11-03 (USMCA): 30 drivers carry 381 linked files, 15 are CDL PDFs and 2 are JPEGs (an INE ID card and a
 * DOT medical card); 11 units carry 28 linked files, all insurance / permit PDFs. A header photo is therefore only ever a
 * linked IMAGE: a CDL / ID / driver photo for a driver, a truck photo for a unit. PDFs are never turned into a thumbnail, a
 * medical card is never a portrait, and the source file is never cropped, resized or rewritten (the header shows it whole).
 */
type Q = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type LinkedImageFile = {
  id: string;
  original_filename: string;
  mime_type: string;
  category_code: string | null;
  r2_key: string;
  created_at: string;
};

const NOT_A_PHOTO_NAME = /medical|exam|insurance|policy|permit|receipt|invoice|bol|pod|ratecon|statement|inspection/i;
const DRIVER_ID_NAME = /\b(ine|id|license|licence|licencia|cdl|dl|foto|photo|selfie|portrait)\b|identif/i;
const UNIT_PHOTO_NAME = /photo|foto|picture|truck|tractor|trailer|unit|exterior|interior|front|side|rear/i;
const DRIVER_ID_CATEGORIES = new Set(["cdl", "driver_license", "drivers_license", "government_id", "id_card", "driver_photo"]);
const UNIT_PHOTO_CATEGORIES = new Set(["unit_photo", "vehicle_photo", "photo", "equipment_photo"]);

const isImage = (f: LinkedImageFile) => /^image\/(jpe?g|png|webp|gif)$/i.test(f.mime_type);
const newest = (a: LinkedImageFile, b: LinkedImageFile) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

/** The linked image to show on a driver header: a CDL / ID / driver photo, newest first. */
export function pickDriverIdPhoto(files: LinkedImageFile[]): LinkedImageFile | null {
  const hits = files
    .filter(isImage)
    .filter((f) => f.category_code !== "medical_card" && !NOT_A_PHOTO_NAME.test(f.original_filename))
    .filter((f) => DRIVER_ID_CATEGORIES.has(f.category_code ?? "") || DRIVER_ID_NAME.test(f.original_filename))
    .sort(newest);
  return hits[0] ?? null;
}

/** The linked image to show on a unit header: a categorised unit photo, else a photo-named image, newest first. */
export function pickUnitPhoto(files: LinkedImageFile[]): LinkedImageFile | null {
  const hits = files
    .filter(isImage)
    .filter((f) => !NOT_A_PHOTO_NAME.test(f.original_filename))
    .filter((f) => UNIT_PHOTO_CATEGORIES.has(f.category_code ?? "") || UNIT_PHOTO_NAME.test(f.original_filename))
    .sort(newest);
  return hits[0] ?? null;
}

/** Live, completed, company-scoped image files linked to one driver / unit. */
export async function loadLinkedImageFiles(client: Q, entityType: "driver" | "unit", entityId: string, companyId: string): Promise<LinkedImageFile[]> {
  const res = await client.query(
    `SELECT f.id::text AS id, f.original_filename, f.mime_type, cat.code AS category_code, f.r2_key, f.created_at::text AS created_at
       FROM docs.file_links fl
       JOIN docs.files f ON f.id = fl.file_id
       LEFT JOIN catalogs.file_categories cat ON cat.id = f.category_id
      WHERE fl.entity_type = $1 AND fl.entity_id = $2::uuid AND fl.deleted_at IS NULL
        AND f.deleted_at IS NULL AND f.upload_completed_at IS NOT NULL AND f.r2_key IS NOT NULL
        AND f.operating_company_id = $3::uuid AND f.mime_type LIKE 'image/%'
      ORDER BY f.created_at DESC LIMIT 50`,
    [entityType, entityId, companyId]
  );
  return res.rows as unknown as LinkedImageFile[];
}
