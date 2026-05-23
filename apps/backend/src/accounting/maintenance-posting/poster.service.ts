import { withLuciaBypass } from "../../auth/db.js";
import { enqueueTmsBillPushRequested } from "../../qbo/tms-bill-push-chain.service.js";
import { ExpenseCategoryMapResolutionError, resolveAccountForCategory } from "../expense-category-map/resolver.service.js";
import { PostingEngineError, postSourceTransaction } from "../posting-engine.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type MaintenanceCategoryCode = "tires" | "brakes" | "engine" | "dot" | "pm_preventive" | "body" | "electrical" | "ac" | "misc";

type WorkOrderLineRow = {
  wo_line_uuid: string;
  line_type: string;
  description: string | null;
  amount: string | number | null;
  section: string | null;
  expense_category_uuid: string | null;
  service_item_uuid: string | null;
  part_uuid: string | null;
  labor_rate_uuid: string | null;
  part_location_codes: string[] | null;
};

type ClosePostingInput = {
  operating_company_id: string;
  work_order_id: string;
  actor_user_id: string;
};

type ClosePostingResult = {
  bill_id: string | null;
  bill_action: "created" | "reused" | "skipped_no_vendor" | "skipped_no_lines";
  ledger_posting: "posted" | "already_posted" | "skipped";
  posting_batch_id: string | null;
};

const CLOSED_STATUSES = new Set(["closed", "completed", "voided", "complete", "cancelled"]);

function asAmount(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapMaintenanceCategoryCode(workOrder: { wo_type?: string | null; wo_service_class?: string | null; description?: string | null }, line: WorkOrderLineRow): MaintenanceCategoryCode {
  const lineText = `${String(line.description ?? "")} ${String(line.line_type ?? "")}`.toLowerCase().replace(/\s+/g, " ");
  if (/\btire|wheel\b/.test(lineText)) return "tires";
  if (/\bbrake\b/.test(lineText)) return "brakes";
  if (/\bengine|coolant|transmission|turbo\b/.test(lineText)) return "engine";
  if (/\bdot\b|\binspection\b/.test(lineText)) return "dot";
  if (/\bbody\b|collision|paint/.test(lineText)) return "body";
  if (/\belectrical\b|battery|alternator|wiring/.test(lineText)) return "electrical";
  if (/\bac\b|\ba\/c\b|air conditioning|hvac/.test(lineText)) return "ac";
  if (/\bpm\b|preventive|maintenance service/.test(lineText)) return "pm_preventive";

  const woText = `${String(workOrder.description ?? "")} ${String(workOrder.wo_type ?? "")} ${String(workOrder.wo_service_class ?? "")}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (/\btire|wheel\b/.test(woText)) return "tires";
  if (/\bbrake\b/.test(woText)) return "brakes";
  if (/\bengine|coolant|transmission|turbo\b/.test(woText)) return "engine";
  if (/\bdot\b|\binspection\b/.test(woText)) return "dot";
  if (/\bbody\b|collision|paint/.test(woText)) return "body";
  if (/\belectrical\b|battery|alternator|wiring/.test(woText)) return "electrical";
  if (/\bac\b|\ba\/c\b|air conditioning|hvac/.test(woText)) return "ac";
  if (/\bpm\b|preventive|maintenance service/.test(woText)) return "pm_preventive";
  return "misc";
}

async function detectBillLineAccountColumn(client: DbClient): Promise<"account_id" | "coa_account_id" | null> {
  const cols = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'bill_lines'
        AND column_name IN ('account_id', 'coa_account_id')
      ORDER BY CASE column_name WHEN 'account_id' THEN 1 ELSE 2 END
      LIMIT 1
    `
  );
  const col = cols.rows[0]?.column_name;
  if (col === "account_id" || col === "coa_account_id") return col;
  return null;
}

