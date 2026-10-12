import type { DbClient } from "./db-client.type.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { autoCreateBillFromWO, createWorkOrderWithLines, type SectionALine, type TwoSectionHeader } from "../two-section-service.js";
import { resolveFillDriverAtTime, resolveFuelLoadAtTime } from "../../fuel/fuel-load-at-time.js";

const SERVICE_LABELS: Record<string, string> = {
  tire_change: "Road service — tire change",
  jump_start: "Road service — jump start",
  fuel_delivery: "Road service — fuel delivery",
  lockout: "Road service — lockout",
  tow: "Road service — tow",
  other: "Road service — other",
};

/**
 * LEAD 443.129 (Codex AJK-02 / AJK-06 / AJK-07) — a roadside ticket refused for a named reason. Nothing is written
 * before a refusal: every check below runs before the work order, the document or the ticket stamp.
 */
export class RoadServiceTicketRefused extends Error {
  constructor(public readonly code: string, message: string, public readonly httpStatus = 422) {
    super(message);
    this.name = "RoadServiceTicketRefused";
  }
}

/**
 * AJK-02 — ONE decision for what a roadside ticket's money becomes, by how it was paid:
 *   cc             -> an EXPENSE on that card / bank account (shared expense writer, posted in the same transaction);
 *   driver_advance -> an EXPENSE paid out of the driver's advance account (the money the driver was advanced paid it);
 *   vendor_bill    -> an A/P BILL through the bill poster (the only unpaid path).
 * Never an unpaid vendor bill for something already paid. An unknown method is refused by name.
 */
export type RoadServicePaymentRoute = "card_expense" | "driver_advance_expense" | "vendor_bill";
export function roadServicePaymentRoute(paymentMethod: string): RoadServicePaymentRoute {
  if (paymentMethod === "cc") return "card_expense";
  if (paymentMethod === "driver_advance") return "driver_advance_expense";
  if (paymentMethod === "vendor_bill") return "vendor_bill";
  throw new RoadServiceTicketRefused(
    "road_service_payment_method_unknown",
    `payment method "${paymentMethod}" is not a roadside payment method (cc, driver_advance, vendor_bill)`
  );
}

/**
 * AJK-07 — the ticket NAMES its item; the item's category (work-order line) and default expense account (document line)
 * are used. No category is ever guessed: no item, an item of another company, a deactivated item, or an item without a
 * category / expense account is refused by name.
 */
export async function resolveRoadServiceItem(client: DbClient, operatingCompanyId: string, itemId: string | null) {
  if (!itemId) {
    throw new RoadServiceTicketRefused("road_service_item_required", "choose the item this roadside cost is booked to");
  }
  const res = await client.query<{ id: string; item_name: string; category_id: string | null; expense_account_id: string | null }>(
    `SELECT i.id::text, i.item_name, i.category_id::text, i.default_expense_account_id::text AS expense_account_id
       FROM catalogs.items i
      WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid AND i.deactivated_at IS NULL
      LIMIT 1`,
    [itemId, operatingCompanyId]
  );
  const item = res.rows[0];
  if (!item) throw new RoadServiceTicketRefused("road_service_item_not_in_company", "the item is not an active item of this company");
  if (!item.category_id) {
    throw new RoadServiceTicketRefused("road_service_item_has_no_category", `item "${item.item_name}" has no category — set it on the item`);
  }
  if (!item.expense_account_id) {
    throw new RoadServiceTicketRefused("road_service_item_has_no_expense_account", `item "${item.item_name}" has no expense account — set it on the item`);
  }
  return { item_id: item.id, item_name: item.item_name, category_id: item.category_id, expense_account_id: item.expense_account_id };
}

/**
 * AJK-06 — the hub links of the moment the truck broke down: the load the truck was running at the event time (the ONE
 * load-at-time rule, fuel/fuel-load-at-time.ts), that load's trailer (company trailer or customer trailer, never both),
 * the driver (named on the ticket, else the one-driver rule at the event time), or the explicit no-load reason.
 */
export async function resolveRoadServiceLinkage(
  client: DbClient,
  input: { operatingCompanyId: string; unitId: string; unitNumber: string | null; driverId: string | null; at: string }
) {
  const load = await resolveFuelLoadAtTime(client, {
    operatingCompanyId: input.operatingCompanyId,
    unitId: input.unitId,
    driverId: input.driverId,
    at: input.at,
  });
  let driverId = input.driverId;
  if (!driverId) {
    const resolved = await resolveFillDriverAtTime(client, {
      operatingCompanyId: input.operatingCompanyId,
      matchedDriverId: null,
      unitId: input.unitId,
      at: input.at,
      loadId: load?.load_id ?? null,
    });
    driverId = resolved?.driver_id ?? null;
  }
  return {
    load_id: load?.load_id ?? null,
    load_number: load?.load_number ?? null,
    trailer_id: load?.trailer_id ?? null,
    non_owned_trailer_id: load?.trailer_id ? null : load?.non_owned_trailer_id ?? null,
    driver_id: driverId,
    load_exemption_reason: load?.load_id
      ? null
      : `roadside_no_load: no load covered ${input.unitNumber ? `unit ${input.unitNumber}` : "the unit"} at the event time ${input.at} (LEAD 443.129 B)`,
  };
}

