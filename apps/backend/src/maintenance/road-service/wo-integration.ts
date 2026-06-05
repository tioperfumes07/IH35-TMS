import type { DbClient } from "./tickets.routes.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { autoCreateBillFromWO, createWorkOrderWithLines, type SectionALine, type TwoSectionHeader } from "../two-section-service.js";

const SERVICE_LABELS: Record<string, string> = {
  tire_change: "Road service — tire change",
  jump_start: "Road service — jump start",
  fuel_delivery: "Road service — fuel delivery",
  lockout: "Road service — lockout",
  tow: "Road service — tow",
  other: "Road service — other",
};

async function resolveExpenseCategoryUuid(client: DbClient, operatingCompanyId: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.qbo_categories
      WHERE operating_company_id = $1::uuid
        AND (
          lower(coalesce(code, '')) LIKE '%road%'
          OR lower(coalesce(display_name, '')) LIKE '%road%'
          OR lower(coalesce(display_name, '')) LIKE '%repair%'
        )
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  if (res.rows[0]?.id) return res.rows[0].id;
  const fallback = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.qbo_categories WHERE operating_company_id = $1::uuid ORDER BY created_at ASC LIMIT 1`,
    [operatingCompanyId]
  );
  return fallback.rows[0]?.id ?? null;
}

export async function createWorkOrderFromRoadServiceTicket(
  client: DbClient,
  userId: string,
  input: { operatingCompanyId: string; ticketId: string }
) {
  const ticketRes = await client.query<{
    id: string;
    ticket_number: string;
    vendor_name: string;
    vendor_id: string | null;
    unit_id: string;
    driver_id: string | null;
    service_type: string;
    work_performed: string | null;
    parts_used: string | null;
    total_cost_cents: number | string;
    location_address: string | null;
    wo_id: string | null;
    bill_id: string | null;
    call_time: string | null;
    on_scene_time: string | null;
  }>(
    `
      SELECT
        id::text,
        ticket_number,
        vendor_name,
        vendor_id::text,
        unit_id::text,
        driver_id::text,
        service_type,
        work_performed,
        parts_used,
        total_cost_cents,
        location_address,
        wo_id::text,
        bill_id::text,
        call_time::text,
        on_scene_time::text
      FROM maintenance.road_service_tickets
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.ticketId, input.operatingCompanyId]
  );
  const ticket = ticketRes.rows[0];
  if (!ticket) throw new Error("ticket_not_found");
  if (ticket.wo_id) {
    return { wo_id: ticket.wo_id, bill_id: ticket.bill_id, already_linked: true as const };
  }

  const expenseCategoryUuid = await resolveExpenseCategoryUuid(client, input.operatingCompanyId);
  if (!expenseCategoryUuid) throw new Error("expense_category_not_found");

  const totalCents = Math.max(0, Math.round(Number(ticket.total_cost_cents) || 0));
  const totalAmount = totalCents / 100;
  const serviceLabel = SERVICE_LABELS[ticket.service_type] ?? SERVICE_LABELS.other;
  const description = [serviceLabel, ticket.work_performed, ticket.parts_used].filter(Boolean).join(" — ");

  const header: TwoSectionHeader = {
    operating_company_id: input.operatingCompanyId,
    wo_type: "repair",
    source_type: "ES",
    status: "complete",
    unit_id: ticket.unit_id,
    driver_id: ticket.driver_id,
    repair_location: "roadside",
    bucket: "roadside",
    vendor_id: ticket.vendor_id,
    external_vendor_id: ticket.vendor_id,
    external_vendor_invoice_number: ticket.ticket_number,
    description: description || serviceLabel,
    payment_timing: "vendor_invoice",
    bill_terms: "Net 30",
    roadside_callout_at: ticket.call_time,
    roadside_arrived_at: ticket.on_scene_time,
    roadside_location: ticket.location_address,
  };

  const sectionA: SectionALine[] = [
    {
      description: serviceLabel,
      quantity: 1,
      amount: totalAmount,
      expense_category_uuid: expenseCategoryUuid,
    },
  ];

  const { woUuid } = await createWorkOrderWithLines(client, userId, header, sectionA, []);
  const bill = await autoCreateBillFromWO(client, userId, String(woUuid), {
    billNumber: ticket.ticket_number,
    memo: `Road service ticket ${ticket.ticket_number} — ${ticket.vendor_name}`,
  });

  await client.query(
    `
      UPDATE maintenance.road_service_tickets
      SET wo_id = $3::uuid,
          bill_id = $4::uuid,
          status = 'invoiced',
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [input.ticketId, input.operatingCompanyId, woUuid, bill?.uuid ?? null]
  );

  await appendCrudAudit(
    client,
    userId,
    "maintenance.road_service_ticket.wo_created",
    {
      resource_type: "maintenance.road_service_tickets",
      resource_id: input.ticketId,
      wo_id: String(woUuid),
      bill_id: bill?.uuid ? String(bill.uuid) : null,
    },
    "info",
    "P5-T17-ROAD-SERVICE"
  );

  return { wo_id: String(woUuid), bill_id: bill?.uuid ? String(bill.uuid) : null, already_linked: false as const };
}