async function listBillLineColumns(client: DbClient): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'bill_lines'
    `
  );
  return new Set(res.rows.map((row) => String(row.column_name)));
}

async function getOrCreateBillForWorkOrder(
  client: DbClient,
  input: ClosePostingInput
): Promise<{ bill_id: string | null; action: "created" | "reused" | "skipped_no_vendor" }> {
  const woRes = await client.query<{
    id: string;
    status: string | null;
    vendor_id: string | null;
    external_vendor_id: string | null;
    total_actual_cost: string | number | null;
    display_id: string | null;
  }>(
    `
      SELECT
        id::text,
        status::text,
        vendor_id::text,
        external_vendor_id::text,
        total_actual_cost::text,
        display_id::text
      FROM maintenance.work_orders
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.work_order_id, input.operating_company_id]
  );
  const wo = woRes.rows[0];
  if (!wo || !CLOSED_STATUSES.has(String(wo.status ?? "").toLowerCase())) {
    return { bill_id: null, action: "skipped_no_vendor" };
  }
  const vendorKey = String(wo.external_vendor_id ?? wo.vendor_id ?? "").trim();
  if (!vendorKey) return { bill_id: null, action: "skipped_no_vendor" };

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
  if (existing.rows[0]?.id) {
    return { bill_id: existing.rows[0].id, action: "reused" };
  }

  const totalAmount = asAmount(wo.total_actual_cost);
  const billInsert = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.bills (
        operating_company_id,
        vendor_id,
        vendor_uuid,
        linked_work_order_uuid,
        status,
        bill_date,
        due_date,
        total_amount,
        amount_cents,
        paid_amount,
        paid_cents,
        memo,
        qbo_sync_pending,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid, $2, $2, $3::uuid, 'unpaid', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
        $4, $5, 0, 0, $6, true, $7::uuid, now(), now()
      )
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      vendorKey,
      input.work_order_id,
      totalAmount,
      Math.round(totalAmount * 100),
      `Auto-created from work order ${String(wo.display_id ?? input.work_order_id)}`,
      input.actor_user_id,
    ]
  );
  return { bill_id: billInsert.rows[0]?.id ?? null, action: "created" };
}

async function insertBillLinesFromWorkOrder(
  client: DbClient,
  input: ClosePostingInput,
  billId: string
): Promise<{ inserted_count: number }> {
  const woContext = await client.query<{ wo_type: string | null; wo_service_class: string | null; description: string | null }>(
    `
      SELECT wo_type::text, wo_service_class::text, description
      FROM maintenance.work_orders
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.work_order_id, input.operating_company_id]
  );
  const wo = woContext.rows[0] ?? {};

  const lines = await client.query<WorkOrderLineRow>(
    `
      SELECT
        uuid::text AS wo_line_uuid,
        line_type::text,
        description,
        total_cost::text AS amount,
        section::text,
        expense_category_uuid::text,
        service_item_uuid::text,
        part_uuid::text,
        labor_rate_uuid::text,
        part_location_codes
      FROM maintenance.work_order_lines
      WHERE work_order_uuid = $1::uuid
        AND line_type IN ('part', 'parts', 'labor')
      ORDER BY created_at ASC
    `,
    [input.work_order_id]
  );
  if (lines.rows.length === 0) return { inserted_count: 0 };

  const existingLinked = await client.query<{ linked_wo_line_uuid: string }>(
    `
      SELECT linked_wo_line_uuid::text
      FROM accounting.bill_lines
      WHERE bill_id = $1::uuid
        AND linked_wo_line_uuid IS NOT NULL
    `,
    [billId]
  );
  const existingLineIds = new Set(existingLinked.rows.map((row) => String(row.linked_wo_line_uuid)));
  const billLineColumns = await listBillLineColumns(client);
  const accountColumn = await detectBillLineAccountColumn(client);

  const seqRes = await client.query<{ max_line_sequence: number }>(
    `SELECT COALESCE(MAX(line_sequence), 0)::int AS max_line_sequence FROM accounting.bill_lines WHERE bill_id = $1::uuid`,
    [billId]
  );
  let seq = Number(seqRes.rows[0]?.max_line_sequence ?? 0);
  let inserted = 0;

  for (const line of lines.rows) {
    if (existingLineIds.has(line.wo_line_uuid)) continue;
    const categoryCode = mapMaintenanceCategoryCode(wo, line);
    const account = await resolveAccountForCategory(input.operating_company_id, "maintenance", categoryCode);
    seq += 1;

    const columns: string[] = ["bill_id", "line_sequence", "amount", "description", "linked_wo_line_uuid"];
    const values: unknown[] = [billId, seq, asAmount(line.amount), line.description ?? null, line.wo_line_uuid];
    if (billLineColumns.has("section")) {
      columns.push("section");
      values.push(line.section ?? "B");
    }
    if (billLineColumns.has("expense_category_uuid")) {
      columns.push("expense_category_uuid");
      values.push(line.expense_category_uuid ?? null);
    }
    if (billLineColumns.has("service_item_uuid")) {
      columns.push("service_item_uuid");
      values.push(line.service_item_uuid ?? null);
    }
    if (billLineColumns.has("part_uuid")) {
      columns.push("part_uuid");
      values.push(line.part_uuid ?? null);
    }
    if (billLineColumns.has("labor_rate_uuid")) {
      columns.push("labor_rate_uuid");
      values.push(line.labor_rate_uuid ?? null);
    }
    if (billLineColumns.has("part_location_codes")) {
      columns.push("part_location_codes");
      values.push(line.part_location_codes ?? null);
    }
    if (accountColumn) {
      columns.push(accountColumn);
      values.push(account.account_id);
    }
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
    await client.query(`INSERT INTO accounting.bill_lines (${columns.join(", ")}) VALUES (${placeholders})`, values);
    inserted += 1;
  }

  return { inserted_count: inserted };
}

async function recalcBillTotal(client: DbClient, billId: string) {
  const totals = await client.query<{ total_amount: string }>(
    `
      SELECT COALESCE(SUM(amount), 0)::text AS total_amount
      FROM accounting.bill_lines
      WHERE bill_id = $1::uuid
    `,
    [billId]
  );
  const total = asAmount(totals.rows[0]?.total_amount ?? 0);
  await client.query(
    `
      UPDATE accounting.bills
      SET total_amount = $2,
          amount_cents = $3,
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [billId, total, Math.round(total * 100)]
  );
}