/**
 * AJK-02 — the account a paid ticket's expense credits. A card-paid ticket names the card / bank account it was paid
 * with (a credit-card account, or an account behind a bank account of this company); an advance-paid ticket is paid
 * out of the driver's advance account. Anything else is refused by name.
 */
async function resolveRoadServicePaymentAccount(
  client: DbClient,
  route: RoadServicePaymentRoute,
  input: { operatingCompanyId: string; paymentAccountUuid: string | null; driverId: string | null }
): Promise<string | null> {
  if (route === "vendor_bill") return null;
  if (route === "card_expense") {
    if (!input.paymentAccountUuid) {
      throw new RoadServiceTicketRefused("road_service_card_account_required", "choose the card or bank account this roadside ticket was paid with");
    }
    const res = await client.query<{ ok: boolean }>(
      `SELECT (a.account_subtype = 'CreditCard'
               OR EXISTS (SELECT 1 FROM banking.bank_accounts b
                           WHERE b.ledger_account_id = a.id AND b.operating_company_id = a.operating_company_id
                             AND b.deactivated_at IS NULL)) AS ok
         FROM catalogs.accounts a
        WHERE a.id = $1::uuid AND a.operating_company_id = $2::uuid AND a.deactivated_at IS NULL`,
      [input.paymentAccountUuid, input.operatingCompanyId]
    );
    if (!res.rows[0]) throw new RoadServiceTicketRefused("road_service_card_account_not_in_company", "the payment account is not an active account of this company");
    if (!res.rows[0].ok) {
      throw new RoadServiceTicketRefused("road_service_payment_account_not_a_card", "the payment account is not a credit card or bank account");
    }
    return input.paymentAccountUuid;
  }
  if (!input.driverId) {
    throw new RoadServiceTicketRefused("road_service_advance_needs_driver", "an advance-paid roadside ticket needs its driver");
  }
  const adv = await client.query<{ coa_account_id: string }>(
    `SELECT v.coa_account_id::text FROM driver_finance.driver_advance_accounts v
      WHERE v.operating_company_id = $1::uuid AND v.driver_id = $2::uuid AND v.coa_account_id IS NOT NULL
      LIMIT 2`,
    [input.operatingCompanyId, input.driverId]
  );
  if (adv.rows.length !== 1) {
    throw new RoadServiceTicketRefused(
      "road_service_driver_advance_account_missing",
      "the driver has no single advance account — the advance-paid ticket cannot be booked against it"
    );
  }
  return adv.rows[0]!.coa_account_id;
}

/**
 * THE shared expense writer (accounting/expenses.routes.ts createExpenseInClientTx), handed in by the HTTP route: this
 * engine is a plain module and may not import a route module (verify-no-service-imports-an-http-route-module).
 */
export type SharedExpenseWriter = (client: DbClient, body: Record<string, unknown>, userId: string) => Promise<unknown>;

