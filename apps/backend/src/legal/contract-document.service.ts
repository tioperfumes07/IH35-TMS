// ROUND 435 — every legal contract instance is FILED: a PDF in docs.files, linked both ways, filed where it belongs.
//
// MEASURED 2026-10-06 (prod): USMCA's 3 contract instances (2 draft, 1 voided) had nothing to open. The PDF existed only
// at e-signature, in documents.attachments — outside docs.files and outside every hub's documents. Filed in Legal only
// is half filed; filed nowhere is not filed.
//
// THE RULE (one engine, called at creation, at signature, and when an insurer's first bill is issued):
//   1. render the contract (draft watermark until executed) and store it in docs.files;
//   2. link it BOTH WAYS: docs.file_links(contract_instance) + legal.contract_instances.pdf_file_id;
//   3. file it at its HUB — from the contract's own typed links, never from a category name:
//        driver_id -> the driver's file       customer_id -> the customer      vendor_id -> the vendor
//        unit_id   -> the unit                equipment_id -> the equipment    load_id    -> the load
//      and an INSURANCE contract (its vendor is the carrier of an insurance.policy) -> that carrier's FIRST insurance
//      bill (the earliest bill its policies' payment schedule issued). If no bill exists yet, the policy's bill
//      generator files it when the first bill is issued (fileInsurerContractsOnFirstBill).
// No financial posting. Nothing here creates a contract — it files the ones people create.
import crypto from "node:crypto";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { renderSignedContractPdf } from "./pdf-renderer.service.js";
import { appendContractAuditLog } from "./templates.service.js";

type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export type ContractPdfStage = "draft" | "signed";
export type HubLink = { entity_type: "driver" | "customer" | "vendor" | "unit" | "equipment" | "load" | "bill"; entity_id: string };

/** The hubs a contract is filed at, from its typed links. Pure, so the rule is unit-tested without a database. */
export function contractHubs(row: {
  driver_id?: string | null;
  customer_id?: string | null;
  vendor_id?: string | null;
  unit_id?: string | null;
  equipment_id?: string | null;
  load_id?: string | null;
  signer_type?: string | null;
  signer_entity_id?: string | null;
}, insuranceFirstBillId: string | null): HubLink[] {
  const out: HubLink[] = [];
  const add = (entity_type: HubLink["entity_type"], id: string | null | undefined) => {
    if (id && !out.some((h) => h.entity_type === entity_type && h.entity_id === id)) out.push({ entity_type, entity_id: String(id) });
  };
  add("driver", row.driver_id ?? (row.signer_type === "driver" ? row.signer_entity_id : null));
  add("customer", row.customer_id ?? (row.signer_type === "customer" ? row.signer_entity_id : null));
  add("vendor", row.vendor_id ?? (row.signer_type === "vendor" ? row.signer_entity_id : null));
  add("unit", row.unit_id);
  add("equipment", row.equipment_id);
  add("load", row.load_id);
  add("bill", insuranceFirstBillId);
  return out;
}

/** The carrier's first insurance bill: the earliest live bill its policies' payment schedule issued, or null. */
export async function insurerFirstBillId(client: Db, companyId: string, vendorId: string | null | undefined): Promise<string | null> {
  if (!vendorId) return null;
  const r = await client.query(
    `SELECT b.id::text AS id
       FROM insurance.policy p
       JOIN insurance.payment_schedule ps ON ps.policy_id = p.id AND ps.operating_company_id = p.operating_company_id
       JOIN accounting.bills b ON b.id::text = ps.bill_uuid::text AND b.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid AND p.vendor_id::text = $2::text AND b.voided_at IS NULL
      ORDER BY b.bill_date NULLS LAST, b.created_at
      LIMIT 1`,
    [companyId, vendorId]
  );
  return r.rows[0]?.id ? String(r.rows[0].id) : null;
}

