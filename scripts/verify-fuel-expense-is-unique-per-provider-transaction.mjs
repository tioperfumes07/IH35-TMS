#!/usr/bin/env node
// ROUND 367.2 / 367.8 (CC-2) — one provider transaction is one fuel purchase, live.
//
// Reads every live fuel.fuel_transactions row (all companies except the frozen ones) and fails on any two that carry the
// same provider transaction ID (digits-only transaction_reference) for the same company and vendor. Writers refuse it
// (apps/backend/src/fuel/fuel-provider-reference.ts) and so does the database (202615370600).
//
// AWAITING_OWNER_AUTH is SHRINK-ONLY: the three pairs measured on 2026-10-03, real posted money that only the owner may
// reverse and void. A pair not on it fails. A pair on it that is no longer duplicated fails too, so the entry is removed
// the day the AUTH lands — the list can only get shorter.
import { withUnscopedReadOnly, NOT_FROZEN_SQL, report } from "./lib/bank-feed-state-machine.mjs";

const LABEL = "verify-fuel-expense-is-unique-per-provider-transaction";

// provider ID -> the duplicated fuel rows awaiting an owner AUTH. Shrink-only; empty means every duplicate is resolved.
// 99530579 (USMCA 510.61, loads 13533 / 13548) resolved 2026-10-04 by AUTH-212 (#25356): the 13533 copy voided through the
// void engine. Removed here once the live check showed it no longer duplicated.
const AWAITING_OWNER_AUTH = new Map([]);

const out = await withUnscopedReadOnly(LABEL, async (c) => {
  const dup = await c.query(
    `SELECT co.code, btrim(f.transaction_reference) AS ref, count(*)::int AS n,
            string_agg(f.id::text || ' load ' || COALESCE(l.load_number::text, '-') || ' ' || f.total_cost::text, ' | ' ORDER BY f.created_at) AS rows
       FROM fuel.fuel_transactions f
       JOIN org.companies co ON co.id = f.operating_company_id
       LEFT JOIN mdata.loads l ON l.id = f.load_id
      WHERE f.voided_at IS NULL
        AND btrim(f.transaction_reference) ~ '^[0-9]+$'
        AND ${NOT_FROZEN_SQL("f.operating_company_id")}
      GROUP BY co.code, f.operating_company_id, f.vendor_id, btrim(f.transaction_reference), f.fuel_type -- one purchase per PRODUCT LINE (202615410930)
     HAVING count(*) > 1
      ORDER BY 1, 2`
  );
  const shape = await c.query(
    `SELECT count(*)::int AS live,
            count(*) FILTER (WHERE btrim(f.transaction_reference) ~ '^[0-9]+$')::int AS keyed
       FROM fuel.fuel_transactions f
      WHERE f.voided_at IS NULL AND ${NOT_FROZEN_SQL("f.operating_company_id")}`
  );
  return { dup: dup.rows, shape: shape.rows[0] };
});

const fails = [];
const seen = new Set();
for (const g of out.dup) {
  seen.add(g.ref);
  if (!AWAITING_OWNER_AUTH.has(g.ref)) fails.push(`${g.code} provider transaction ${g.ref} recorded ${g.n} times: ${g.rows}`);
}
for (const ref of AWAITING_OWNER_AUTH.keys()) {
  if (!seen.has(ref)) fails.push(`AWAITING_OWNER_AUTH lists ${ref} but it is no longer duplicated — remove it (shrink-only)`);
}
for (const g of out.dup) if (AWAITING_OWNER_AUTH.has(g.ref)) console.log(`  awaiting owner AUTH: ${g.code} ${g.ref} x${g.n} — ${g.rows}`);
console.log(
  `  bypass=${out.bypass} · live fuel rows ${out.shape.live} · with a provider transaction ID ${out.shape.keyed} · ` +
    `with NO provider key (placeholder / parse fragment) ${out.shape.live - out.shape.keyed}`
);
report(LABEL, fails, `no provider transaction recorded twice beyond the ${AWAITING_OWNER_AUTH.size} named pairs awaiting owner AUTH`);
