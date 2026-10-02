/**
 * ROUND 316 — LEGAL CONTRACT LINKAGE (§10-B). A contract instance carries REAL foreign keys to what it binds
 * (customer, vendor, driver, unit, trailer, load, lease contract, counterparty company — migration 202615190100)
 * and a contract_instance_links row for every target, including the many-valued ones (several units / trailers,
 * invoices, bills). Every id is entity-scoped before it is linked; nothing cross-company is ever written.
 * Reverse: each target's profile reads legal.contract_instances by its FK / contract_instance_links by target_id.
 */
import { writeContractInstanceLink, type LinkType } from "./signed-links.service.js";

type QueryableClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }> };

export type ContractLinksInput = {
  customer_id?: string | null;
  vendor_id?: string | null;
  driver_id?: string | null;
  unit_ids?: string[];
  equipment_ids?: string[];
  load_id?: string | null;
  lease_contract_id?: string | null;
  invoice_ids?: string[];
  bill_ids?: string[];
  counterparty_company_id?: string | null;
};

/** Target registry: link type -> table and the entity-scope predicate ($1 = id, $2 = company). */
export const LINK_TARGETS: Record<string, { linkType: LinkType; schema: string; table: string; scope: string }> = {
  customer_id: { linkType: "customer", schema: "mdata", table: "customers", scope: "id = $1::uuid AND operating_company_id = $2::uuid" },
  vendor_id: { linkType: "vendor", schema: "mdata", table: "vendors", scope: "id = $1::uuid AND operating_company_id = $2::uuid" },
  driver_id: { linkType: "driver", schema: "mdata", table: "drivers", scope: "id = $1::uuid AND operating_company_id = $2::uuid" },
  unit_ids: { linkType: "unit", schema: "mdata", table: "units", scope: "id = $1::uuid AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid OR owner_company_id IN (SELECT org.user_accessible_company_ids()) OR currently_leased_to_company_id IN (SELECT org.user_accessible_company_ids()))" },
  equipment_ids: { linkType: "equipment", schema: "mdata", table: "equipment", scope: "id = $1::uuid AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid OR owner_company_id IN (SELECT org.user_accessible_company_ids()) OR currently_leased_to_company_id IN (SELECT org.user_accessible_company_ids()))" },
  load_id: { linkType: "load", schema: "mdata", table: "loads", scope: "id = $1::uuid AND operating_company_id = $2::uuid" },
  lease_contract_id: { linkType: "lease_contract", schema: "accounting", table: "lease_contract", scope: "id = $1::uuid AND operating_company_id = $2::uuid" },
  invoice_ids: { linkType: "invoice", schema: "accounting", table: "invoices", scope: "id = $1::uuid AND operating_company_id = $2::uuid" },
  bill_ids: { linkType: "bill", schema: "accounting", table: "bills", scope: "id = $1::uuid AND operating_company_id = $2::uuid" },
  counterparty_company_id: { linkType: "company", schema: "org", table: "companies", scope: "id = $1::uuid" },
};

/** Pure: the typed FK columns a set of links fills on the instance (first unit / trailer). */
export function typedForeignKeys(links: ContractLinksInput): Record<string, string | null> {
  return {
    customer_id: links.customer_id ?? null,
    vendor_id: links.vendor_id ?? null,
    driver_id: links.driver_id ?? null,
    unit_id: links.unit_ids?.[0] ?? null,
    equipment_id: links.equipment_ids?.[0] ?? null,
    load_id: links.load_id ?? null,
    lease_contract_id: links.lease_contract_id ?? null,
    counterparty_company_id: links.counterparty_company_id ?? null,
  };
}

/** Pure: the signer's own FK, derived from signer_type (a vendor signer IS the contract's vendor). */
export function signerLinks(signerType: string, signerEntityId: string | null | undefined): ContractLinksInput {
  if (!signerEntityId) return {};
  if (signerType === "vendor") return { vendor_id: signerEntityId };
  if (signerType === "customer") return { customer_id: signerEntityId };
  if (signerType === "driver") return { driver_id: signerEntityId };
  if (signerType === "company") return { counterparty_company_id: signerEntityId };
  // employee uses link_type=employee via syncEmployeeSignerLink (not a typed FK column).
  return {};
}

