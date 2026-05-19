import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type TwoSectionHeader = {
  operating_company_id: string;
  wo_type: "pm" | "repair" | "tire" | "accident";
  source_type: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS";
  status?: "open" | "in_progress" | "waiting_parts" | "complete" | "cancelled";
  unit_id: string;
  driver_id?: string | null;
  load_id?: string | null;
  load_exemption_reason?: string | null;
  service_date?: string | null;
  repair_location: string;
  bucket?: "in_house" | "external" | "roadside";
  /** UUID row id from mdata.qbo_vendors (QuickBooks mirror). */
  vendor_id?: string | null;
  vendor_qbo_id?: string | null;
  shop_name?: string | null;
  shop_address?: string | null;
  shop_phone?: string | null;
  vendor_invoice_number?: string | null;
  external_vendor_id?: string | null;
  external_vendor_wo_number?: string | null;
  external_vendor_invoice_number?: string | null;
  description: string;
  severity?: string | null;
  payment_timing: "in_house" | "paid_same_day" | "vendor_invoice";
  bill_terms?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  payment_account_uuid?: string | null;
  roadside_callout_at?: string | null;
  roadside_arrived_at?: string | null;
  roadside_provider_vendor_id?: string | null;
  roadside_location?: string | null;
  roadside_breakdown_load_id?: string | null;
};

export type SectionALine = {
  description: string;
  quantity: number;
  amount: number;
  expense_category_uuid: string;
};

export type SectionBSubLine = {
  line_type: "parts" | "labor";
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  part_uuid?: string;
  labor_rate_uuid?: string;
  part_location_codes?: string[];
};

export type SectionBLine = {
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  service_item_uuid: string;
  sub_rows?: SectionBSubLine[];
};

function asNumber(value: number | string | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

async function relationExists(client: DbClient, rel: string) {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(client: DbClient, tableName: string, columnName: string) {
  const [schema, table] = tableName.split(".");
  const res = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, columnName]
  );
  return Boolean(res.rows[0]?.ok);
}

async function deriveClassHint(client: DbClient, unitId: string, driverId?: string | null) {
  const unitRes = await client.query<{ unit_number: string | null; display_id: string | null }>(
    `SELECT unit_number, display_id FROM mdata.units WHERE id = $1 LIMIT 1`,
    [unitId]
  );
  const unitPart = String(unitRes.rows[0]?.display_id ?? unitRes.rows[0]?.unit_number ?? "UNIT").trim();
  let driverPart = "UNASSIGNED";
  if (driverId) {
    const driverRes = await client.query<{ last_name: string | null }>(`SELECT last_name FROM mdata.drivers WHERE id = $1 LIMIT 1`, [driverId]);
    driverPart = String(driverRes.rows[0]?.last_name ?? "UNASSIGNED").trim().toUpperCase();
  }
  return `${unitPart}-${driverPart}`;
}

