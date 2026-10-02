#!/usr/bin/env npx tsx
// ROUND 326 item 1. Dry run by default; --apply requires --auth AUTH-NNN (verified OPEN on main by 2026-10-01-cc3-lib.mjs).
// Merges every USMCA duplicate customer group (same normalized name) into its canonical survivor through the
// canonical engine (apps/backend/src/mdata/canonical/canonical-entities.service.ts): repoint every reference, keep the
// alias + snapshot + repoint log (reversible), delete the duplicate. Refuses (rolls back) unless open A/R is unchanged
// to the cent, both for the merged group and company-wide.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { planCanonical, mergeIntoCanonical, openBalanceCents } from "../../apps/backend/src/mdata/canonical/canonical-entities.service.ts";

const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

await run("canonical_customers", async (c: any, { authId }: { authId: string | null }) => {
  const plan = await planCanonical(c, USMCA, "customer");
  const ids = plan.groups.flatMap((g) => [g.survivor.id, ...g.duplicates.map((d) => d.id)]);
  const arGroupBefore = await openBalanceCents(c, "customer", ids);
  const company = async () => (await c.query(`SELECT COALESCE(sum(amount_open_cents),0)::bigint::text s, count(*)::int n FROM accounting.invoices WHERE operating_company_id=$1::uuid AND voided_at IS NULL`, [USMCA])).rows[0];
  const arCompanyBefore = await company();
  const merges = [];
  for (const g of plan.groups) for (const d of g.duplicates) {
    merges.push(await mergeIntoCanonical(c, USMCA, "customer", { survivorId: g.survivor.id, duplicateId: d.id, actorUserId: OWNER_USER_ID, authId: authId ?? "DRY-RUN", reason: `ROUND 326 canonical customers: '${d.name}' duplicates '${g.survivor.name}'` }));
  }
  const arGroupAfter = await openBalanceCents(c, "customer", plan.groups.map((g) => g.survivor.id));
  const arCompanyAfter = await company();
  if (arGroupBefore !== arGroupAfter || arCompanyBefore.s !== arCompanyAfter.s || arCompanyBefore.n !== arCompanyAfter.n) {
    throw new Error(`refused: A/R moved (group ${arGroupBefore} -> ${arGroupAfter}; company ${JSON.stringify(arCompanyBefore)} -> ${JSON.stringify(arCompanyAfter)})`);
  }
  const left = (await planCanonical(c, USMCA, "customer")).groups.length;
  return {
    groups: plan.groups.length, duplicates_merged: merges.length, rows_repointed: merges.reduce((n, m) => n + m.rows_repointed, 0),
    ar_group_cents_before: arGroupBefore, ar_group_cents_after: arGroupAfter, ar_company_before: arCompanyBefore, ar_company_after: arCompanyAfter,
    duplicate_groups_left: left, aliases: merges.map((m) => m.alias_id),
  };
});