/** ROUND 326 — named reason when a contract/matter has no subject (no invented links). */
export const CONTRACT_UNLINKED_REASON_KEY = "_linkage_unlinked_reason";
export const MATTER_UNLINKED_REASON_PREFIX = "UNLINKED_REASON:";

export const MATTER_SUBJECT_FK_COLS = [
  "customer_id",
  "vendor_id",
  "load_id",
  "related_driver_id",
  "related_user_id",
  "unit_id",
  "equipment_id",
  "insurance_claim_id",
  "insurance_lawsuit_id",
  "incident_id",
] as const;

/** Build link input from an existing instance row (FKs + signer). Never invents ids. */
export function linksFromInstanceRow(row: {
  signer_type?: string | null;
  signer_entity_id?: string | null;
  customer_id?: string | null;
  vendor_id?: string | null;
  driver_id?: string | null;
  unit_id?: string | null;
  equipment_id?: string | null;
  load_id?: string | null;
  lease_contract_id?: string | null;
  counterparty_company_id?: string | null;
}): ContractLinksInput {
  const fromFks: ContractLinksInput = {
    customer_id: row.customer_id ?? null,
    vendor_id: row.vendor_id ?? null,
    driver_id: row.driver_id ?? null,
    load_id: row.load_id ?? null,
    lease_contract_id: row.lease_contract_id ?? null,
    counterparty_company_id: row.counterparty_company_id ?? null,
    unit_ids: row.unit_id ? [String(row.unit_id)] : [],
    equipment_ids: row.equipment_id ? [String(row.equipment_id)] : [],
  };
  return mergeLinks(signerLinks(String(row.signer_type ?? ""), row.signer_entity_id ? String(row.signer_entity_id) : null), fromFks);
}

export function parseContractUnlinkedReason(filled: unknown): string | null {
  if (!filled || typeof filled !== "object" || Array.isArray(filled)) return null;
  const v = (filled as Record<string, unknown>)[CONTRACT_UNLINKED_REASON_KEY];
  return typeof v === "string" && v.trim().length >= 3 ? v.trim() : null;
}

export function parseMatterUnlinkedReason(internalNotes: string | null | undefined): string | null {
  if (!internalNotes) return null;
  const line = internalNotes
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(MATTER_UNLINKED_REASON_PREFIX));
  if (!line) return null;
  const reason = line.slice(MATTER_UNLINKED_REASON_PREFIX.length).trim();
  return reason.length >= 3 ? reason : null;
}

export function matterHasSubjectFk(row: Record<string, unknown>): boolean {
  return MATTER_SUBJECT_FK_COLS.some((c) => row[c] != null && String(row[c]).length > 0);
}

export function mergeLinks(a: ContractLinksInput, b: ContractLinksInput): ContractLinksInput {
  const uniq = (x?: string[], y?: string[]) => [...new Set([...(x ?? []), ...(y ?? [])])];
  return {
    customer_id: a.customer_id ?? b.customer_id ?? null,
    vendor_id: a.vendor_id ?? b.vendor_id ?? null,
    driver_id: a.driver_id ?? b.driver_id ?? null,
    load_id: a.load_id ?? b.load_id ?? null,
    lease_contract_id: a.lease_contract_id ?? b.lease_contract_id ?? null,
    counterparty_company_id: a.counterparty_company_id ?? b.counterparty_company_id ?? null,
    unit_ids: uniq(a.unit_ids, b.unit_ids),
    equipment_ids: uniq(a.equipment_ids, b.equipment_ids),
    invoice_ids: uniq(a.invoice_ids, b.invoice_ids),
    bill_ids: uniq(a.bill_ids, b.bill_ids),
  };
}

