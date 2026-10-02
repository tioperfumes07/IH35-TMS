/**
 * ROUND 326 item 2 — LEGAL BACKFILL from signed / stored source fields.
 * Never invents a subject mapping. Uses only:
 *   - signer_type + signer_entity_id (and existing typed FKs) via syncContractInstanceLinkage
 *   - matter subject FKs already on the row
 * When no subject can be named from those sources, records a named UNLINKED_REASON
 * (contract filled_variables._linkage_unlinked_reason / matter internal_notes prefix).
 * Seat-fixture matter numbers get an explicit pending-clean-app-delete reason.
 * No seed. No Chrome. Owner triggers the route.
 */
import {
  CONTRACT_UNLINKED_REASON_KEY,
  MATTER_UNLINKED_REASON_PREFIX,
  listContractLinkageOrphans,
  listMatterLinkageOrphans,
  syncAllContractInstanceLinkageForCompany,
} from "./contract-linkage.service.js";

type QueryableClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

const SEAT_FIXTURE_MATTER_RE =
  /^(SAMPLE|TEST|CASCADE|CODEX|CC3-|MAT-.*TEST|MTR-CASCADE)/i;

function isSeatFixtureMatterNumber(matterNumber: string): boolean {
  return SEAT_FIXTURE_MATTER_RE.test(matterNumber.trim());
}

export async function backfillLegalLinkageFromSources(
  client: QueryableClient,
  args: { operatingCompanyId: string; actorUserId: string }
): Promise<{
  sync: { instances: number; linked: number };
  contracts_reason_stamped: number;
  matters_reason_stamped: number;
  contract_orphans_remaining: number;
  matter_orphans_remaining: number;
}> {
  const sync = await syncAllContractInstanceLinkageForCompany(client, {
    operatingCompanyId: args.operatingCompanyId,
    actorUserId: args.actorUserId,
  });

  let contractsReason = 0;
  const contractOrphans = await listContractLinkageOrphans(client, args.operatingCompanyId);
  for (const o of contractOrphans) {
    // No signer / FK yielded a link — record why. Never invent a target id.
    const reason =
      "source fields do not name a resolvable subject entity id (signer/FKs empty or out of company)";
    await client.query(
      `UPDATE legal.contract_instances
          SET filled_variables = COALESCE(filled_variables, '{}'::jsonb) || jsonb_build_object($3::text, $4::text),
              updated_by_user_id = $5::uuid,
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [o.id, args.operatingCompanyId, CONTRACT_UNLINKED_REASON_KEY, reason, args.actorUserId]
    );
    contractsReason += 1;
  }

  let mattersReason = 0;
  const matterOrphans = await listMatterLinkageOrphans(client, args.operatingCompanyId);
  for (const o of matterOrphans) {
    const reason = isSeatFixtureMatterNumber(o.matter_number)
      ? "seat fixture matter — no signed source naming a subject; pending clean-app delete"
      : "no signed source document names a subject";
    const line = `${MATTER_UNLINKED_REASON_PREFIX} ${reason}`;
    await client.query(
      `UPDATE legal.matters
          SET internal_notes = CASE
                WHEN coalesce(internal_notes, '') = '' THEN $3::text
                WHEN position($4::text in coalesce(internal_notes, '')) > 0 THEN internal_notes
                ELSE internal_notes || E'\n' || $3::text
              END,
              updated_by_user_id = $5::uuid,
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [o.id, args.operatingCompanyId, line, MATTER_UNLINKED_REASON_PREFIX, args.actorUserId]
    );
    mattersReason += 1;
  }

  const contractLeft = await listContractLinkageOrphans(client, args.operatingCompanyId);
  const matterLeft = await listMatterLinkageOrphans(client, args.operatingCompanyId);
  return {
    sync: { instances: sync.instances, linked: sync.linked },
    contracts_reason_stamped: contractsReason,
    matters_reason_stamped: mattersReason,
    contract_orphans_remaining: contractLeft.length,
    matter_orphans_remaining: matterLeft.length,
  };
}
