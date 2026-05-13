import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import {
  docIdFromLoadNumber,
  formatDateTime,
  formatMoney,
  joinBrandAddrLines,
  wrapPdfDocument,
} from "../render/pdf-template.js";
import { renderDispatchSheetBody, type DispatchPayRow, type DispatchSheetModel, type DispatchSheetStop } from "../render/dispatch-sheet.template.js";

const paramsSchema = z.object({ loadId: z.string().uuid() });

async function enqueueDispatchSheetOutbox(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  payload: Record<string, unknown>
) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "dispatch.dispatch_sheet.requested",
    JSON.stringify(payload),
  ]);
}

function officeDispatchRoles(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher"].includes(role);
}

function stopReference(stopType: string, sequenceNumber: number) {
  const prefix = stopType === "delivery" ? "DEL" : stopType === "pickup" ? "PU" : "ST";
  return `${prefix}-${String(sequenceNumber).padStart(6, "0")}`;
}

export async function registerDispatchSheetHtmlRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/loads/:loadId/dispatch-sheet.html", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const html = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const loadRes = await client.query(
        `
          SELECT
            l.*,
            c.customer_name,
            COALESCE(book.email, disp.email) AS dispatcher_email,
            d.first_name AS driver_first_name,
            d.last_name AS driver_last_name,
            d.cdl_state,
            d.cdl_expiration_date,
            d.identity_user_id AS primary_driver_identity_user_id,
            u.display_id AS truck_display_id,
            u.unit_type AS truck_unit_type,
            u.make AS truck_make,
            u.model AS truck_model,
            u.model_year AS truck_model_year
          FROM mdata.loads l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN identity.users disp ON disp.id = l.dispatcher_user_id
          LEFT JOIN identity.users book ON book.id = l.booked_by_user_id
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          WHERE l.id = $1
            AND l.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.loadId, query.data.operating_company_id]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return { kind: "not_found" as const };

      let secondaryIdentity: string | null = null;
      if (load.assigned_secondary_driver_id) {
        const secondaryDriverRes = await client.query(`SELECT identity_user_id FROM mdata.drivers WHERE id = $1 LIMIT 1`, [
          load.assigned_secondary_driver_id,
        ]);
        secondaryIdentity = (secondaryDriverRes.rows[0]?.identity_user_id as string | undefined | null) ?? null;
      }

      const allowedOffice = officeDispatchRoles(String(user.role ?? ""));
      const primaryIdentity = (load.primary_driver_identity_user_id as string | undefined | null) ?? null;
      const allowedDriver =
        Boolean(primaryIdentity && primaryIdentity === user.uuid) || Boolean(secondaryIdentity && secondaryIdentity === user.uuid);

      if (!allowedOffice && !allowedDriver) {
        return { kind: "forbidden" as const };
      }

      const companyRes = await client.query(
        `
          SELECT legal_name, short_name, tax_id, phone, email, address_line1, city, state, postal_code
          FROM org.companies
          WHERE id = $1
          LIMIT 1
        `,
        [query.data.operating_company_id]
      );
      const company = companyRes.rows[0] ?? {};

      const stopsRes = await client.query(
        `
          SELECT
            s.*,
            loc.name AS location_name
          FROM mdata.load_stops s
          LEFT JOIN mdata.locations loc ON loc.id = s.location_id
          WHERE s.load_id = $1
          ORDER BY s.sequence_number ASC
        `,
        [params.data.loadId]
      );

      const pickups = stopsRes.rows.filter((row: Record<string, unknown>) => String(row.stop_type) === "pickup").length;
      const deliveries = stopsRes.rows.filter((row: Record<string, unknown>) => String(row.stop_type) === "delivery").length;

      const stops: DispatchSheetStop[] = stopsRes.rows.map((row: Record<string, unknown>) => {
        const stopType = String(row.stop_type ?? "stop");
        const seq = Number(row.sequence_number ?? 0);
        const facility = String(row.location_name ?? row.address_line1 ?? "Facility TBD");
        const addr =
          [row.address_line1, row.city, row.state].filter(Boolean).join(", ") ||
          [row.city, row.state].filter(Boolean).join(", ") ||
          "Address on file";
        const scheduled = row.scheduled_arrival_at ? formatDateTime(String(row.scheduled_arrival_at)) : "—";
        const seqLabel = `${stopType === "delivery" ? "Delivery" : stopType === "pickup" ? "Pickup" : "Stop"} · ${seq}`;
        const lumperCents = Number(load.lumper_amount_cents ?? 0);
        return {
          seqLabel,
          reference: stopReference(stopType, seq),
          appointmentLabel: scheduled,
          facility,
          addressLine: addr,
          windowPrimary: "Appointment / window",
          windowSecondary: row.notes ? String(row.notes) : "Confirm on arrival",
          contactPrimary: "Site contact",
          contactSecondary: "—",
          gatePrimary: "—",
          gateSecondary: "—",
          reeferSetpoint: "—",
          lumper: lumperCents !== 0 ? formatMoney(lumperCents) : "—",
        };
      });

      const dispatcherLabel = String(load.dispatcher_email ?? user.email ?? "dispatcher").split("@")[0] ?? "dispatcher";

      const driverName =
        `${String(load.driver_first_name ?? "").trim()} ${String(load.driver_last_name ?? "").trim()}`.trim() || "Assigned driver";
      const cdlState = load.cdl_state ? String(load.cdl_state) : "—";
      const cdlExp = load.cdl_expiration_date ? String(load.cdl_expiration_date) : "—";

      const truckUnit = load.truck_display_id ? String(load.truck_display_id) : "—";
      const truckMetaParts = [load.truck_model_year, load.truck_make, load.truck_model].filter(Boolean).map(String);
      const truckSub = truckMetaParts.length
        ? `${truckMetaParts.join(" ")}${load.truck_unit_type ? ` · ${String(load.truck_unit_type)}` : ""}`
        : "—";

      const payRows: DispatchPayRow[] = [
        {
          component: "Estimated trip pay",
          basis: "Booking total",
          rate: "—",
          amountCents: Number(load.rate_total_cents ?? 0),
        },
        { component: "Fuel advance (if issued)", basis: "EFS / Comcheck", rate: "—", amountCents: 0 },
        { component: "Cash advance", basis: "—", rate: "—", amountCents: 0 },
      ];

      const grossCents = Number(load.rate_total_cents ?? 0);

      const commodity = String(load.commodity_description ?? load.commodity ?? "Freight");
      const weight = load.weight_lbs != null ? `${Number(load.weight_lbs).toLocaleString("en-US")} lbs` : "—";
      const pieces = load.pallet_count != null ? `${Number(load.pallet_count)} pallets` : "—";

      const instructions = String(
        load.driver_instructions_text ?? load.notes ?? "Follow safe loading/unloading procedures. Contact dispatch with any issues."
      );

      const docNum = String(load.load_number ?? params.data.loadId);
      const billId = docIdFromLoadNumber("B", String(load.load_number ?? "")) ?? "—";

      const brandName = String(company.legal_name ?? company.short_name ?? "Carrier");
      const brandSubPieces = [company.tax_id ? `EIN ${String(company.tax_id)}` : null].filter(Boolean);
      const brandSub = brandSubPieces.join(" · ") || "Motor carrier";
      const brandAddrLines = [
        [company.address_line1, company.city, company.state, company.postal_code].filter(Boolean).join(", "),
        [company.phone ? String(company.phone) : null, company.email ? String(company.email) : null].filter(Boolean).join(" · "),
      ];

      const issuedNow = formatDateTime(new Date());

      const model: DispatchSheetModel = {
        brandName,
        brandSub,
        brandAddrHtml: joinBrandAddrLines(brandAddrLines),
        docType: "Driver dispatch sheet",
        loadDocNum: docNum,
        issuedLines: [`Issued ${issuedNow}`, `by dispatcher ${dispatcherLabel}`],
        statusLine: `Dispatch · ${String(load.status ?? "").replaceAll("_", " ")}`,
        driverName,
        driverCdlLine: `${cdlState} · exp ${cdlExp}`,
        hosDriveLine: "—",
        hosDutyLine: "Confirm available hours in driver app",
        truckUnit,
        truckSub,
        trailerUnit: "—",
        trailerSub: "Assign trailer in TMS if applicable",
        stopsSummaryRight: `${stops.length} stops · ${pickups} pickup · ${deliveries} delivery`,
        stops,
        commodityRight: load.customer_wo_number
          ? `Customer WO# ${String(load.customer_wo_number)}`
          : load.live_load_number
            ? `Live # ${String(load.live_load_number)}`
            : "Customer reference on file",
        commodityDescription: commodity,
        commodityWeight: weight,
        commodityPieces: pieces,
        equipmentPrimary: load.requires_tarps ? `Tarped (${String(load.tarp_type ?? "tarps")})` : "Dry / standard",
        equipmentSecondary: load.hazmat ? "Hazmat — verify placards" : "Non-hazmat",
        autoBillId: billId,
        payRows,
        grossFootnote: "Estimated driver bill — final pay determined at settlement",
        grossFootnoteCents: grossCents,
        instructionsRight: "Visible to driver · mark read on receipt",
        instructionsFrom: `From dispatcher ${dispatcherLabel}`,
        instructionsBody: instructions,
        sigDriverName: driverName,
        dispatcherSigLine: `${dispatcherLabel} · dispatch`,
        dispatcherIssuedNote: `Issued ${issuedNow}`,
        footerMobile:
          "Driver app shows load details automatically when dispatched. Contact dispatch if instructions conflict with site rules.",
        footerAfterHours: `Dispatch email ${String(company.email ?? "dispatch@carrier.local")} · confirm after-hours policy with your dispatcher.`,
      };

      await appendCrudAudit(
        client,
        user.uuid,
        "dispatch.dispatch_sheet.viewed",
        {
          operating_company_id: query.data.operating_company_id,
          load_id: params.data.loadId,
          load_number: load.load_number ?? null,
        },
        "info",
        "P6-T11171-PDF-RENDER"
      );

      await enqueueDispatchSheetOutbox(client, {
        operating_company_id: query.data.operating_company_id,
        load_id: params.data.loadId,
        load_number: load.load_number ?? null,
        requested_by_user_id: user.uuid,
      });

      const body = renderDispatchSheetBody(model);
      return { kind: "ok" as const, body, title: `${docNum} · Dispatch sheet` };
    });

    if (!html || html.kind === "not_found") return reply.code(404).send({ error: "dispatch_load_not_found" });
    if (html.kind === "forbidden") return reply.code(403).send({ error: "forbidden" });

    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(wrapPdfDocument({ title: html.title, body: html.body }));
  });
}
