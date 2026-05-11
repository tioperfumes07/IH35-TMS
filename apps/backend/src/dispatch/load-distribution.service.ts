import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { generateDriverInstructionsPdf } from "./pdf-generator.service.js";

type DistributionInput = {
  operating_company_id: string;
  load_id: string;
  requested_by_user_id: string;
};

export async function distributeLoadInstructions(input: DistributionInput) {
  return withCurrentUser(input.requested_by_user_id, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);

    const loadRes = await client.query<{
      id: string;
      load_number: string;
      operating_company_id: string;
      customer_name: string | null;
      notes: string | null;
      commodity: string | null;
      assigned_primary_driver_id: string | null;
      driver_name: string | null;
      driver_phone: string | null;
    }>(
      `
        SELECT
          l.id,
          l.load_number,
          l.operating_company_id,
          c.customer_name,
          l.notes,
          NULL::text AS commodity,
          l.assigned_primary_driver_id::text,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          d.phone AS driver_phone
        FROM mdata.loads l
        LEFT JOIN mdata.customers c ON c.id = l.customer_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
        WHERE l.id = $1
          AND l.operating_company_id = $2
        LIMIT 1
      `,
      [input.load_id, input.operating_company_id]
    );
    const load = loadRes.rows[0];
    if (!load) {
      throw new Error("E_LOAD_NOT_FOUND");
    }

    const stopsRes = await client.query<{
      stop_type: string;
      sequence_number: number;
      address_line1: string | null;
      city: string | null;
      state: string | null;
      scheduled_arrival_at: string | null;
    }>(
      `
        SELECT stop_type::text, sequence_number, address_line1, city, state, scheduled_arrival_at::text
        FROM mdata.load_stops
        WHERE load_id = $1
        ORDER BY sequence_number ASC
      `,
      [input.load_id]
    );

    const pdf = await generateDriverInstructionsPdf({
      loadNumber: load.load_number,
      companyId: load.operating_company_id,
      generatedAt: new Date().toISOString(),
      driverName: load.driver_name ?? "Unassigned",
      customerName: load.customer_name ?? "Unknown Customer",
      commodity: load.commodity ?? "-",
      notes: load.notes ?? "-",
      stops: stopsRes.rows.map((stop) => ({
        stopType: stop.stop_type,
        sequence: stop.sequence_number,
        address: stop.address_line1 ?? "-",
        cityState: [stop.city ?? "", stop.state ?? ""].filter(Boolean).join(", "),
        eta: stop.scheduled_arrival_at ?? "-",
      })),
    });

    const docsFile = await client.query<{ id: string }>(
      `
        INSERT INTO docs.files (
          operating_company_id, original_filename, mime_type, size_bytes, r2_key,
          upload_completed_at, uploader_user_id, description, dispatch_load_id, dispatch_document_channel, dispatch_delivery_status, dispatch_generated_at
        )
        VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8, 'portal', 'sent', now())
        RETURNING id
      `,
      [
        input.operating_company_id,
        pdf.filename,
        pdf.mimeType,
        pdf.pdfBuffer.length,
        `org/${input.operating_company_id}/dispatch/${input.load_id}/${Date.now()}-${pdf.filename}`,
        input.requested_by_user_id,
        "Driver instructions packet",
        input.load_id,
      ]
    );
    const fileId = docsFile.rows[0].id;

    await client.query(
      `
        UPDATE mdata.loads
        SET driver_instructions_file_id = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [input.load_id, fileId]
    );

    const baseUrl = process.env.FRONTEND_BASE_URL?.replace(/\/$/, "") ?? "";
    const portalLink = baseUrl ? `${baseUrl}/dispatch?load_id=${input.load_id}` : `Load ${load.load_number}`;

    if (load.driver_phone) {
      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1, $2, $3, $4::jsonb),
                 ($1, $2, $5, $6::jsonb)
        `,
        [
          "dispatch.loads",
          input.load_id,
          "twilio.sms.send",
          JSON.stringify({
            to: load.driver_phone,
            body: `Load ${load.load_number} instructions are ready: ${portalLink}`,
          }),
          "twilio.whatsapp.send",
          JSON.stringify({
            to: load.driver_phone,
            body: `Load ${load.load_number} instructions are ready: ${portalLink}`,
          }),
        ]
      );
    }

    await appendCrudAudit(
      client,
      input.requested_by_user_id,
      "dispatch.driver_instructions.distributed",
      {
        resource_type: "mdata.loads",
        resource_id: input.load_id,
        operating_company_id: input.operating_company_id,
        file_id: fileId,
        channels: load.driver_phone ? ["portal", "sms", "whatsapp"] : ["portal"],
      },
      "info",
      "P6-D3"
    );

    return {
      load_id: input.load_id,
      driver_instructions_file_id: fileId,
      channels: load.driver_phone ? ["portal", "sms", "whatsapp"] : ["portal"],
    };
  });
}