async function linkFile(client: Db, fileId: string, link: { entity_type: string; entity_id: string }, actorUserId: string | null) {
  await client.query(
    `INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
     SELECT $1::uuid, $2, $3::uuid, $4::uuid
      WHERE NOT EXISTS (SELECT 1 FROM docs.file_links WHERE file_id = $1::uuid AND entity_type = $2 AND entity_id = $3::uuid AND deleted_at IS NULL)`,
    [fileId, link.entity_type, link.entity_id, actorUserId]
  );
}

/**
 * Render, store and file one contract instance's PDF. Returns the docs.files id. `signedPdf` is passed by the signing
 * path (the executed PDF it already rendered, byte-identical); otherwise a draft is rendered.
 */
export async function fileContractPdf(
  client: Db,
  args: {
    operatingCompanyId: string;
    contractInstanceId: string;
    actorUserId: string | null;
    stage: ContractPdfStage;
    signedPdf?: { pdfBuffer: Buffer; filename: string; mimeType: string; sha256: string } | null;
  }
): Promise<{ fileId: string; hubs: HubLink[] }> {
  const inst = (
    await client.query(
      `SELECT ci.id::text, ci.template_code, ci.template_version, ci.signer_name, ci.language, ci.filled_variables,
              ci.signer_type, ci.signer_entity_id::text, ci.driver_id::text, ci.customer_id::text, ci.vendor_id::text,
              ci.unit_id::text, ci.equipment_id::text, ci.load_id::text, ci.status::text AS status, ci.created_by_user_id::text,
              ct.content_html_en, ct.content_html_es, ct.display_name_en, ct.category
         FROM legal.contract_instances ci
         JOIN legal.contract_templates ct ON ct.id = ci.template_id AND ct.operating_company_id = ci.operating_company_id
        WHERE ci.operating_company_id = $1::uuid AND ci.id = $2::uuid`,
      [args.operatingCompanyId, args.contractInstanceId]
    )
  ).rows[0];
  if (!inst) throw new Error("legal_contract_instance_not_found");
  if (!isR2Configured()) throw new Error("legal_contract_pdf_storage_not_configured");

  const pdf =
    args.signedPdf ??
    (await renderSignedContractPdf({
      templateCode: String(inst.template_code),
      templateVersion: Number(inst.template_version),
      contractInstanceId: String(inst.id),
      language: String(inst.language) as "en" | "es" | "bilingual",
      signerName: String(inst.signer_name ?? ""),
      contentHtmlEn: String(inst.content_html_en ?? ""),
      contentHtmlEs: String(inst.content_html_es ?? ""),
      filledVariables:
        inst.filled_variables && typeof inst.filled_variables === "object" && !Array.isArray(inst.filled_variables)
          ? (inst.filled_variables as Record<string, unknown>)
          : {},
      signedAtIso: new Date().toISOString(),
      typedSignature: "",
      drawnSignatureSvg: "",
      ipAddress: null,
      userAgent: null,
      draft: true,
    }));
  if (!pdf.pdfBuffer || pdf.pdfBuffer.length === 0) throw new Error("legal_pdf_render_failed");

  const r2Key = `org/${args.operatingCompanyId}/legal/contracts/${inst.id}/${args.stage}-${crypto.randomUUID()}.pdf`;
  await putObjectBytes(r2Key, pdf.pdfBuffer, "application/pdf");
  const title = String(inst.display_name_en ?? inst.template_code);
  const fileRow = (
    await client.query(
      `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, sha256_hash, r2_key,
                               upload_completed_at, document_date, description, uploader_user_id)
       VALUES ($1::uuid, $2, 'application/pdf', $3, $4, $5, now(), current_date, $6, $7::uuid)
       RETURNING id::text`,
      [
        args.operatingCompanyId,
        `${args.stage === "signed" ? "signed" : "draft"}-${String(inst.template_code)}-${String(inst.id).slice(0, 8)}.pdf`,
        pdf.pdfBuffer.length,
        pdf.sha256,
        r2Key,
        `${title} — ${args.stage === "signed" ? "executed" : "draft, not executed"} (contract ${String(inst.id).slice(0, 8)})`,
        args.actorUserId ?? (inst.created_by_user_id ? String(inst.created_by_user_id) : null),
      ]
    )
  ).rows[0];
  const fileId = String(fileRow.id);

  // Both ways: file -> contract, contract -> file.
  await linkFile(client, fileId, { entity_type: "contract_instance", entity_id: String(inst.id) }, args.actorUserId);
  await client.query(
    `UPDATE legal.contract_instances SET pdf_file_id = $3::uuid, updated_at = now() WHERE operating_company_id = $1::uuid AND id = $2::uuid`,
    [args.operatingCompanyId, inst.id, fileId]
  );

  // Filed where it belongs.
  const hubs = contractHubs(inst as never, await insurerFirstBillId(client, args.operatingCompanyId, inst.vendor_id as string | null));
  for (const h of hubs) await linkFile(client, fileId, h, args.actorUserId);

  await appendContractAuditLog(client as never, {
    operatingCompanyId: args.operatingCompanyId,
    contractInstanceId: String(inst.id),
    eventType: "contract_pdf_filed",
    eventPayload: { stage: args.stage, file_id: fileId, sha256: pdf.sha256, hubs },
    actorUserId: args.actorUserId,
  } as never);
  return { fileId, hubs };
}

