import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { generateLoadInstructionsPdf } from "./pdf-generator.service.js";
import { sendEmail } from "../notifications/email.service.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { generatePresignedDownloadUrl } from "../storage/r2-client.js";

type DistributionInput = {
  operating_company_id: string;
  load_id: string;
  requested_by_user_id: string;
};

export async function distributeLoadInstructions(input: DistributionInput) {
  return withCurrentUser(input.requested_by_user_id, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    const hasPwaNotifications = await client
      .query<{ exists: boolean }>(`SELECT to_regclass('pwa.driver_notifications') IS NOT NULL AS exists`)
      .then((res) => Boolean(res.rows[0]?.exists))
      .catch(() => false);

    const loadRes = await client.query<{
      id: string;
      load_number: string;
      operating_company_id: string;
      customer_name: string | null;
      customer_email: string | null;
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
          c.ar_email AS customer_email,
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

    const driverPdf = await generateLoadInstructionsPdf({
      loadNumber: load.load_number,
      companyId: load.operating_company_id,
      generatedAt: new Date().toISOString(),
      recipientRole: "driver",
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
    const customerPdf = await generateLoadInstructionsPdf({
      loadNumber: load.load_number,
      companyId: load.operating_company_id,
      generatedAt: new Date().toISOString(),
      recipientRole: "customer",
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

    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
    const r2Secret = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket = process.env.R2_BUCKET || "ih35-tms-evidence";
    const r2Enabled = Boolean(r2AccountId && r2AccessKey && r2Secret);
    const r2Client = r2Enabled
      ? new S3Client({
          region: "auto",
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: r2AccessKey as string,
            secretAccessKey: r2Secret as string,
          },
        })
      : null;

    const driverR2Key = `org/${input.operating_company_id}/dispatch/${input.load_id}/driver-${Date.now()}.pdf`;
    const customerR2Key = `org/${input.operating_company_id}/dispatch/${input.load_id}/customer-${Date.now()}.pdf`;
    if (r2Client) {
      await Promise.all([
        r2Client.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: driverR2Key,
            ContentType: driverPdf.mimeType,
            Body: driverPdf.pdfBuffer,
          })
        ),
        r2Client.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: customerR2Key,
            ContentType: customerPdf.mimeType,
            Body: customerPdf.pdfBuffer,
          })
        ),
      ]);
    }

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
        driverPdf.filename,
        driverPdf.mimeType,
        driverPdf.pdfBuffer.length,
        driverR2Key,
        input.requested_by_user_id,
        "Driver instructions packet",
        input.load_id,
      ]
    );
    const fileId = docsFile.rows[0].id;
    const customerFile = await client.query<{ id: string }>(
      `
        INSERT INTO docs.files (
          operating_company_id, original_filename, mime_type, size_bytes, r2_key,
          upload_completed_at, uploader_user_id, description, dispatch_load_id, dispatch_document_channel, dispatch_delivery_status, dispatch_generated_at
        )
        VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8, 'email', 'sent', now())
        RETURNING id
      `,
      [
        input.operating_company_id,
        customerPdf.filename,
        customerPdf.mimeType,
        customerPdf.pdfBuffer.length,
        customerR2Key,
        input.requested_by_user_id,
        "Customer dispatch copy",
        input.load_id,
      ]
    );
    const customerFileId = customerFile.rows[0].id;

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
    const presignedUrl = r2Enabled
      ? (await generatePresignedDownloadUrl(driverR2Key, 60 * 60 * 24 * 7)).url
      : portalLink;

    const channels: string[] = ["portal"];
    const distributionTasks: Array<Promise<unknown>> = [];

    if (hasPwaNotifications && load.assigned_primary_driver_id) {
      distributionTasks.push(
        client.query(
          `
            INSERT INTO pwa.driver_notifications (
              operating_company_id, driver_id, title, message, payload
            ) VALUES ($1,$2,$3,$4,$5::jsonb)
          `,
          [
            input.operating_company_id,
            load.assigned_primary_driver_id,
            `Load ${load.load_number} dispatched`,
            "Driver Instructions PDF is ready.",
            JSON.stringify({ load_id: input.load_id, pdf_url: presignedUrl }),
          ]
        )
      );
      channels.push("pwa");
    }

    if (load.driver_phone) {
      distributionTasks.push(
        client.query(
          `
            INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
            VALUES ($1,$2,$3,$4::jsonb)
          `,
          [
            "dispatch.loads",
            input.load_id,
            "twilio.whatsapp.send",
            JSON.stringify({
              to: load.driver_phone,
              template: "load_dispatched",
              variables: {
                load_display_id: load.load_number,
                pickup_location: stopsRes.rows[0]?.city ?? "pickup location",
                pickup_time: stopsRes.rows[0]?.scheduled_arrival_at ?? "scheduled time",
                pdf_url: presignedUrl,
              },
            }),
          ]
        )
      );
      channels.push("whatsapp");
    }

    distributionTasks.push(
      sendEmail({
        sender: "dispatch",
        to: process.env.DISPATCH_DRIVER_INSTRUCTIONS_FALLBACK_EMAIL ?? process.env.EMAIL_FROM_DISPATCH ?? process.env.EMAIL_FROM_NOREPLY ?? "dispatch@example.com",
        subject: `Load ${load.load_number} dispatched`,
        html: `<p>Load ${load.load_number} is dispatched.</p><p>Driver instructions PDF: <a href="${presignedUrl}">${presignedUrl}</a></p>`,
        text: `Load ${load.load_number} dispatched. Driver instructions: ${presignedUrl}`,
        eventClass: "dispatch.load.instructions_email_sent",
        actorUserId: input.requested_by_user_id,
      })
    );
    channels.push("email");

    if (load.customer_email) {
      distributionTasks.push(
        sendEmail({
          sender: "dispatch",
          to: load.customer_email,
          subject: `Customer copy - Load ${load.load_number}`,
          html: `<p>Customer dispatch copy for load ${load.load_number}.</p><p>Download PDF: <a href="${r2Enabled ? (await generatePresignedDownloadUrl(customerR2Key, 60 * 60 * 24 * 7)).url : portalLink}">Customer PDF</a></p>`,
          text: `Customer dispatch copy for load ${load.load_number}.`,
          eventClass: "dispatch.load.customer_copy_email_sent",
          actorUserId: input.requested_by_user_id,
        })
      );
    }

    await Promise.all(distributionTasks);

    await appendCrudAudit(
      client,
      input.requested_by_user_id,
      "dispatch.driver_instructions.distributed",
      {
        resource_type: "mdata.loads",
        resource_id: input.load_id,
        operating_company_id: input.operating_company_id,
        file_id: fileId,
        customer_file_id: customerFileId,
        channels,
        driver_pdf_sha256: driverPdf.sha256,
        customer_pdf_sha256: customerPdf.sha256,
        template_version: driverPdf.templateVersion,
      },
      "info",
      "P6-D3"
    );

    return {
      load_id: input.load_id,
      driver_instructions_file_id: fileId,
      customer_instructions_file_id: customerFileId,
      channels,
      pdf_url: presignedUrl,
    };
  });
}
