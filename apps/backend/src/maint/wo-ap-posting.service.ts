import { withLuciaBypass } from "../auth/db.js";
import { withCurrentUser } from "../auth/db.js";
import { assertBillPsePostingEnforced, PseEnforcementError } from "../accounting/pse-enforce.middleware.js";
import { enforcePsePostingSelection } from "../accounting/pse-enforce.middleware.js";
import { processMaintenanceWorkOrderClose } from "../accounting/maintenance-posting/poster.service.js";
import {
  amountToCents,
  resolveRmPseLane,
  type MaintWoApPostingPreview,
  type RmPseLane,
} from "./wo-ap.shared.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export class MaintWoApPostingError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "MaintWoApPostingError";
  }
}

type WoApContextInput = {
  operating_company_id: string;
  work_order_id: string;
};

type WorkOrderRow = {
  id: string;
  status: string | null;
  unit_id: string | null;
  bucket: string | null;
  repair_location: string | null;
  vendor_id: string | null;
  external_vendor_id: string | null;
  ap_ps_category_qbo_id: string | null;
  ap_ps_item_qbo_id: string | null;
  ap_posting_asset_id: string | null;
};

async function loadWorkOrder(client: DbClient, input: WoApContextInput): Promise<WorkOrderRow | null> {
  const res = await client.query<WorkOrderRow>(
    `
      SELECT
        id::text AS id,
        status::text AS status,
        unit_id::text AS unit_id,
        bucket::text AS bucket,
        repair_location::text AS repair_location,
        vendor_id::text AS vendor_id,
        external_vendor_id::text AS external_vendor_id,
        ap_ps_category_qbo_id,
        ap_ps_item_qbo_id,
        ap_posting_asset_id::text AS ap_posting_asset_id
      FROM maintenance.work_orders
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.work_order_id, input.operating_company_id]
  );
  return res.rows[0] ?? null;
}

async function resolveAssetForWorkOrder(
  client: DbClient,
  operatingCompanyId: string,
  wo: WorkOrderRow
): Promise<{ asset_id: string | null; unit_code: string | null }> {
  if (wo.ap_posting_asset_id) {
    const assetRes = await client.query<{ id: string; unit_code: string }>(
      `
        SELECT id::text AS id, unit_code
        FROM mdata.assets
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [operatingCompanyId, wo.ap_posting_asset_id]
    );
    const row = assetRes.rows[0];
    return row ? { asset_id: row.id, unit_code: row.unit_code } : { asset_id: null, unit_code: null };
  }

  if (!wo.unit_id) return { asset_id: null, unit_code: null };

  const res = await client.query<{ asset_id: string; unit_code: string }>(
    `
      SELECT
        a.id::text AS asset_id,
        a.unit_code
      FROM maintenance.work_orders w
      JOIN mdata.units u ON u.id = w.unit_id
      JOIN mdata.assets a
        ON a.tenant_id = w.operating_company_id
       AND a.unit_code = u.unit_number
      WHERE w.id = $1::uuid
        AND w.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [wo.id, operatingCompanyId]
  );
  const row = res.rows[0];
  return row ? { asset_id: row.asset_id, unit_code: row.unit_code } : { asset_id: null, unit_code: null };
}

async function lookupPseByRmLane(client: DbClient, operatingCompanyId: string, lane: RmPseLane) {
  const res = await client.query<{
    ps_category_qbo_id: string;
    ps_item_qbo_id: string;
    coa_account_id: string | null;
  }>(
    `
      SELECT
        c.qbo_id AS ps_category_qbo_id,
        i.qbo_id AS ps_item_qbo_id,
        COALESCE(i.coa_account_id::text, c.coa_account_id::text) AS coa_account_id
      FROM accounting.ps_item i
      JOIN accounting.ps_category c
        ON c.tenant_id = i.tenant_id
       AND lower(c.qbo_id) = lower(i.category_qbo_id)
      WHERE i.tenant_id = $1::uuid
        AND i.active = true
        AND c.active = true
        AND (
          i.name ILIKE $2
          OR c.name ILIKE $2
          OR i.name ILIKE $3
          OR c.name ILIKE $3
        )
      ORDER BY i.name ASC
      LIMIT 1
    `,
    [operatingCompanyId, lane, lane.replace("&", "and")]
  );
  return res.rows[0] ?? null;
}

async function listWoPostingLines(client: DbClient, workOrderId: string) {
  const res = await client.query<{
    wo_line_uuid: string;
    line_type: string;
    description: string | null;
    amount: string | number | null;
    section: string | null;
  }>(
    `
      SELECT
        uuid::text AS wo_line_uuid,
        line_type::text AS line_type,
        description,
        total_cost::text AS amount,
        section::text AS section
      FROM maintenance.work_order_lines
      WHERE work_order_uuid = $1::uuid
        AND line_type IN ('part', 'parts', 'labor')
      ORDER BY created_at ASC
    `,
    [workOrderId]
  );
  return res.rows;
}

export async function buildMaintWoApPostingPreview(
  userId: string,
  input: WoApContextInput & { actor_user_id?: string }
): Promise<MaintWoApPostingPreview> {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
    const wo = await loadWorkOrder(client as DbClient, input);
    if (!wo) {
      return {
        work_order_id: input.work_order_id,
        operating_company_id: input.operating_company_id,
        status: null,
        vendor_id: null,
        asset_id: null,
        asset_unit_code: null,
        ready: false,
        blocking_errors: ["work_order_not_found"],
        pse: {
          rm_lane: "R&M-INT",
          ps_category_qbo_id: null,
          ps_item_qbo_id: null,
          resolved_coa_account_id: null,
          coa_account_id: null,
        },
        lines: [],
        bill_total_cents: 0,
        existing_bill_id: null,
      };
    }

    const blocking: string[] = [];
    const vendorId = String(wo.external_vendor_id ?? wo.vendor_id ?? "").trim();
    if (!vendorId) blocking.push("vendor_required");

    const asset = await resolveAssetForWorkOrder(client as DbClient, input.operating_company_id, wo);
    if (!asset.asset_id) blocking.push("asset_required");

    const rmLane = resolveRmPseLane(wo.bucket, wo.repair_location);
    let psCategory = wo.ap_ps_category_qbo_id?.trim() ?? null;
    let psItem = wo.ap_ps_item_qbo_id?.trim() ?? null;
    let coaAccountId: string | null = null;

    if (psCategory && psItem) {
      try {
        const enforced = await enforcePsePostingSelection(userId, input.operating_company_id, {
          psCategoryQboId: psCategory,
          psItemQboId: psItem,
        });
        coaAccountId = enforced.resolved_coa_account_id;
      } catch (error) {
        blocking.push(String((error as Error).message ?? "pse_enforcement_failed"));
      }
    } else {
      const mapped = await lookupPseByRmLane(client as DbClient, input.operating_company_id, rmLane);
      if (!mapped) {
        blocking.push("pse_posting_required");
      } else {
        psCategory = mapped.ps_category_qbo_id;
        psItem = mapped.ps_item_qbo_id;
        coaAccountId = mapped.coa_account_id;
        try {
          const enforced = await enforcePsePostingSelection(userId, input.operating_company_id, {
            psCategoryQboId: psCategory,
            psItemQboId: psItem,
          });
          coaAccountId = enforced.resolved_coa_account_id;
        } catch (error) {
          blocking.push(String((error as Error).message ?? "pse_enforcement_failed"));
        }
      }
    }

    const lines = (await listWoPostingLines(client as DbClient, input.work_order_id)).map((line) => ({
      wo_line_uuid: line.wo_line_uuid,
      line_type: line.line_type,
      description: line.description,
      amount_cents: amountToCents(line.amount),
      section: line.section,
    }));
    if (lines.length === 0) blocking.push("wo_lines_required");

    const billTotalCents = lines.reduce((sum, line) => sum + line.amount_cents, 0);
    if (billTotalCents <= 0) blocking.push("bill_total_must_be_positive");

    const existing = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM accounting.bills
        WHERE operating_company_id = $1::uuid
          AND linked_work_order_uuid = $2::uuid
          AND revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.operating_company_id, input.work_order_id]
    );

    return {
      work_order_id: input.work_order_id,
      operating_company_id: input.operating_company_id,
      status: wo.status,
      vendor_id: vendorId || null,
      asset_id: asset.asset_id,
      asset_unit_code: asset.unit_code,
      ready: blocking.length === 0,
      blocking_errors: blocking,
      pse: {
        rm_lane: rmLane,
        ps_category_qbo_id: psCategory,
        ps_item_qbo_id: psItem,
        resolved_coa_account_id: coaAccountId,
        coa_account_id: coaAccountId,
      },
      lines,
      bill_total_cents: billTotalCents,
      existing_bill_id: existing.rows[0]?.id ?? null,
    };
  });
}

export async function applyMaintWoApStructuredBill(
  client: DbClient,
  input: WoApContextInput & { actor_user_id: string },
  billId: string
) {
  const wo = await loadWorkOrder(client, input);
  if (!wo) throw new MaintWoApPostingError("work_order_not_found");

  const preview = await buildMaintWoApPostingPreview(input.actor_user_id, input);
  if (!preview.ready) {
    throw new MaintWoApPostingError("wo_ap_posting_not_ready", preview.blocking_errors.join("; "));
  }

  const pse = preview.pse;
  if (!pse.ps_category_qbo_id || !pse.ps_item_qbo_id) {
    throw new MaintWoApPostingError("pse_posting_required");
  }

  await client.query(
    `
      UPDATE accounting.bills
      SET ps_category_qbo_id = $3,
          ps_item_qbo_id = $4,
          ps_qbo_account_id = NULLIF(regexp_replace($5::text, '[^0-9]', '', 'g'), '')::numeric,
          ps_enforced_at = now(),
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [billId, input.operating_company_id, pse.ps_category_qbo_id, pse.ps_item_qbo_id, pse.resolved_coa_account_id]
  );

  const billLineColumns = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'bill_lines'
    `
  );
  const columns = new Set(billLineColumns.rows.map((row) => String(row.column_name)));
  const accountColumn = columns.has("account_id")
    ? "account_id"
    : columns.has("coa_account_id")
      ? "coa_account_id"
      : null;

  await client.query(
    `
      UPDATE accounting.bill_lines
      SET ps_category_qbo_id = $2,
          ps_item_qbo_id = $3
      WHERE bill_id = $1::uuid
        AND COALESCE(amount, 0) > 0
    `,
    [billId, pse.ps_category_qbo_id, pse.ps_item_qbo_id]
  );

  if (accountColumn && pse.coa_account_id) {
    await client.query(
      `
        UPDATE accounting.bill_lines
        SET ${accountColumn} = $2::uuid
        WHERE bill_id = $1::uuid
          AND COALESCE(amount, 0) > 0
      `,
      [billId, pse.coa_account_id]
    );
  }

  if (preview.asset_id && preview.bill_total_cents > 0) {
    await client.query(`DELETE FROM accounting.bill_unit_allocation WHERE bill_id = $1::uuid AND tenant_id = $2::uuid`, [
      billId,
      input.operating_company_id,
    ]);
    await client.query(
      `
        INSERT INTO accounting.bill_unit_allocation (
          tenant_id,
          bill_id,
          asset_id,
          allocation_method,
          allocation_pct,
          allocated_amount_cents
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'manual_pct', 100, $4)
      `,
      [input.operating_company_id, billId, preview.asset_id, preview.bill_total_cents]
    );
  }

  await assertBillPsePostingEnforced(input.actor_user_id, input.operating_company_id, billId);
}

export async function processMaintWorkOrderApPosting(input: WoApContextInput & { actor_user_id: string }) {
  const preview = await buildMaintWoApPostingPreview(input.actor_user_id, input);
  if (!preview.ready) {
    throw new MaintWoApPostingError("wo_ap_posting_not_ready", preview.blocking_errors.join("; "));
  }

  const posting = await processMaintenanceWorkOrderClose(input);
  if (!posting.bill_id) {
    throw new MaintWoApPostingError("bill_not_created_for_work_order");
  }

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await applyMaintWoApStructuredBill(client as DbClient, input, posting.bill_id as string);
  });

  return {
    ...posting,
    structured_payload: {
      ps_category_qbo_id: preview.pse.ps_category_qbo_id,
      ps_item_qbo_id: preview.pse.ps_item_qbo_id,
      resolved_coa_account_id: preview.pse.resolved_coa_account_id,
      asset_id: preview.asset_id,
      bill_total_cents: preview.bill_total_cents,
    },
  };
}

export async function loadMaintWoApBillId(input: WoApContextInput): Promise<string | null> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const res = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM accounting.bills
        WHERE operating_company_id = $1::uuid
          AND linked_work_order_uuid = $2::uuid
          AND revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.operating_company_id, input.work_order_id]
    );
    return res.rows[0]?.id ?? null;
  });
}

export function mapMaintWoApHttpError(error: unknown) {
  if (error instanceof MaintWoApPostingError) {
    if (error.code === "work_order_not_found") return { statusCode: 404 as const, body: { error: error.code } };
    if (error.code === "wo_ap_posting_not_ready" || error.code === "pse_posting_required") {
      return { statusCode: 409 as const, body: { error: error.code, message: error.message } };
    }
    return { statusCode: 400 as const, body: { error: error.code, message: error.message } };
  }
  if (error instanceof PseEnforcementError) {
    return { statusCode: 409 as const, body: { error: error.code, message: error.message } };
  }
  return null;
}