/**
 * Best-effort wrapper for the create and sign paths: a render or storage failure must not lose the contract (or a
 * completed signature). It is recorded on the contract's audit log, and the contract files itself the first time
 * someone opens it (ensureContractPdfFiled). The SAVEPOINT keeps a failed statement from poisoning the caller's
 * transaction.
 */
export async function fileContractPdfBestEffort(
  client: Db,
  args: Parameters<typeof fileContractPdf>[1]
): Promise<{ fileId: string | null; error: string | null }> {
  await client.query("SAVEPOINT contract_pdf_file");
  try {
    const r = await fileContractPdf(client, args);
    await client.query("RELEASE SAVEPOINT contract_pdf_file");
    return { fileId: r.fileId, error: null };
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT contract_pdf_file");
    const error = String((e as Error)?.message ?? e);
    await appendContractAuditLog(client as never, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: args.contractInstanceId,
      eventType: "contract_pdf_file_failed",
      eventPayload: { stage: args.stage, error },
      actorUserId: args.actorUserId,
    } as never);
    return { fileId: null, error };
  }
}

/** Open path: the contract's filed PDF, filing it now if it has none (a contract that cannot be opened is not filed). */
export async function ensureContractPdfFiled(
  client: Db,
  args: { operatingCompanyId: string; contractInstanceId: string; actorUserId: string }
): Promise<string> {
  const cur = (
    await client.query(
      `SELECT pdf_file_id::text AS f, status::text AS s FROM legal.contract_instances WHERE operating_company_id = $1::uuid AND id = $2::uuid`,
      [args.operatingCompanyId, args.contractInstanceId]
    )
  ).rows[0];
  if (!cur) throw new Error("legal_contract_instance_not_found");
  if (cur.f) return String(cur.f);
  const r = await fileContractPdf(client, { ...args, stage: "draft" });
  return r.fileId;
}

/**
 * Insurance policy bill generator hook: when a carrier's bills are issued, every contract with that carrier whose PDF
 * is filed gets linked to the carrier's FIRST insurance bill (idempotent — an existing link is left as it is).
 */
export async function fileInsurerContractsOnFirstBill(client: Db, companyId: string, vendorId: string | null | undefined, actorUserId: string | null) {
  // insurance.policy.vendor_id is a legacy TEXT column; a value that is not a uuid cannot name an mdata vendor.
  if (!vendorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vendorId)) return 0;
  const billId = await insurerFirstBillId(client, companyId, vendorId);
  if (!billId) return 0;
  const rows = (
    await client.query(
      `SELECT pdf_file_id::text AS f FROM legal.contract_instances
        WHERE operating_company_id = $1::uuid AND vendor_id = $2::uuid AND pdf_file_id IS NOT NULL AND voided_at IS NULL`,
      [companyId, vendorId]
    )
  ).rows;
  for (const r of rows) await linkFile(client, String(r.f), { entity_type: "bill", entity_id: billId }, actorUserId);
  return rows.length;
}
