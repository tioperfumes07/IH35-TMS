import { withCurrentUser } from "../auth/db.js";
import { resolveVendorDisplayMap } from "./bills.service.js";

/**
 * Allocations list — FH-7 unit cost allocation (docs/specs/FH-7-UNIT-ALLOCATION-DESIGN.md,
 * IH35_MASTER_BLUEPRINT_v3_FULL.md §3.14). Reads the SAME `accounting.bill_unit_allocation`
 * table `resolveAllocation` (allocation.ts) + `POST /bills/:id/allocate` (bills.routes.ts)
 * already write — this file adds NO new allocation math, NO new GL posting. It is a
 * read-only rollup joined to the bill, its GL account, and the unit (mdata.assets → mdata.units
 * via unit_code = unit_number, the canonical join used by wo-ap-posting.service.ts /
 * coverage-gap-units.shared.ts) so the Allocations tab can show "which bill, which vendor,
 * which unit, which GL account, how much" per row.
 */

export type AllocationListItem = {
  id: string;
  bill_id: string;
  bill_number: string | null;
  bill_date: string;
  bill_amount_cents: number;
  vendor_id: string | null;
  vendor_name: string | null;
  asset_id: string;
  unit_code: string;
  unit_id: string | null;
  coa_account_id: string | null;
  gl_account_number: string | null;
  gl_account_name: string | null;
  allocation_method: string;
  allocation_pct: number;
  allocated_amount_cents: number;
  created_at: string;
};

type AllocationRow = {
  id: string;
  bill_id: string;
  bill_number: string | null;
  bill_date: string;
  bill_amount_cents: string | number | null;
  bill_vendor_id: string | null;
  bill_vendor_uuid: string | null;
  asset_id: string;
  unit_code: string;
  unit_id: string | null;
  coa_account_id: string | null;
  gl_account_number: string | null;
  gl_account_name: string | null;
  allocation_method: string;
  allocation_pct: string | number;
  allocated_amount_cents: string | number;
  created_at: string;
};

export type ListAllocationsOptions = {
  billId?: string;
  assetId?: string;
  limit: number;
  offset: number;
};

export async function listBillUnitAllocations(
  userId: string,
  operatingCompanyId: string,
  options: ListAllocationsOptions
): Promise<{ total: number; items: AllocationListItem[] }> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const where: string[] = ["a.tenant_id = $1", "b.operating_company_id = $1", "a.superseded_at IS NULL"];
    const values: unknown[] = [operatingCompanyId];
    if (options.billId) {
      values.push(options.billId);
      where.push(`a.bill_id = $${values.length}`);
    }
    if (options.assetId) {
      values.push(options.assetId);
      where.push(`a.asset_id = $${values.length}`);
    }

    const countRes = await client.query<{ total: string }>(
      `
        SELECT COUNT(*)::bigint AS total
        FROM accounting.bill_unit_allocation a
        JOIN accounting.bills b ON b.id = a.bill_id
        WHERE ${where.join(" AND ")}
      `,
      values
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    values.push(options.limit, options.offset);
    const res = await client.query<AllocationRow>(
      `
        SELECT
          a.id::text AS id,
          a.bill_id::text AS bill_id,
          b.bill_number,
          b.bill_date::text AS bill_date,
          b.amount_cents AS bill_amount_cents,
          b.vendor_id AS bill_vendor_id,
          b.vendor_uuid AS bill_vendor_uuid,
          a.asset_id::text AS asset_id,
          ast.unit_code,
          u.id::text AS unit_id,
          b.coa_account_id::text AS coa_account_id,
          coa.account_number AS gl_account_number,
          coa.account_name AS gl_account_name,
          a.allocation_method,
          a.allocation_pct,
          a.allocated_amount_cents,
          a.created_at::text AS created_at
        FROM accounting.bill_unit_allocation a
        JOIN accounting.bills b ON b.id = a.bill_id
        JOIN mdata.assets ast ON ast.id = a.asset_id AND ast.tenant_id = a.tenant_id
        LEFT JOIN mdata.units u
          ON u.unit_number = ast.unit_code
         AND (u.owner_company_id = a.tenant_id OR u.currently_leased_to_company_id = a.tenant_id)
        LEFT JOIN catalogs.accounts coa ON coa.id = b.coa_account_id
        WHERE ${where.join(" AND ")}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );

    const vendorIds = [
      ...new Set(
        res.rows
          .map((row) => row.bill_vendor_id ?? row.bill_vendor_uuid)
          .filter((v): v is string => Boolean(v))
      ),
    ];
    const vendorNames = await resolveVendorDisplayMap(operatingCompanyId, vendorIds);

    const items: AllocationListItem[] = res.rows.map((row) => {
      const vendorId = row.bill_vendor_id ?? row.bill_vendor_uuid ?? null;
      return {
        id: row.id,
        bill_id: row.bill_id,
        bill_number: row.bill_number,
        bill_date: row.bill_date,
        bill_amount_cents: Number(row.bill_amount_cents ?? 0),
        vendor_id: vendorId,
        vendor_name: vendorId ? vendorNames[vendorId] ?? vendorId : null,
        asset_id: row.asset_id,
        unit_code: row.unit_code,
        unit_id: row.unit_id,
        coa_account_id: row.coa_account_id,
        gl_account_number: row.gl_account_number,
        gl_account_name: row.gl_account_name,
        allocation_method: row.allocation_method,
        allocation_pct: Number(row.allocation_pct),
        allocated_amount_cents: Number(row.allocated_amount_cents),
        created_at: row.created_at,
      };
    });

    return { total, items };
  });
}