export async function processMaintenanceWorkOrderClose(input: ClosePostingInput): Promise<ClosePostingResult> {
  const dbResult = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const bill = await getOrCreateBillForWorkOrder(client, input);
    if (!bill.bill_id) {
      return {
        bill_id: null,
        bill_action: bill.action,
        should_post: false,
      };
    }

    const inserted = await insertBillLinesFromWorkOrder(client, input, bill.bill_id);
    if (inserted.inserted_count === 0 && bill.action !== "reused") {
      return {
        bill_id: bill.bill_id,
        bill_action: "skipped_no_lines" as const,
        should_post: false,
      };
    }

    await recalcBillTotal(client, bill.bill_id);
    await enqueueTmsBillPushRequested(client as Parameters<typeof enqueueTmsBillPushRequested>[0], {
      operating_company_id: input.operating_company_id,
      bill_id: bill.bill_id,
      operation: bill.action === "created" ? "create" : "update",
    });
    return {
      bill_id: bill.bill_id,
      bill_action: bill.action,
      should_post: true,
    };
  });

  if (!dbResult.bill_id || !dbResult.should_post) {
    return {
      bill_id: dbResult.bill_id,
      bill_action: dbResult.bill_action,
      ledger_posting: "skipped",
      posting_batch_id: null,
    };
  }

  try {
    const posting = await postSourceTransaction(
      {
        operating_company_id: input.operating_company_id,
        source_transaction_type: "bill",
        source_transaction_id: dbResult.bill_id,
      },
      { userId: input.actor_user_id }
    );
    return {
      bill_id: dbResult.bill_id,
      bill_action: dbResult.bill_action,
      ledger_posting: posting.result === "already_posted" ? "already_posted" : "posted",
      posting_batch_id: posting.posting_batch_id,
    };
  } catch (error) {
    // Missing mapping is expected if a maintenance category map has not been configured yet.
    if (error instanceof ExpenseCategoryMapResolutionError) {
      return {
        bill_id: dbResult.bill_id,
        bill_action: dbResult.bill_action,
        ledger_posting: "skipped",
        posting_batch_id: null,
      };
    }
    if (error instanceof PostingEngineError && error.code === "BILL_NOT_POSTING_ELIGIBLE") {
      return {
        bill_id: dbResult.bill_id,
        bill_action: dbResult.bill_action,
        ledger_posting: "skipped",
        posting_batch_id: null,
      };
    }
    throw error;
  }
}
