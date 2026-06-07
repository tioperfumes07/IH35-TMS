import { buildResult, resolvePaging, type OperationsPagingOpts, type OperationsResult, type Queryable } from "./shared.js";

export type DocumentsVaultRow = {
  uuid: string;
  driver_id: string;
  operating_company_id: string;
  document_id: string | null;
  file_name: string | null;
  doc_type: string | null;
  created_at: string;
};

/**
 * Driver documents vault — all documents linked to this driver entity.
 * Scoped to one driver inside one operating company; paged for large drivers.
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
      FROM docs.file_links
      WHERE entity_type = 'driver'
        AND entity_id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [driverUuid, operatingCompanyId]
  );
  const total = Number(totalRes.rows[0]?.total ?? 0);
  const res = await client.query<DocumentsVaultRow>(
    `
      SELECT
        id::text AS uuid,
        entity_id::text AS driver_id,
        operating_company_id::text,
        document_id::text,
        file_name,
        doc_type,
        created_at::text
      FROM docs.file_links
      WHERE entity_type = 'driver'
        AND entity_id = $1::uuid
        AND operating_company_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `,
    [driverUuid, operatingCompanyId, limit, offset]
  );
  return buildResult(res.rows, total, page, page_size);
}