export async function createWorkOrderFromRoadServiceTicket(
  client: DbClient,
  userId: string,
  input: {
    operatingCompanyId: string;
    ticketId: string;
    itemId?: string | null;
    paymentAccountUuid?: string | null;
    writeExpense: SharedExpenseWriter;
  }
) {
  const ticketRes = await client.query<{
    id: string;
    ticket_number: string;
    vendor_name: string;
    vendor_id: string | null;
    unit_id: string;
    unit_number: string | null;
    driver_id: string | null;
    service_type: string;
    work_performed: string | null;
    parts_used: string | null;
    total_cost_cents: number | string;
    location_address: string | null;
    wo_id: string | null;
    bill_id: string | null;
    expense_id: string | null;
    call_time: string | null;
    on_scene_time: string | null;
    event_at: string;
    payment_method: string;
    item_id: string | null;
    payment_account_uuid: string | null;
  }>(
    `
      SELECT
        t.id::text,
        t.ticket_number,
        t.vendor_name,
        t.vendor_id::text,
        t.unit_id::text,
        u.unit_number::text AS unit_number,
        t.driver_id::text,
        t.service_type,
        t.work_performed,
        t.parts_used,
        t.total_cost_cents,
        t.location_address,
        t.wo_id::text,
        t.bill_id::text,
        t.expense_id::text,
        t.call_time::text,
        t.on_scene_time::text,
        COALESCE(t.on_scene_time, t.call_time, t.created_at)::text AS event_at,
        t.payment_method,
        t.item_id::text,
        t.payment_account_uuid::text
      FROM maintenance.road_service_tickets t
      LEFT JOIN mdata.units u ON u.id = t.unit_id
                              AND (u.owner_company_id = t.operating_company_id OR u.currently_leased_to_company_id = t.operating_company_id)
      WHERE t.id = $1::uuid
        AND t.operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE OF t
    `,
    [input.ticketId, input.operatingCompanyId]
  );
  const ticket = ticketRes.rows[0];
  if (!ticket) throw new RoadServiceTicketRefused("ticket_not_found", "road service ticket not found", 404);
  if (ticket.wo_id) {
    return { wo_id: ticket.wo_id, bill_id: ticket.bill_id, expense_id: ticket.expense_id, already_linked: true as const };
  }

  // Every refusal runs BEFORE any write (AJK-02 / 06 / 07): route, item, linkage, payment account.
  const route = roadServicePaymentRoute(ticket.payment_method);
  const item = await resolveRoadServiceItem(client, input.operatingCompanyId, input.itemId ?? ticket.item_id);
  const linkage = await resolveRoadServiceLinkage(client, {
    operatingCompanyId: input.operatingCompanyId,
    unitId: ticket.unit_id,
    unitNumber: ticket.unit_number,
    driverId: ticket.driver_id,
    at: ticket.event_at,
  });
  const paymentAccountUuid = await resolveRoadServicePaymentAccount(client, route, {
    operatingCompanyId: input.operatingCompanyId,
    paymentAccountUuid: input.paymentAccountUuid ?? ticket.payment_account_uuid,
    driverId: linkage.driver_id,
  });

  const totalCents = Math.max(0, Math.round(Number(ticket.total_cost_cents) || 0));
  const totalAmount = totalCents / 100;
  const serviceLabel = SERVICE_LABELS[ticket.service_type] ?? SERVICE_LABELS.other;
  const description = [serviceLabel, ticket.work_performed, ticket.parts_used].filter(Boolean).join(" — ");

  const header: TwoSectionHeader = {
    operating_company_id: input.operatingCompanyId,
    wo_type: "repair",
    source_type: "RS",
    // Created OPEN: the shared creator finalizes the V5 display id (REG-048), which refuses a work order that is
    // already complete (E_WO_DISPLAY_ID_LOCKED) — the roadside path created it complete and always failed there.
    // It is closed below, once its document exists.
    status: "open",
    unit_id: ticket.unit_id,
    driver_id: linkage.driver_id,
    load_id: linkage.load_id,
    load_exemption_reason: linkage.load_exemption_reason,
    repair_location: "roadside",
    bucket: "roadside",
    vendor_id: ticket.vendor_id,
    external_vendor_id: ticket.vendor_id,
    external_vendor_invoice_number: ticket.ticket_number,
    description: description || serviceLabel,
    payment_timing: route === "vendor_bill" ? "vendor_invoice" : "paid_same_day",
    payment_account_uuid: paymentAccountUuid,
    bill_terms: route === "vendor_bill" ? "Net 30" : null,
    roadside_callout_at: ticket.call_time,
    roadside_arrived_at: ticket.on_scene_time,
    roadside_location: ticket.location_address,
    roadside_breakdown_load_id: linkage.load_id,
  };

  const sectionA: SectionALine[] = [
    {
      description: serviceLabel,
      quantity: 1,
      amount: totalAmount,
      expense_category_uuid: item.category_id,
    },
  ];

  const { woUuid } = await createWorkOrderWithLines(client, userId, header, sectionA, []);

  let billId: string | null = null;
  let expenseId: string | null = null;
  if (route === "vendor_bill") {
    const bill = await autoCreateBillFromWO(client, userId, String(woUuid), {
      billNumber: ticket.ticket_number,
      memo: `Road service ticket ${ticket.ticket_number} — ${ticket.vendor_name}`,
    });
    billId = bill?.uuid ? String(bill.uuid) : null;
    if (billId) {
      // The vendor bill carries the trailer of the load the truck was running (AJK-06); load + unit come from the WO.
      await client.query(
        `UPDATE accounting.bills
            SET trailer_id = COALESCE(trailer_id, $3::uuid),
                non_owned_trailer_id = CASE WHEN trailer_id IS NULL AND $3::uuid IS NULL THEN COALESCE(non_owned_trailer_id, $4::uuid) ELSE non_owned_trailer_id END,
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [billId, input.operatingCompanyId, linkage.trailer_id, linkage.non_owned_trailer_id]
      );
    }
  } else {
    // AJK-02 — the ticket was already paid (card, or the driver's advance): ONE posted expense through the shared
    // writer, credited to the account that paid it. No bill.
    const created = await input.writeExpense(
      client,
      {
        operating_company_id: input.operatingCompanyId,
        expense_date: ticket.event_at.slice(0, 10),
        amount_cents: totalCents,
        vendor_uuid: ticket.vendor_id ?? undefined,
        driver_id: linkage.driver_id ?? undefined,
        memo: `Road service ticket ${ticket.ticket_number} — ${ticket.vendor_name} (${route === "card_expense" ? "paid by card" : "paid from driver advance"})`,
        category_account_id: item.expense_account_id,
        item_id: item.item_id,
        quantity: 1,
        rate_cents: totalCents,
        payment_account_uuid: paymentAccountUuid ?? undefined,
        work_order_id: String(woUuid),
        unit_id: ticket.unit_id,
        trailer_id: linkage.trailer_id,
        load_id: linkage.load_id,
        load_exemption_reason: linkage.load_exemption_reason,
        vendor_document_number: ticket.ticket_number,
      },
      userId
    );
    const result = created as Record<string, unknown>;
    if (!result.expense_id) {
      const why = Object.keys(result).find((k) => result[k] === true) ?? "expense_not_created";
      throw new RoadServiceTicketRefused(`road_service_expense_refused_${why}`, `the roadside expense was refused (${why})`);
    }
    expenseId = String(result.expense_id);
  }

  // The roadside work is done: the work order closes with its document (opened above only to finalize its V5 id).
  // Completion law (maintenance.enforce_wo_completion_invariants): an outside-vendor (RS) work order closes with the
  // vendor's references — the roadside ticket IS the vendor's work-order / invoice reference — and its invoice amount
  // must equal the work order's cost.
  await client.query(
    `UPDATE maintenance.work_orders
        SET external_vendor_wo_number = COALESCE(NULLIF(trim(external_vendor_wo_number), ''), $3),
            external_vendor_invoice_number = COALESCE(NULLIF(trim(external_vendor_invoice_number), ''), $3),
            external_vendor_invoice_amount = COALESCE(external_vendor_invoice_amount, $4::numeric),
            status = 'complete',
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [woUuid, input.operatingCompanyId, ticket.ticket_number, totalAmount]
  );

  // MAINT-MONEY-F6803A: the ticket row is FOR-UPDATE-locked above; this CAS + checked rowCount is defense in depth
  // against a bypassed lock (a duplicate WO / orphan document would otherwise win silently).
  const backlink = await client.query(
    `
      UPDATE maintenance.road_service_tickets
      SET wo_id = $3::uuid,
          bill_id = $4::uuid,
          expense_id = $5::uuid,
          item_id = $6::uuid,
          payment_account_uuid = $7::uuid,
          driver_id = COALESCE(driver_id, $8::uuid),
          load_id = $9::uuid,
          trailer_id = $10::uuid,
          non_owned_trailer_id = $11::uuid,
          load_exemption_reason = $12,
          status = $13,
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND wo_id IS NULL
    `,
    [
      input.ticketId,
      input.operatingCompanyId,
      woUuid,
      billId,
      expenseId,
      item.item_id,
      paymentAccountUuid && route === "card_expense" ? paymentAccountUuid : null,
      linkage.driver_id,
      linkage.load_id,
      linkage.trailer_id,
      linkage.non_owned_trailer_id,
      linkage.load_exemption_reason,
      route === "vendor_bill" ? "invoiced" : "paid",
    ]
  );
  if ((backlink.rowCount ?? 0) !== 1) {
    throw new Error("road_service_ticket_wo_backlink_race");
  }

  await appendCrudAudit(
    client,
    userId,
    "maintenance.road_service_ticket.wo_created",
    {
      operating_company_id: input.operatingCompanyId,
      resource_type: "maintenance.road_service_tickets",
      resource_id: input.ticketId,
      wo_id: String(woUuid),
      bill_id: billId,
      expense_id: expenseId,
      payment_route: route,
      load_id: linkage.load_id,
      trailer_id: linkage.trailer_id,
      non_owned_trailer_id: linkage.non_owned_trailer_id,
      driver_id: linkage.driver_id,
      item_id: item.item_id,
    },
    "info",
    "P5-T17-ROAD-SERVICE"
  );

  return { wo_id: String(woUuid), bill_id: billId, expense_id: expenseId, already_linked: false as const };
}
