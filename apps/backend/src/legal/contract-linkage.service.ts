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
  return {};
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
