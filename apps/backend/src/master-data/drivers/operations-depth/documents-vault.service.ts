import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type DocumentsVaultRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  file_id: string;
  file_name: string | null;
  doc_type: string | null;
  created_at: string;
};

/**
 * Driver documents vault — all documents linked to this driver entity.
 * Scoped to one driver inside one operating company; paged for large drivers.
 *
 * §4 landmine (fixed 2026-07-06): `docs.file_links` (migration 0028) has NO `operating_company_id`
 * column — company scope lives on the linked `docs.files` row, not the link row. The prior SELECT/
 * WHERE of `file_links.operating_company_id` 42703'd → this sub-view 500'd on every request. Fixed
 * to join `docs.files` for the real operating-company scope + `original_filename` (the frontend key
 * "file_name" was previously unpopulated — file_links carries only a bare file_id) + the document
 * category as `doc_type`. Both the link and the file must be live (not soft-deleted / void-not-delete).
 */
export async function getDriverDocumentsVault(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string,
  opts: OperationsPagingOpts = {}
): Promise<OperationsResult<DocumentsVaultRow>> {
  const { page, page_size, limit, offset } = resolvePaging(opts);
  const totalRes = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM docs.file_links fl
      JOIN docs.files f ON f.id = fl.file_id
      WHERE fl.entity_type = 'driver'
        AND fl.entity_id = $1::uuid
        AND f.operating_company_id = $2::uuid
        AND fl.deleted_at IS NULL
        AND f.deleted_at IS NULL
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<DocumentsVaultRow>(
    `
      SELECT
        fl.id::text AS uuid,
        fl.entity_id::text AS driver_id,
        f.operating_company_id::text,
        fl.file_id::text,
        f.original_filename AS file_name,
        cat.label AS doc_type,
        fl.created_at::text
      FROM docs.file_links fl
      JOIN docs.files f ON f.id = fl.file_id
      LEFT JOIN catalogs.file_categories cat ON cat.id = f.category_id
      WHERE fl.entity_type = 'driver'
        AND fl.entity_id = $1::uuid
        AND f.operating_company_id = $2::uuid
        AND fl.deleted_at IS NULL
        AND f.deleted_at IS NULL
      ORDER BY fl.created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
