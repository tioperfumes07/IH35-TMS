#!/usr/bin/env tsx
// Apply the T-46 fence <-> Samsara address links (USMCA). Mirrors Samsara's address list, then accepts
// each PROPOSAL through acceptProposal() (re-verifies a live signal, never overwrites a linked fence).
// Only pairs a person verified as the SAME place are linked (LEAD DECISION 2026-10-01 "apply the 30" was
// checked pair by pair before applying: 26 are one-to-many and 3 of the 4 one-to-one pairs are neighbouring
// businesses — proximity alone picked the wrong place). Everything else is reported, not linked.
const VERIFIED = new Set(["Love's #298 — Encinal, TX|Estacion de Gasolina/Loves"]);
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { SamsaraClient } from "../../apps/backend/src/integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../../apps/backend/src/integrations/samsara/samsara-token.js";
import { acceptProposal, mirrorSamsaraAddresses, runGeofenceAddressLink } from "../../apps/backend/src/integrations/samsara/geofences/geofence-address-link.service.js";

await run("geofence_samsara_address_links", async (c) => {
  const cfg = (await c.query(`SELECT * FROM integrations.samsara_config WHERE operating_company_id=$1`, [USMCA])).rows[0];
  const raw = await new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg), samsaraOrgId: null }).listAddresses();
  const dry = await runGeofenceAddressLink({ operatingCompanyId: USMCA, addresses: raw });
  const fenceCount = new Map<string, number>(), addrCount = new Map<string, number>();
  for (const p of dry.plan.proposed) {
    fenceCount.set(p.fence_id, (fenceCount.get(p.fence_id) ?? 0) + 1);
    addrCount.set(p.samsara_address_id, (addrCount.get(p.samsara_address_id) ?? 0) + 1);
  }
  const mirrored = await mirrorSamsaraAddresses(c as never, USMCA, raw);
  const linked: unknown[] = [], refused: unknown[] = [];
  for (const p of dry.plan.proposed) {
    if ((fenceCount.get(p.fence_id) ?? 0) > 1 || (addrCount.get(p.samsara_address_id) ?? 0) > 1) {
      refused.push({ ...p, reason: "one_to_many_in_proposals" });
      continue;
    }
    const fenceLabel = (await c.query(`SELECT label FROM geo.geofences WHERE id=$1`, [p.fence_id])).rows[0]?.label;
    const addrName = (raw.find((a) => String(a.id) === p.samsara_address_id)?.raw as { name?: string } | undefined)?.name;
    if (!VERIFIED.has(`${fenceLabel}|${addrName}`)) {
      refused.push({ ...p, fence: fenceLabel, address: addrName, reason: "proximity_only_different_place" });
      continue;
    }
    const r = await acceptProposal(c as never, { operatingCompanyId: USMCA, fenceId: p.fence_id, samsaraAddressId: p.samsara_address_id, actorUserId: null as never });
    (r.ok ? linked : refused).push(r.ok ? p : { ...p, reason: r.reason });
  }
  const now = (await c.query(`SELECT count(*)::int n FROM geo.geofences WHERE operating_company_id=$1 AND samsara_address_id IS NOT NULL`, [USMCA])).rows[0].n;
  return { addresses_read: raw.length, addresses_mirrored: mirrored, matched_two_signals: dry.matched, proposals: dry.proposed, linked: linked.length, refused, fences_linked_total_after: now };
});
