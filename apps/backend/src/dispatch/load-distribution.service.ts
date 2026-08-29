import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { generateLoadInstructionsPdf } from "./pdf-generator.service.js";
import { sendEmail } from "../notifications/email.service.js";
import { deleteObjectBytes, generatePresignedDownloadUrl, isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { isWhatsappChannelConfigured } from "../outbox/handlers/twilio-channel-config.js";
import { insertDriverPwaNotification } from "../pwa/driver-notifications.js";
import { enqueueAfterCommit } from "../lib/after-commit.js";

type DistributionInput = {
  operating_company_id: string;
  load_id: string;
  requested_by_user_id: string;
};

export async function distributeLoadInstructions(input: DistributionInput) {
  return withCurrentUser(input.requested_by_user_id, async (client) => {
    await setScopedCompanyContext(client, input.requested_by_user_id, input.operating_company_id);

    const loadRes = await client.query<{
      id: string;
      load_number: string;
      operating_company_id: string;
      customer_id: string | null;
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
          l.customer_id::text,
          c.customer_name,
          c.ar_email AS customer_email,
          l.notes,
          NULL::text AS commodity,
          l.assigned_primary_driver_id::text,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          d.phone AS driver_phone
        FROM mdata.loads l
        LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                   AND c.operating_company_id = l.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                 AND (
                                   d.operating_company_id = l.operating_company_id
                                   OR EXISTS (
                                     SELECT 1
                                     FROM mdata.driver_company_authorizations load_distribution_driver_dca
                                     WHERE load_distribution_driver_dca.driver_id = d.id
                                       AND load_distribution_driver_dca.company_id = l.operating_company_id
                                       AND load_distribution_driver_dca.is_authorized = true
                                       AND load_distribution_driver_dca.deactivated_at IS NULL
                                   )
                                 )
        WHERE l.id = $1
          AND l.operating_company_id = $2::uuid
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

    if (!isR2Configured()) throw new Error("r2_not_configured");
    const driverR2Key = `org/${input.operating_company_id}/dispatch/${input.load_id}/driver-${Date.now()}.pdf`;
    const customerR2Key = `org/${input.operating_company_id}/dispatch/${input.load_id}/customer-${Date.now()}.pdf`;
    const uploadedR2Keys: string[] = [];
    try {
      await putObjectBytes(driverR2Key, driverPdf.pdfBuffer, driverPdf.mimeType);
      uploadedR2Keys.push(driverR2Key);
      await putObjectBytes(customerR2Key, customerPdf.pdfBuffer, customerPdf.mimeType);
      uploadedR2Keys.push(customerR2Key);

    const docsFile = await client.query<{ id: string }>(
      `
        INSERT INTO docs.files (
          operating_company_id, original_filename, mime_type, size_bytes, r2_key,
          upload_completed_at, uploader_user_id, description, category_id,
          dispatch_load_id, dispatch_document_channel, dispatch_delivery_status, dispatch_generated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, now(), $6, $7,
          (SELECT id FROM catalogs.file_categories WHERE code = 'dispatch_instructions' AND is_active = true LIMIT 1),
          $8, 'portal', 'sent', now()
        )
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
    const fileId = docsFile.rows[0]?.id;
    if (!fileId) throw new Error("driver_instructions_document_create_failed");
    const customerFile = await client.query<{ id: string }>(
      `
        INSERT INTO docs.files (
          operating_company_id, original_filename, mime_type, size_bytes, r2_key,
          upload_completed_at, uploader_user_id, description, category_id,
          dispatch_load_id, dispatch_document_channel, dispatch_delivery_status, dispatch_generated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, now(), $6, $7,
          (SELECT id FROM catalogs.file_categories WHERE code = 'dispatch_instructions' AND is_active = true LIMIT 1),
          $8, 'email', 'sent', now()
        )
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
    const customerFileId = customerFile.rows[0]?.id;
    if (!customerFileId) throw new Error("customer_instructions_document_create_failed");

    // DOCS-ECON-01 / DOCS-LINK-01: generated dispatch packets are operational documents, not
    // generic uploads. Persist the forward links at creation time so Docs, Load, Driver, and
    // Customer reverse surfaces all resolve the same files without filename inference.
    const fileLinks: Array<[string, string, string]> = [
      [fileId, "load", load.id],
      [customerFileId, "load", load.id],
    ];
    if (load.assigned_primary_driver_id) fileLinks.push([fileId, "driver", load.assigned_primary_driver_id]);
    if (load.customer_id) fileLinks.push([customerFileId, "customer", load.customer_id]);
    for (const [linkedFileId, entityType, entityId] of fileLinks) {
      await client.query(
        `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (file_id, entity_type, entity_id) WHERE deleted_at IS NULL DO NOTHING`,
        [linkedFileId, entityType, entityId, input.requested_by_user_id]
      );
    }

    const loadLinkUpdate = await client.query<{ id: string }>(
      `
        UPDATE mdata.loads
        SET driver_instructions_file_id = $2,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $3::uuid
        RETURNING id
      `,
      [input.load_id, fileId, input.operating_company_id]
    );
    if (!loadLinkUpdate.rows[0]?.id) throw new Error("E_LOAD_NOT_FOUND");

    const baseUrl = process.env.FRONTEND_BASE_URL?.replace(/\/$/, "") ?? "";
    const portalLink = baseUrl ? `${baseUrl}/dispatch?load_id=${input.load_id}` : `Load ${load.load_number}`;
    const presignedUrl = (await generatePresignedDownloadUrl(driverR2Key, 60 * 60 * 24 * 7)).url;

    const channels: string[] = ["portal"];
    const distributionTasks: Array<Promise<unknown>> = [];

    if (load.assigned_primary_driver_id) {
      distributionTasks.push(
        (async () => {
          // LV-DRIVER-PWA-NOTIFY-SILENTLY-DROPPED — never skip silently when table absent.
          const delivered = await insertDriverPwaNotification(client, {
            operatingCompanyId: input.operating_company_id,
            driverId: load.assigned_primary_driver_id!,
            title: `Load ${load.load_number} dispatched`,
            message: "Driver Instructions PDF is ready.",
            payload: { load_id: input.load_id, pdf_url: presignedUrl },
          });
          channels.push(delivered ? "pwa" : "pwa_unavailable");
        })()
      );
    }

    // WhatsApp is not active for this company yet (owner ruling 2026-08-03). Enqueuing anyway would
    // create an event the handler must FAIL (it declares requiresDelivery), so the honest move is to
    // not claim the channel at all and let the caller see that the driver was reached by fewer means.
    const whatsappUsable = Boolean(load.driver_phone) && isWhatsappChannelConfigured();
    if (load.driver_phone && !whatsappUsable) {
      channels.push("whatsapp_unavailable");
    }
    if (whatsappUsable) {
      distributionTasks.push(
        enqueueOutboxEvent(
          client,
          "twilio.whatsapp.send",
          { aggregate_type: "dispatch.loads", aggregate_id: input.load_id },
          {
            to: load.driver_phone,
            template: "load_dispatched",
            variables: {
              load_display_id: load.load_number,
              pickup_location: stopsRes.rows[0]?.city ?? "pickup location",
              pickup_time: stopsRes.rows[0]?.scheduled_arrival_at ?? "scheduled time",
              pdf_url: presignedUrl,
            },
          }
        )
      );
      channels.push("whatsapp");
    }

    const driverEmailQueued = enqueueAfterCommit(client, {
      label: `dispatch-driver-instructions-email:${input.load_id}`,
      run: () => sendEmail({
        sender: "dispatch",
        to: process.env.DISPATCH_DRIVER_INSTRUCTIONS_FALLBACK_EMAIL ?? process.env.EMAIL_FROM_DISPATCH ?? process.env.EMAIL_FROM_NOREPLY ?? "dispatch@example.com",
        subject: `Load ${load.load_number} dispatched`,
        html: `<p>Load ${load.load_number} is dispatched.</p><p>Driver instructions PDF: <a href="${presignedUrl}">${presignedUrl}</a></p>`,
        text: `Load ${load.load_number} dispatched. Driver instructions: ${presignedUrl}`,
        eventClass: "dispatch.load.instructions_email_sent",
        actorUserId: input.requested_by_user_id,
      }),
    });
    if (!driverEmailQueued) throw new Error("after_commit_scope_missing");
    channels.push("email");

    if (load.customer_email) {
      const customerEmail = load.customer_email;
      const customerPdfUrl = (await generatePresignedDownloadUrl(customerR2Key, 60 * 60 * 24 * 7)).url;
      const customerEmailQueued = enqueueAfterCommit(client, {
        label: `dispatch-customer-instructions-email:${input.load_id}`,
        run: () => sendEmail({
          sender: "dispatch",
          to: customerEmail,
          subject: `Customer copy - Load ${load.load_number}`,
          html: `<p>Customer dispatch copy for load ${load.load_number}.</p><p>Download PDF: <a href="${customerPdfUrl}">Customer PDF</a></p>`,
          text: `Customer dispatch copy for load ${load.load_number}.`,
          eventClass: "dispatch.load.customer_copy_email_sent",
          actorUserId: input.requested_by_user_id,
        }),
      });
      if (!customerEmailQueued) throw new Error("after_commit_scope_missing");
    }

    await Promise.all(distributionTasks);

    await appendCrudAudit(
      client,
      input.requested_by_user_id,
      "dispatch.load.instructions_generated",
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
    await appendCrudAudit(
      client,
      input.requested_by_user_id,
      "dispatch.load.instructions_distributed",
      {
        resource_type: "mdata.loads",
        resource_id: input.load_id,
        operating_company_id: input.operating_company_id,
        channels,
        file_id: fileId,
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
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      for (const r2Key of uploadedR2Keys) {
        try {
          await deleteObjectBytes(r2Key);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], `load_distribution_cleanup_failed:${uploadedR2Keys.join(",")}`);
      }
      throw error;
    }
  });
}
