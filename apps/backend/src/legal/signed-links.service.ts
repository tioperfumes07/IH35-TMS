// Legal Phase 4 — operational connections on signature (NON-financial, ships ON).
//
// When a contract instance is signed, write legal.contract_instance_links and reflect
// the executed document into the operating records that should show it:
//   - driver-signed docs  -> safety.driver_documents (DQ file reflects the executed PDF)
//                            + contract_instance_links(link_type='driver' and 'dq_file')
//   - customer-signed docs -> contract_instance_links(link_type='customer', mdata.customers)
//   - employee-signed docs -> contract_instance_links(link_type='employee', identity.users)
//   - instances tied to a legal matter -> legal.matter_documents + link_type='matter'
//
// This module performs NO financial posting and writes NO journal entries — the lease /
// deduction money handoff lives in signed-finance-handoff.service.ts (Option B).

import { appendContractAuditLog } from "./templates.service.js";

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type LinkType =
  | "driver"
  | "employee"
  | "customer"
  | "unit"
  | "matter"
  | "deduction_schedule"
  | "fixed_asset"
  | "dq_file";

// Idempotent upsert of a single link (reactivates a previously deactivated link).
export async function writeContractInstanceLink(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    contractInstanceId: string;
    linkType: LinkType;
    targetSchema: string;
    targetTable: string;
    targetId: string;
    actorUserId?: string | null;
    notes?: string | null;
  }
) {
  const res = await client.query(
    `
      INSERT INTO legal.contract_instance_links (
        operating_company_id,
        contract_instance_id,
        link_type,
        target_schema,
        target_table,
        target_id,
        is_active,
        notes,
        created_by_user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8)
      ON CONFLICT (contract_instance_id, link_type, target_id)
      DO UPDATE SET is_active = true, notes = COALESCE(EXCLUDED.notes, legal.contract_instance_links.notes)
      RETURNING id
    `,
    [
      args.operatingCompanyId,
      args.contractInstanceId,
      args.linkType,
      args.targetSchema,
      args.targetTable,
      args.targetId,
      args.notes ?? null,
      args.actorUserId ?? null,
    ]
  );
  return String(res.rows[0]?.id ?? "");
}

type SignedInstanceRow = {
  id: string;
  template_code: string;
  template_version: number;
  signer_type: string;
  signer_entity_id: string | null;
  signer_name: string;
  filled_variables: Record<string, unknown>;
  void_legal_matter_id: string | null;
};

async function loadInstance(
  client: QueryableClient,
  operatingCompanyId: string,
  contractInstanceId: string
): Promise<SignedInstanceRow | null> {
  const res = await client.query(
    `
      SELECT id, template_code, template_version, signer_type, signer_entity_id,
             signer_name, filled_variables, void_legal_matter_id
      FROM legal.contract_instances
      WHERE operating_company_id = $1 AND id = $2
      LIMIT 1
    `,
    [operatingCompanyId, contractInstanceId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    template_code: String(row.template_code),
    template_version: Number(row.template_version),
    signer_type: String(row.signer_type),
    signer_entity_id: row.signer_entity_id ? String(row.signer_entity_id) : null,
    signer_name: String(row.signer_name ?? ""),
    filled_variables:
      row.filled_variables && typeof row.filled_variables === "object" && !Array.isArray(row.filled_variables)
        ? (row.filled_variables as Record<string, unknown>)
        : {},
    void_legal_matter_id: row.void_legal_matter_id ? String(row.void_legal_matter_id) : null,
  };
}

export async function applySignedOperationalLinks(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    contractInstanceId: string;
    signedAttachmentId: string | null;
    signedR2Key: string | null;
    signedFileName: string | null;
    actorUserId?: string | null;
  }
) {
  const instance = await loadInstance(client, args.operatingCompanyId, args.contractInstanceId);
  if (!instance) return { linked: [] as LinkType[] };
  const linked: LinkType[] = [];

  // Primary subject link by signer type.
  if (instance.signer_entity_id) {
    if (instance.signer_type === "driver") {
      await writeContractInstanceLink(client, {
        operatingCompanyId: args.operatingCompanyId,
        contractInstanceId: instance.id,
        linkType: "driver",
        targetSchema: "mdata",
        targetTable: "drivers",
        targetId: instance.signer_entity_id,
        actorUserId: args.actorUserId,
      });
      linked.push("driver");

      // DQ reflection: the executed document shows up in the driver's safety file.
      if (args.signedR2Key) {
        const dq = await client.query(
          `
            INSERT INTO safety.driver_documents (
              operating_company_id, driver_id, doc_type, file_name, r2_key, notes
            ) VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING id
          `,
          [
            args.operatingCompanyId,
            instance.signer_entity_id,
            `legal_${instance.template_code}`,
            args.signedFileName ?? `${instance.template_code}.pdf`,
            args.signedR2Key,
            `Signed legal document ${instance.template_code} v${instance.template_version}`,
          ]
        );
        const dqId = dq.rows[0]?.id ? String(dq.rows[0].id) : null;
        if (dqId) {
          await writeContractInstanceLink(client, {
            operatingCompanyId: args.operatingCompanyId,
            contractInstanceId: instance.id,
            linkType: "dq_file",
            targetSchema: "safety",
            targetTable: "driver_documents",
            targetId: dqId,
            actorUserId: args.actorUserId,
          });
          linked.push("dq_file");
        }
      }
    } else if (instance.signer_type === "customer") {
      await writeContractInstanceLink(client, {
        operatingCompanyId: args.operatingCompanyId,
        contractInstanceId: instance.id,
        linkType: "customer",
        targetSchema: "mdata",
        targetTable: "customers",
        targetId: instance.signer_entity_id,
        actorUserId: args.actorUserId,
      });
      linked.push("customer");
    } else if (instance.signer_type === "employee") {
      await writeContractInstanceLink(client, {
        operatingCompanyId: args.operatingCompanyId,
        contractInstanceId: instance.id,
        linkType: "employee",
        targetSchema: "identity",
        targetTable: "users",
        targetId: instance.signer_entity_id,
        actorUserId: args.actorUserId,
      });
      linked.push("employee");
    }
  }

  // Matter reflection: only when the instance is associated with a legal matter.
  // (The general signed-document trail is contract_instance_links + the stored PDF;
  // we do not fabricate a matter for every contract.)
  if (instance.void_legal_matter_id && args.signedR2Key && args.signedAttachmentId) {
    await client.query(
      `
        INSERT INTO legal.matter_documents (
          operating_company_id, matter_id, title, r2_object_key, content_type,
          file_size_bytes, attachment_id, uploaded_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        args.operatingCompanyId,
        instance.void_legal_matter_id,
        `Signed: ${instance.template_code} v${instance.template_version}`,
        args.signedR2Key,
        "application/pdf",
        0,
        args.signedAttachmentId,
        args.actorUserId ?? null,
      ]
    );
    await writeContractInstanceLink(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: instance.id,
      linkType: "matter",
      targetSchema: "legal",
      targetTable: "matters",
      targetId: instance.void_legal_matter_id,
      actorUserId: args.actorUserId,
    });
    linked.push("matter");
  }

  if (linked.length > 0) {
    await appendContractAuditLog(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: instance.id,
      eventType: "contract_operational_links_applied",
      eventPayload: { links: linked, template_code: instance.template_code },
      actorUserId: args.actorUserId,
    });
  }
  return { linked };
}
