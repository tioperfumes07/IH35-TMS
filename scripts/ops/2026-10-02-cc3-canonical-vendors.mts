#!/usr/bin/env npx tsx
// ROUND 326 item 2. Dry run by default; --apply requires --auth AUTH-NNN (verified OPEN on main by 2026-10-01-cc3-lib.mjs).
// Merges every USMCA duplicate vendor group (same normalized name) into its canonical survivor in mdata.vendors through
// the canonical engine (repoint every reference -- live FKs + discovered vendor_id/vendor_uuid columns -- keep the alias
// + snapshot + repoint log, delete the duplicate). mdata.qbo_vendors is never written. Refuses (rolls back) unless
// open A/P is unchanged to the cent, both for the merged group and company-wide.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { planCanonical, mergeIntoCanonical, openBalanceCents } from "../../apps/backend/src/mdata/canonical/canonical-entities.service.ts";

const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

await run("canonical_vendors", async (c: any, { authId }: { authId: string | null }) => {
  const plan = await planCanonical(c, USMCA, "vendor");
  const ids = plan.groups.flatMap((g) => [g.survivor.id, ...g.duplicates.map((d) => d.id)]);
  const apGroupBefore = await openBalanceCents(c, "vendor", ids);
  const company = async () => (await c.query(
    `SELECT COALESCE(sum(amount_cents - COALESCE(paid_cents, 0)), 0)::bigint::text s, count(*)::int n
       FROM accounting.bills WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status <> 'void'`, [USMCA])).rows[0];
  const apCompanyBefore = await company();
  const merges = [];
  for (const g of plan.groups) for (const d of g.duplicates) {
    merges.push(await mergeIntoCanonical(c, USMCA, "vendor", { survivorId: g.survivor.id, duplicateId: d.id, actorUserId: OWNER_USER_ID, authId: authId ?? "DRY-RUN", reason: `ROUND 326 canonical vendors: '${d.name}' duplicates '${g.survivor.name}'` }));
  }
  const apGroupAfter = await openBalanceCents(c, "vendor", plan.groups.map((g) => g.survivor.id));
  const apCompanyAfter = await company();
  if (apGroupBefore !== apGroupAfter || apCompanyBefore.s !== apCompanyAfter.s || apCompanyBefore.n !== apCompanyAfter.n) {
    throw new Error(`refused: A/P moved (group ${apGroupBefore} -> ${apGroupAfter}; company ${JSON.stringify(apCompanyBefore)} -> ${JSON.stringify(apCompanyAfter)})`);
  }
  const left = (await planCanonical(c, USMCA, "vendor")).groups.length;
  return {
    groups: plan.groups.length, duplicates_merged: merges.length, rows_repointed: merges.reduce((n, m) => n + m.rows_repointed, 0),
    ap_group_cents_before: apGroupBefore, ap_group_cents_after: apGroupAfter, ap_company_before: apCompanyBefore, ap_company_after: apCompanyAfter,
    duplicate_groups_left: left, aliases: merges.map((m) => m.alias_id),
  };
});
