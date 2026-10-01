/**
 * ROUND 313 E-32 — driver documents from the Samsara app (Proof of Delivery photos) into docs.files, linked to
 * the load, its stop, the truck and the driver (docs.file_links, both ways through the existing document screens).
 *
 * Mapping, nothing guessed:
 *   - load + stop: the Samsara route stop the document was taken at -> its externalIds.ih35Stop (E-31 routes carry
 *     it) -> mdata.load_stops -> load. A document with no route stop links to driver/unit only.
 *   - driver: Samsara driver id -> canonical map; unit: Samsara vehicle id -> unit map.
 *   - category: Samsara "Proof of Delivery" -> catalogs.file_categories 'pod' (the BOL category 'bol' stays a
 *     human/driver-app upload: whether a POD may release the invoice is the money lane's call, so no POD is filed as
 *     a BOL here).
 *   - idempotent: r2_key 'samsara/documents/<document id>/<photo #>' (docs.files.r2_key is UNIQUE).
 * Bytes are fetched from Samsara's photo URL and stored in R2 through the injected store; authorship is the
 * System actor (identity.users row 00000000-0000-4000-8000-000000000001, present since 2026-09-22).
 */
import { createHash } from "node:crypto";
import { loadUnitIdBySamsaraVehicleId } from "../samsara-positions.service.js";
import { loadDriverIdBySamsaraId } from "../driver-samsara-map.js";

type Db = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };
export const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000001";
export type DocumentStore = { put(r2Key: string, bytes: Buffer, mime: string): Promise<void> };
export type PhotoFetcher = (url: string) => Promise<{ bytes: Buffer; mime: string }>;

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Every photo URL in a Samsara document's fields (photo fields carry value.photoValue[].url). */
export function documentPhotoUrls(doc: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (const f of Array.isArray(doc.fields) ? (doc.fields as unknown[]) : []) {
    const field = obj(f);
    const value = obj(field?.value);
    const photos = Array.isArray(value?.photoValue) ? (value!.photoValue as unknown[]) : [];
    for (const p of photos) { const u = obj(p)?.url; if (typeof u === "string" && u) urls.push(u); }
  }
  return urls;
}

export async function ingestSamsaraDocuments(
  client: Db,
  oc: string,
  docs: Record<string, unknown>[],
  store: DocumentStore,
  fetchPhoto: PhotoFetcher
) {
  const unitByVehicle = await loadUnitIdBySamsaraVehicleId(client as never, oc);
  const driverBySamsara = await loadDriverIdBySamsaraId(client as never, oc);
  const pod = await client.query<{ id: string }>(`SELECT id::text FROM catalogs.file_categories WHERE code = 'pod' LIMIT 1`);
  const out = { documents: docs.length, photos: 0, stored: 0, already_stored: 0, linked_load: 0, no_photos: 0 };
  for (const d of docs) {
    const docId = String(d.id ?? "");
    if (!docId) continue;
    const urls = documentPhotoUrls(d);
    if (urls.length === 0) { out.no_photos += 1; continue; }
    const stopExt = obj(obj(d.routeStop)?.externalIds)?.ih35Stop;
    const stop = typeof stopExt === "string"
      ? (await client.query<{ stop_id: string; load_id: string }>(
          `SELECT s.id::text AS stop_id, s.load_id::text AS load_id FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
            WHERE s.id::text = $1 AND l.operating_company_id = $2::uuid`, [stopExt, oc])).rows[0] ?? null
      : null;
    const driverId = obj(d.driver)?.id != null ? driverBySamsara.get(String(obj(d.driver)!.id)) ?? null : null;
    const unitId = obj(d.vehicle)?.id != null ? unitByVehicle.get(String(obj(d.vehicle)!.id)) ?? null : null;
    const when = typeof d.createdAtTime === "string" ? d.createdAtTime : typeof d.updatedAtTime === "string" ? d.updatedAtTime : null;
    const typeName = String(obj(d.documentType)?.name ?? d.name ?? "Samsara document");
    for (let i = 0; i < urls.length; i += 1) {
      out.photos += 1;
      const r2Key = `samsara/documents/${docId}/${i + 1}`;
      const exists = await client.query(`SELECT 1 FROM docs.files WHERE r2_key = $1`, [r2Key]);
      if (exists.rows.length) { out.already_stored += 1; continue; }
      const { bytes, mime } = await fetchPhoto(urls[i]!);
      if (!bytes.length) continue;
      await store.put(r2Key, bytes, mime);
      const file = await client.query<{ id: string }>(
        `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, sha256_hash, r2_key,
            upload_completed_at, category_id, document_date, description, uploader_user_id, dispatch_load_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, now(), $7::uuid, $8::date, $9, $10::uuid, $11::uuid)
         RETURNING id::text`,
        [oc, `${typeName} ${docId}-${i + 1}.${mime.includes("png") ? "png" : "jpg"}`, mime, bytes.length,
         createHash("sha256").update(bytes).digest("hex"), r2Key, pod.rows[0]?.id ?? null, when ? when.slice(0, 10) : null,
         `Samsara ${typeName} (document ${docId}, photo ${i + 1} of ${urls.length})`, SYSTEM_ACTOR_ID, stop?.load_id ?? null]
      );
      const fileId = file.rows[0]!.id;
      const links: Array<[string, string | null]> = [["load", stop?.load_id ?? null], ["load_stop", stop?.stop_id ?? null], ["unit", unitId], ["driver", driverId]];
      for (const [type, id] of links) {
        if (!id) continue;
        await client.query(
          `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id) VALUES ($1::uuid, $2, $3::uuid, $4::uuid)
           ON CONFLICT (file_id, entity_type, entity_id) WHERE deleted_at IS NULL DO NOTHING`,
          [fileId, type, id, SYSTEM_ACTOR_ID]
        );
      }
      out.stored += 1;
      if (stop) out.linked_load += 1;
    }
  }
  return out;
}