export async function applyContractLinkage(
  client: QueryableClient,
  args: { operatingCompanyId: string; contractInstanceId: string; actorUserId: string; links: ContractLinksInput }
): Promise<{ linked: number }> {
  let linked = 0;
  // Validate first (all or nothing), then write.
  const pairs: Array<{ key: string; id: string }> = [];
  for (const [key, val] of Object.entries(args.links)) {
    if (!LINK_TARGETS[key] || val == null) continue;
    for (const id of Array.isArray(val) ? val : [val]) if (id) pairs.push({ key, id });
  }
  for (const { key, id } of pairs) {
    const t = LINK_TARGETS[key];
    const ok = await client.query(`SELECT 1 FROM ${t.schema}.${t.table} WHERE ${t.scope} LIMIT 1`, t.scope.includes("$2") ? [id, args.operatingCompanyId] : [id]);
    if (!ok.rows.length) {
      const err = new Error("legal_link_target_not_in_company");
      (err as Error & { details?: unknown }).details = { link: key, id };
      throw err;
    }
  }
  const fk = typedForeignKeys(args.links);
  await client.query(
    `UPDATE legal.contract_instances
        SET customer_id = COALESCE($3::uuid, customer_id), vendor_id = COALESCE($4::uuid, vendor_id),
            driver_id = COALESCE($5::uuid, driver_id), unit_id = COALESCE($6::uuid, unit_id),
            equipment_id = COALESCE($7::uuid, equipment_id), load_id = COALESCE($8::uuid, load_id),
            lease_contract_id = COALESCE($9::uuid, lease_contract_id), counterparty_company_id = COALESCE($10::uuid, counterparty_company_id),
            updated_by_user_id = $11::uuid, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [args.contractInstanceId, args.operatingCompanyId, fk.customer_id, fk.vendor_id, fk.driver_id, fk.unit_id, fk.equipment_id, fk.load_id, fk.lease_contract_id, fk.counterparty_company_id, args.actorUserId]
  );
  for (const { key, id } of pairs) {
    const t = LINK_TARGETS[key];
    await writeContractInstanceLink(client as never, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: args.contractInstanceId,
      linkType: t.linkType,
      targetSchema: t.schema,
      targetTable: t.table,
      targetId: id,
      actorUserId: args.actorUserId,
    });
    linked += 1;
  }
  return { linked };
}

/** Reverse: contracts bound to a target (any FK or link row). */
export async function contractsForTarget(client: QueryableClient, opco: string, linkType: LinkType, targetId: string) {
  const fkCol: Record<string, string> = { customer: "customer_id", vendor: "vendor_id", driver: "driver_id", unit: "unit_id", equipment: "equipment_id", load: "load_id", lease_contract: "lease_contract_id", company: "counterparty_company_id" };
  const col = fkCol[linkType];
  return (await client.query(
    `SELECT DISTINCT ci.id::text, ci.template_code, ci.status::text AS status, ci.signer_name, ci.signed_at, ci.created_at
       FROM legal.contract_instances ci
      WHERE ci.operating_company_id = $1::uuid AND ci.voided_at IS NULL
        AND (${col ? `ci.${col} = $3::uuid OR ` : ""}EXISTS (SELECT 1 FROM legal.contract_instance_links l
                     WHERE l.contract_instance_id = ci.id AND l.link_type = $2 AND l.target_id = $3::uuid AND l.is_active))
      ORDER BY ci.created_at DESC`,
    [opco, linkType, targetId]
  )).rows;
}

/**
 * ROUND 326 item 1 — sync engine. Reads the instance's existing signer + typed FKs and writes
 * contract_instance_links (+ FK stamp). Does not invent subjects. Employee signer writes link_type=employee.
 */
export async function syncContractInstanceLinkage(
  client: QueryableClient,
  args: { operatingCompanyId: string; contractInstanceId: string; actorUserId: string }
): Promise<{ linked: number; skipped_reason?: string }> {
  const res = await client.query(
    `SELECT id::text, signer_type, signer_entity_id::text, customer_id::text, vendor_id::text, driver_id::text,
            unit_id::text, equipment_id::text, load_id::text, lease_contract_id::text, counterparty_company_id::text,
            filled_variables, voided_at
       FROM legal.contract_instances
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1`,
    [args.contractInstanceId, args.operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) throw new Error("legal_contract_instance_not_found");
  if (row.voided_at) return { linked: 0, skipped_reason: "voided" };

  const links = linksFromInstanceRow(row as never);
  const applied = await applyContractLinkage(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractInstanceId: args.contractInstanceId,
    actorUserId: args.actorUserId,
    links,
  });

  // employee has no typed FK column — write the operational link directly when signer is employee.
  if (String(row.signer_type) === "employee" && row.signer_entity_id) {
    const ok = await client.query(
      `SELECT 1 FROM identity.users WHERE id = $1::uuid LIMIT 1`,
      [row.signer_entity_id]
    );
    if (ok.rows.length) {
      await writeContractInstanceLink(client as never, {
        operatingCompanyId: args.operatingCompanyId,
        contractInstanceId: args.contractInstanceId,
        linkType: "employee",
        targetSchema: "identity",
        targetTable: "users",
        targetId: String(row.signer_entity_id),
        actorUserId: args.actorUserId,
        notes: "sync:signer_employee",
      });
      applied.linked += 1;
    }
  }

  return applied;
}

/** Sync every non-voided contract instance for the company (engine repair — no invented subjects). */
export async function syncAllContractInstanceLinkageForCompany(
  client: QueryableClient,
  args: { operatingCompanyId: string; actorUserId: string }
): Promise<{ instances: number; linked: number; orphans: Array<{ id: string; reason: string | null }> }> {
  const list = await client.query(
    `SELECT id::text FROM legal.contract_instances
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL
      ORDER BY created_at ASC`,
    [args.operatingCompanyId]
  );
  let linked = 0;
  for (const r of list.rows) {
    const out = await syncContractInstanceLinkage(client, {
      operatingCompanyId: args.operatingCompanyId,
      contractInstanceId: String(r.id),
      actorUserId: args.actorUserId,
    });
    linked += out.linked;
  }
  const orphans = await listContractLinkageOrphans(client, args.operatingCompanyId);
  return { instances: list.rows.length, linked, orphans };
}

/** Non-voided instances with zero active links and no recorded unlinked reason. */
export async function listContractLinkageOrphans(client: QueryableClient, opco: string) {
  const res = await client.query(
    `SELECT ci.id::text, ci.template_code, ci.filled_variables,
            (SELECT count(*)::int FROM legal.contract_instance_links l
              WHERE l.contract_instance_id = ci.id AND l.is_active) AS link_count
       FROM legal.contract_instances ci
      WHERE ci.operating_company_id = $1::uuid AND ci.voided_at IS NULL
      ORDER BY ci.created_at`,
    [opco]
  );
  return res.rows
    .filter((r) => Number(r.link_count ?? 0) === 0 && !parseContractUnlinkedReason(r.filled_variables))
    .map((r) => ({ id: String(r.id), reason: null as string | null, template_code: String(r.template_code ?? "") }));
}

/** Matters with no subject FK and no UNLINKED_REASON in internal_notes. */
export async function listMatterLinkageOrphans(client: QueryableClient, opco: string) {
  const res = await client.query(
    `SELECT id::text, matter_number, internal_notes,
            customer_id, vendor_id, load_id, related_driver_id, related_user_id,
            unit_id, equipment_id, insurance_claim_id, insurance_lawsuit_id, incident_id
       FROM legal.matters
      WHERE operating_company_id = $1::uuid
      ORDER BY created_at NULLS LAST`,
    [opco]
  );
  return res.rows
    .filter((r) => !matterHasSubjectFk(r) && !parseMatterUnlinkedReason(r.internal_notes == null ? null : String(r.internal_notes)))
    .map((r) => ({ id: String(r.id), matter_number: String(r.matter_number ?? ""), reason: null as string | null }));
}