export async function createWorkOrderWithLines(
  client: DbClient,
  userId: string,
  header: TwoSectionHeader,
  sectionALines: SectionALine[],
  sectionBLines: SectionBLine[]
) {
  const displayIdRes = await client.query<{ display_id: string; sequence: number }>(
    `SELECT display_id, sequence FROM maintenance.next_wo_display_id($1, $2, COALESCE($3::date, CURRENT_DATE), $4)`,
    [header.unit_id, header.source_type, header.service_date ?? null, header.operating_company_id]
  );
  const display = displayIdRes.rows[0];
  const classHint = await deriveClassHint(client, header.unit_id, header.driver_id);

  const sectionATotal = sectionALines.reduce((sum, line) => sum + asNumber(line.amount) * Math.max(1, asNumber(line.quantity)), 0);
  const sectionBTotal = sectionBLines.reduce((sum, line) => {
    const subTotal = (line.sub_rows ?? []).reduce((acc, sub) => acc + asNumber(sub.amount), 0);
    return sum + Math.max(asNumber(line.amount), subTotal);
  }, 0);
  const totalCost = Number((sectionATotal + sectionBTotal).toFixed(2));

  const woRes = await client.query<{ id: string; display_id: string }>(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id, wo_type, source_type, status, unit_id, driver_id, load_id, opened_at,
        repair_location, assigned_vendor, vendor_invoice_number, description, severity,
        external_vendor_id, external_vendor_wo_number, external_vendor_invoice_number,
        display_id, unit_sequence, total_estimated_cost, total_actual_cost,
        bucket, roadside_callout_at, roadside_arrived_at, roadside_provider_vendor_id, roadside_location, roadside_breakdown_load_id,
        shop_name, shop_address, shop_phone, vendor_id, vendor_qbo_id
      ) VALUES (
        $1,$2,$3,COALESCE($4,'open'),$5,$6,$7,COALESCE($8::timestamptz, now()),
        $9,NULL,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
      )
      RETURNING id, display_id
    `,
    [
      header.operating_company_id,
      header.wo_type,
      header.source_type,
      header.status ?? "open",
      header.unit_id,
      header.driver_id ?? null,
      header.load_id ?? null,
      header.service_date ?? null,
      header.repair_location,
      header.vendor_invoice_number ?? null,
      header.description,
      header.severity ?? null,
      header.external_vendor_id ?? null,
      header.external_vendor_wo_number ?? null,
      header.external_vendor_invoice_number ?? null,
      display?.display_id ?? null,
      Number(display?.sequence ?? 0) || null,
      totalCost,
      header.bucket ?? "in_house",
      header.roadside_callout_at ?? null,
      header.roadside_arrived_at ?? null,
      header.roadside_provider_vendor_id ?? null,
      header.roadside_location ?? null,
      header.roadside_breakdown_load_id ?? null,
      header.shop_name ?? null,
      header.shop_address ?? null,
      header.shop_phone ?? null,
      header.vendor_id ?? null,
      header.vendor_qbo_id ?? null,
    ]
  );
  const wo = woRes.rows[0];

  for (const line of sectionALines) {
    const amount = asNumber(line.amount);
    const quantity = Math.max(1, asNumber(line.quantity));
    await client.query(
      `
        INSERT INTO maintenance.work_order_lines (
          work_order_id, line_type, description, quantity, unit_cost, amount,
          section, expense_category_uuid
        ) VALUES ($1,'other',$2,$3,$4,$5,'A',$6)
      `,
      [wo.id, line.description, quantity, amount, amount * quantity, line.expense_category_uuid]
    );
    await appendCrudAudit(
      client as never,
      userId,
      "maintenance.wo.section_a_line_added",
      { work_order_id: wo.id, amount, expense_category_uuid: line.expense_category_uuid },
      "info",
      "P3-T11.17-TWO-SECTION-V5"
    );
  }

  for (const parent of sectionBLines) {
    const parentInsert = await client.query<{ id: string }>(
      `
        INSERT INTO maintenance.work_order_lines (
          work_order_id, line_type, description, quantity, unit_cost, amount,
          section, service_item_uuid
        ) VALUES ($1,'other',$2,$3,$4,$5,'B',$6)
        RETURNING id
      `,
      [wo.id, parent.description, Math.max(1, asNumber(parent.quantity)), asNumber(parent.unit_cost), asNumber(parent.amount), parent.service_item_uuid]
    );
    const parentId = parentInsert.rows[0]?.id;
    await appendCrudAudit(
      client as never,
      userId,
      "maintenance.wo.section_b_line_added",
      { work_order_id: wo.id, parent_line_id: parentId, service_item_uuid: parent.service_item_uuid },
      "info",
      "P3-T11.17-TWO-SECTION-V5"
    );

    for (const sub of parent.sub_rows ?? []) {
      const insert = await client.query<{ id: string }>(
        `
          INSERT INTO maintenance.work_order_lines (
            work_order_id, line_type, description, quantity, unit_cost, amount, section,
            parent_line_uuid, part_uuid, labor_rate_uuid, part_location_codes
          ) VALUES (
            $1,$2,$3,$4,$5,$6,'B',$7,$8,$9,$10
          )
          RETURNING id
        `,
        [
          wo.id,
          sub.line_type,
          sub.description,
          Math.max(1, asNumber(sub.quantity)),
          asNumber(sub.unit_cost),
          asNumber(sub.amount),
          parentId,
          sub.part_uuid ?? null,
          sub.labor_rate_uuid ?? null,
          sub.part_location_codes ?? null,
        ]
      );
      await appendCrudAudit(
        client as never,
        userId,
        "maintenance.wo.parts_subrow_added",
        {
          work_order_id: wo.id,
          parent_line_id: parentId,
          sub_line_id: insert.rows[0]?.id,
          line_type: sub.line_type,
          part_uuid: sub.part_uuid ?? null,
          labor_rate_uuid: sub.labor_rate_uuid ?? null,
        },
        "info",
        "P3-T11.17-TWO-SECTION-V5"
      );
      if ((sub.part_location_codes ?? []).length > 0) {
        await appendCrudAudit(
          client as never,
          userId,
          "maintenance.wo.part_location_set",
          {
            work_order_id: wo.id,
            sub_line_id: insert.rows[0]?.id,
            part_location_codes: sub.part_location_codes ?? [],
          },
          "info",
          "P3-T11.17-TWO-SECTION-V5"
        );
      }
    }
  }

  await client.query(
    `INSERT INTO maintenance.wo_status_history (work_order_id, from_status, to_status, changed_at, changed_by_user_id, notes)
     VALUES ($1, NULL, COALESCE($2,'open'), now(), $3, $4)`,
    [wo.id, header.status ?? "open", userId, `Class auto-derive: ${classHint}`]
  );

  await appendCrudAudit(
    client as never,
    userId,
    "maintenance.wo.created",
    {
      resource_type: "maintenance.work_orders",
      resource_id: wo.id,
      display_id: wo.display_id,
      section_a_count: sectionALines.length,
      section_b_count: sectionBLines.length,
      total_cost: totalCost,
      class_hint: classHint,
    },
    "info",
    "P3-T11.17-TWO-SECTION-V5"
  );
  await appendCrudAudit(
    client as never,
    userId,
    "maintenance.work_order.opened",
    {
      resource_type: "maintenance.work_orders",
      resource_id: wo.id,
      opened_at: new Date().toISOString(),
      status: header.status ?? "open",
    },
    "info",
    "P5-D5-WO-TIME"
  );

  return { woUuid: wo.id, display_id: wo.display_id, classHint };
}

async function copyToAccountingLines(
  client: DbClient,
  sourceWoId: string,
  destinationTable: "accounting.bill_lines" | "accounting.expense_lines",
  destinationFkColumn: "bill_id" | "expense_id",
  destinationId: string
) {
  const source = await client.query<{
    id: string;
    line_type: string;
    description: string;
    quantity: number;
    unit_cost: number;
    amount: number;
    section: string;
    parent_line_uuid: string | null;
    expense_category_uuid: string | null;
    service_item_uuid: string | null;
    part_uuid: string | null;
    labor_rate_uuid: string | null;
    part_location_codes: string[] | null;
  }>(
    `
      SELECT
        id, line_type, description, quantity, unit_cost, amount,
        COALESCE(section, 'B') AS section,
        parent_line_uuid, expense_category_uuid, service_item_uuid, part_uuid, labor_rate_uuid, part_location_codes
      FROM maintenance.work_order_lines
      WHERE work_order_id = $1
      ORDER BY created_at ASC
    `,
    [sourceWoId]
  );

  const idMap = new Map<string, string>();
  let seq = 1;
  for (const row of source.rows) {
    const parentMapped = row.parent_line_uuid ? idMap.get(row.parent_line_uuid) ?? null : null;
    const insert = await client.query<{ id: string }>(
      `
        INSERT INTO ${destinationTable} (
          ${destinationFkColumn}, line_sequence, amount, description, section, parent_line_uuid,
          expense_category_uuid, service_item_uuid, part_uuid, labor_rate_uuid, part_location_codes, linked_wo_line_uuid
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id
      `,
      [
        destinationId,
        seq++,
        asNumber(row.amount),
        row.description,
        row.section,
        parentMapped,
        row.expense_category_uuid,
        row.service_item_uuid,
        row.part_uuid,
        row.labor_rate_uuid,
        row.part_location_codes ?? null,
        row.id,
      ]
    );
    idMap.set(row.id, String(insert.rows[0]?.id ?? ""));
  }
}

export async function autoCreateBillFromWO(
  client: DbClient,
  userId: string,
  woUuid: string,
  opts?: { billNumber?: string | null; memo?: string | null }
) {
  if (!(await relationExists(client, "accounting.bills"))) return null;
  const billRes = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.bills (
        operating_company_id, vendor_uuid, linked_work_order_uuid, status, bill_date, due_date, total_amount, qbo_sync_pending
      )
      SELECT
        w.operating_company_id,
        COALESCE(w.external_vendor_id, w.assigned_vendor, w.vendor_id),
        w.id,
        'draft',
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days',
        COALESCE(w.total_actual_cost, w.total_estimated_cost, 0),
        true
      FROM maintenance.work_orders w
      WHERE w.id = $1
      RETURNING id
    `,
    [woUuid]
  );
  const billId = String(billRes.rows[0]?.id ?? "");
  const billNumber = String(opts?.billNumber ?? "").trim();
  const memo = String(opts?.memo ?? "").trim();
  if (!billId) return null;
  if (billNumber) {
    await client.query(`UPDATE accounting.bills SET bill_number = $2, updated_at = now() WHERE id = $1`, [billId, billNumber]);
  }
  if (memo) {
    await client.query(`UPDATE accounting.bills SET memo = $2, updated_at = now() WHERE id = $1`, [billId, memo]);
  }
  if (await relationExists(client, "accounting.bill_lines")) {
    await copyToAccountingLines(client, woUuid, "accounting.bill_lines", "bill_id", billId);
  }
  await appendCrudAudit(
    client as never,
    userId,
    "accounting.bill.auto_created_from_wo",
    { work_order_id: woUuid, bill_id: billId },
    "info",
    "P3-T11.17-TWO-SECTION-V5"
  );
  return { uuid: billId };
}

export async function autoCreateExpenseFromWO(
  client: DbClient,
  userId: string,
  woUuid: string,
  paymentAccountUuid?: string | null,
  loadExemptionReason?: string | null
) {
  if (!(await relationExists(client, "accounting.expenses"))) return null;
  const woContext = await client.query<{
    operating_company_id: string;
    vendor_uuid: string | null;
    load_id: string | null;
    total_amount: number | null;
  }>(
    `
      SELECT
        w.operating_company_id,
        COALESCE(w.external_vendor_id, w.assigned_vendor, w.vendor_id) AS vendor_uuid,
        w.load_id,
        COALESCE(w.total_actual_cost, w.total_estimated_cost, 0) AS total_amount
      FROM maintenance.work_orders w
      WHERE w.id = $1
      LIMIT 1
    `,
    [woUuid]
  );
  const wo = woContext.rows[0];
  if (!wo) return null;

  const hasQboCategoryTable = await relationExists(client, "catalogs.qbo_categories");
  const expenseCategoryRequiresLoad = await client.query<{ requires_load: boolean }>(
    hasQboCategoryTable
      ? `
          WITH categories AS (
            SELECT DISTINCT
              wl.expense_category_uuid,
              upper(trim(COALESCE(q.code, ''))) AS category_code,
              upper(trim(COALESCE(q.display_name, ''))) AS category_name,
              upper(COALESCE(wl.description, '')) AS line_desc
            FROM maintenance.work_order_lines wl
            LEFT JOIN catalogs.qbo_categories q ON q.id = wl.expense_category_uuid
            WHERE wl.work_order_id = $1
              AND wl.section = 'A'
          )
          SELECT EXISTS (
            SELECT 1
            FROM categories
            WHERE category_code IN ('FUEL', 'DIESEL', 'ROADSIDE', 'TOLL', 'PARKING')
               OR category_name IN ('FUEL', 'DIESEL', 'ROADSIDE', 'TOLL', 'PARKING')
               OR line_desc ~ '(FUEL|DIESEL|ROADSIDE|TOLL|PARKING)'
          ) AS requires_load
        `
      : `
          SELECT EXISTS (
            SELECT 1
            FROM maintenance.work_order_lines wl
            WHERE wl.work_order_id = $1
              AND wl.section = 'A'
              AND upper(COALESCE(wl.description, '')) ~ '(FUEL|DIESEL|ROADSIDE|TOLL|PARKING)'
          ) AS requires_load
        `,
    [woUuid]
  );
  const exemptionReason = String(loadExemptionReason ?? "").trim();
  if (expenseCategoryRequiresLoad.rows[0]?.requires_load && !wo.load_id && exemptionReason.length < 20) {
    throw new Error("E_DIESEL_REQUIRES_LOAD");
  }

  const hasLoadIdColumn = await columnExists(client, "accounting.expenses", "load_id");
  const expenseRes = await client.query<{ id: string }>(
    hasLoadIdColumn
      ? `
          INSERT INTO accounting.expenses (
            operating_company_id,
            vendor_uuid,
            linked_work_order_uuid,
            load_id,
            status,
            transaction_date,
            total_amount,
            payment_account_uuid
          )
          VALUES ($1, $2, $3, $4, 'posted', CURRENT_DATE, $5, $6)
          RETURNING id
        `
      : `
          INSERT INTO accounting.expenses (
            operating_company_id,
            vendor_uuid,
            linked_work_order_uuid,
            status,
            transaction_date,
            total_amount,
            payment_account_uuid
          )
          VALUES ($1, $2, $3, 'posted', CURRENT_DATE, $4, $5)
          RETURNING id
        `,
    hasLoadIdColumn
      ? [wo.operating_company_id, wo.vendor_uuid, woUuid, wo.load_id, wo.total_amount, paymentAccountUuid ?? null]
      : [wo.operating_company_id, wo.vendor_uuid, woUuid, wo.total_amount, paymentAccountUuid ?? null]
  );
  const expenseId = String(expenseRes.rows[0]?.id ?? "");
  if (!expenseId) return null;
  if (await relationExists(client, "accounting.expense_lines")) {
    await copyToAccountingLines(client, woUuid, "accounting.expense_lines", "expense_id", expenseId);

    const hasLoadId = await columnExists(client, "accounting.expense_lines", "load_id");
    const hasLoadRequired = await columnExists(client, "accounting.expense_lines", "load_required");
    const hasExemption = await columnExists(client, "accounting.expense_lines", "load_exemption_reason");
    const hasLineCategory = await columnExists(client, "accounting.expense_lines", "line_category");
    if (hasLoadId || hasLoadRequired || hasExemption || hasLineCategory) {
      const updates: string[] = [];
      const values: unknown[] = [];
      if (hasLoadId) {
        values.push(wo.load_id ?? null);
        updates.push(`load_id = $${values.length}`);
      }
      if (hasLoadRequired) {
        values.push(Boolean(expenseCategoryRequiresLoad.rows[0]?.requires_load));
        updates.push(`load_required = $${values.length}`);
      }
      if (hasExemption) {
        values.push(exemptionReason.length >= 20 ? exemptionReason : null);
        updates.push(`load_exemption_reason = $${values.length}`);
      }
      if (hasLineCategory) {
        updates.push(`
          line_category = CASE
            WHEN upper(COALESCE(description, '')) LIKE '%DIESEL%' OR upper(COALESCE(description, '')) LIKE '%FUEL%' THEN 'diesel'
            WHEN upper(COALESCE(description, '')) LIKE '%TOLL%' THEN 'toll'
            WHEN upper(COALESCE(description, '')) LIKE '%SCALE%' THEN 'scale'
            WHEN upper(COALESCE(description, '')) LIKE '%LUMPER%' THEN 'lumper'
            WHEN upper(COALESCE(description, '')) LIKE '%PARKING%' THEN 'parking'
            WHEN upper(COALESCE(description, '')) LIKE '%ROADSIDE%' THEN 'roadside_repair'
            ELSE line_category
          END
        `);
      }
      values.push(expenseId);
      await client.query(
        `
          UPDATE accounting.expense_lines
          SET ${updates.join(",\n              ")}
          WHERE expense_id = $${values.length}
        `,
        values
      );
    }

    if (wo.load_id) {
      await appendCrudAudit(
        client as never,
        userId,
        "accounting.expense_line.load_linked",
        { work_order_id: woUuid, expense_id: expenseId, load_id: wo.load_id },
        "info",
        "P5-D5-LOAD-FK"
      );
    } else if (exemptionReason.length >= 20) {
      await appendCrudAudit(
        client as never,
        userId,
        "accounting.expense_line.load_exempted",
        { work_order_id: woUuid, expense_id: expenseId, load_exemption_reason: exemptionReason },
        "warning",
        "P5-D5-LOAD-FK"
      );
    }
  }
  await appendCrudAudit(
    client as never,
    userId,
    "accounting.expense.auto_created_from_wo",
    { work_order_id: woUuid, expense_id: expenseId },
    "info",
    "P3-T11.17-TWO-SECTION-V5"
  );
  return { uuid: expenseId };
}

export async function allocateInHouseFromWO(client: DbClient, userId: string, woUuid: string) {
  if (await relationExists(client, "maintenance.parts_inventory")) {
    await client.query(
      `
        UPDATE maintenance.parts_inventory p
        SET on_hand_qty = GREATEST(0, COALESCE(p.on_hand_qty, 0) - alloc.qty),
            updated_at = now()
        FROM (
          SELECT part_uuid, SUM(COALESCE(quantity, 0))::int AS qty
          FROM maintenance.work_order_lines
          WHERE work_order_id = $1
            AND line_type = 'parts'
            AND part_uuid IS NOT NULL
          GROUP BY part_uuid
        ) alloc
        WHERE p.id = alloc.part_uuid
      `,
      [woUuid]
    );
  }
  await appendCrudAudit(
    client as never,
    userId,
    "maintenance.wo.in_house_allocated",
    { work_order_id: woUuid },
    "info",
    "P3-T11.17-TWO-SECTION-V5"
  );
  return { ok: true };
}
