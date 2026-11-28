/**
 * PERFUME duplicate companies → one company (migration 202617170100). Owner 2026-11-27 16:32 CT: "in vendors, leads, you have the same
 * vendor multiple times, instead of having a vendor and multiple contacts within a vendor … as vendor it is one company and contacts
 * there are multiple".
 *
 * A duplicate group = live contact companies with the same match key (perfume.name_key — the one shared definition: no accents,
 * punctuation or LLC / S.A. de C.V. tail). The company that stays is the one with the most attached (ScentsX link, customer account,
 * people, documents), then the oldest. Merge, in one transaction per group:
 *   * every row that points at a duplicate (people, quotes, sales orders, customer-account events, credit applications, trade buyers,
 *     trade-show contacts, contact origins, lead events, purchase history, price-list vendors; ScentsX customer links, KYC, cash payers,
 *     pagarés, resale certificates, screenings) moves to the company that stays — except where the company that stays already has the
 *     one-per-company row (customer account, live ScentsX customer link, live KYC, the same trade / show): that row stays on the
 *     duplicate, which keeps it as a location, and the preview says so;
 *   * blank fields of the company that stays are filled from the duplicates (phone, website, domain, address, owner, LinkedIn); its role
 *     becomes "both" when one was a vendor and another a customer;
 *   * each duplicate is kept as a LOCATION of the company: archived_at + merged_into_id, its own address / city / phone untouched;
 *   * one history row per merged company (perfume.lead_events 'merged_into' on the duplicate, 'merged_from' on the company that stays).
 * Never deleted.
 */
import type pg from "pg";
import { z } from "zod";
import { logEvents } from "./leads.events.js";

type Q = Pick<pg.PoolClient, "query">;

type Member = { id: string; name: string; role: string | null; city: string | null; state: string | null; people: number; docs: number; sx_link: boolean;
  account: boolean; created_at: string };
export type DupGroup = { key: string; name: string; keep: Member; merge: Member[]; companies: number };

const SCORE = (m: Member) => (m.sx_link ? 1_000_000 : 0) + (m.account ? 100_000 : 0) + m.people * 100 + m.docs;

/** Every name with more than one live company, with the company that stays first. */
export async function duplicateGroups(c: Q, opts: { key?: string } = {}): Promise<DupGroup[]> {
  const rows = (await c.query<Member & { key: string }>(
    `SELECT cc.name_key AS key, cc.id::text, cc.name, cc.role, cc.city, cc.state, cc.created_at::text,
            (SELECT count(*)::int FROM perfume.contact_people p WHERE p.company_id = cc.id AND p.archived_at IS NULL) AS people,
            ((SELECT count(*) FROM perfume.quotes q WHERE q.company_id = cc.id) + (SELECT count(*) FROM perfume.sales_orders o WHERE o.company_id = cc.id)
              + (SELECT count(*) FROM perfume.vendors v WHERE v.company_id = cc.id))::int AS docs,
            EXISTS (SELECT 1 FROM scentsx.customer_links l WHERE l.contact_company_id = cc.id AND l.voided_at IS NULL) AS sx_link,
            EXISTS (SELECT 1 FROM perfume.customer_accounts a WHERE a.company_id = cc.id) AS account
       FROM perfume.contact_companies cc
      WHERE cc.archived_at IS NULL AND coalesce(cc.name_key, '') <> '' AND ($1::text IS NULL OR cc.name_key = $1)
        AND cc.name_key IN (SELECT name_key FROM perfume.contact_companies WHERE archived_at IS NULL AND coalesce(name_key, '') <> '' GROUP BY 1 HAVING count(*) > 1)
      ORDER BY cc.name_key`, [opts.key ?? null])).rows;
  const groups = new Map<string, Member[]>();
  for (const r of rows) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  return [...groups.entries()].map(([key, ms]) => {
    const sorted = [...ms].sort((a, b) => SCORE(b) - SCORE(a) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    return { key, name: sorted[0]!.name, keep: sorted[0]!, merge: sorted.slice(1), companies: sorted.length };
  }).sort((a, b) => b.companies - a.companies || a.key.localeCompare(b.key));
}

/** Tables whose company column simply moves to the company that stays. Append-only event logs (perfume.customer_account_events,
 *  perfume.lead_events — SELECT/INSERT only, never UPDATE) are NOT rewritten: they stay on the merged duplicate and the readers include
 *  the companies merged into this one (owner 2026-11-28 14:05 CT: merge failed "permission denied for table customer_account_events"). */
const MOVE: Array<[string, string]> = [
  ["perfume.contact_people", "company_id"], ["perfume.quotes", "company_id"], ["perfume.sales_orders", "company_id"],
  ["perfume.credit_applications", "company_id"], ["perfume.contact_origins", "company_id"],
  ["perfume.customer_purchase_history", "company_id"], ["perfume.vendors", "company_id"],
  ["scentsx.cash_payers", "contact_company_id"], ["scentsx.pagares", "contact_company_id"], ["scentsx.resale_certificates", "contact_company_id"],
  ["scentsx.sanctions_screenings", "contact_company_id"],
];

export const mergeSchema = z.object({ keys: z.array(z.string().min(1).max(300)).min(1).max(500) });
export const mergeOneSchema = z.object({ keep: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(500) });

/** Merges the given companies into `keep` (one transaction on the caller's client): see the header. Used by the group merge and by a
 *  confirmed duplicate recommendation. */
export async function mergeCompanies(c: pg.PoolClient, uid: string, keep: string, dupIdsIn: string[], reason?: string) {
  const dupIds = dupIdsIn.filter((d) => d !== keep);
  if (!dupIds.length) return 0;
  const live = (await c.query<{ id: string; name: string; city: string | null; archived: boolean }>(
    `SELECT id::text, name, city, archived_at IS NOT NULL AS archived FROM perfume.contact_companies WHERE id = ANY($1::uuid[])`, [[keep, ...dupIds]])).rows;
  const k = live.find((x) => x.id === keep);
  if (!k || k.archived) throw new Error("company_to_keep_not_live");
  const dups = live.filter((x) => x.id !== keep && !x.archived);
  if (!dups.length) return 0;
  const keepName = k.name;
  const dupIds2 = dups.map((d) => d.id);
    await c.query(`SELECT id FROM perfume.contact_companies WHERE id = ANY($1::uuid[]) FOR UPDATE`, [[keep, ...dupIds2]]);
    for (const [t, col] of MOVE) {
      await c.query(`UPDATE ${t} SET ${col} = $1::uuid WHERE ${col} = ANY($2::uuid[])`, [keep, dupIds2]);
    }
    // One-per-company rows move only when the company that stays has none (else they stay on the duplicate = its location).
    await c.query(`UPDATE perfume.customer_accounts a SET company_id = $1::uuid WHERE a.company_id = ANY($2::uuid[])
                     AND NOT EXISTS (SELECT 1 FROM perfume.customer_accounts b WHERE b.company_id = $1::uuid)
                     AND a.company_id = (SELECT x.company_id FROM perfume.customer_accounts x WHERE x.company_id = ANY($2::uuid[]) ORDER BY x.company_id LIMIT 1)`, [keep, dupIds2]);
    await c.query(`UPDATE scentsx.customer_links l SET contact_company_id = $1::uuid WHERE l.contact_company_id = ANY($2::uuid[]) AND l.voided_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM scentsx.customer_links k WHERE k.contact_company_id = $1::uuid AND k.voided_at IS NULL)
                     AND l.id = (SELECT y.id FROM scentsx.customer_links y WHERE y.contact_company_id = ANY($2::uuid[]) AND y.voided_at IS NULL ORDER BY y.created_at LIMIT 1)`, [keep, dupIds2]);
    await c.query(`UPDATE scentsx.party_kyc k SET contact_company_id = $1::uuid WHERE k.contact_company_id = ANY($2::uuid[]) AND k.voided_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM scentsx.party_kyc j WHERE j.contact_company_id = $1::uuid AND j.voided_at IS NULL)
                     AND k.id = (SELECT z.id FROM scentsx.party_kyc z WHERE z.contact_company_id = ANY($2::uuid[]) AND z.voided_at IS NULL ORDER BY z.created_at LIMIT 1)`, [keep, dupIds2]);
    await c.query(`UPDATE perfume.trade_buyers t SET company_id = $1::uuid WHERE t.company_id = ANY($2::uuid[]) AND t.archived_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM perfume.trade_buyers u WHERE u.trade_id = t.trade_id AND u.company_id = $1::uuid AND u.archived_at IS NULL)`, [keep, dupIds2]);
    await c.query(`UPDATE perfume.trade_show_contacts t SET company_id = $1::uuid WHERE t.company_id = ANY($2::uuid[]) AND t.archived_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM perfume.trade_show_contacts u WHERE u.show_id = t.show_id AND u.company_id = $1::uuid
                       AND coalesce(u.person_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(t.person_id, '00000000-0000-0000-0000-000000000000'::uuid) AND u.archived_at IS NULL)`, [keep, dupIds2]);
    // Blank fields of the company that stays come from the duplicates; vendor + customer → both.
    await c.query(
      `UPDATE perfume.contact_companies k SET
         phone = coalesce(nullif(k.phone, ''), (SELECT d.phone FROM perfume.contact_companies d WHERE d.id = ANY($2::uuid[]) AND coalesce(d.phone, '') <> '' LIMIT 1)),
         website = coalesce(nullif(k.website, ''), (SELECT d.website FROM perfume.contact_companies d WHERE d.id = ANY($2::uuid[]) AND coalesce(d.website, '') <> '' LIMIT 1)),
         domain = coalesce(nullif(k.domain, ''), (SELECT d.domain FROM perfume.contact_companies d WHERE d.id = ANY($2::uuid[]) AND coalesce(d.domain, '') <> '' LIMIT 1)),
         address = coalesce(nullif(k.address, ''), (SELECT d.address FROM perfume.contact_companies d WHERE d.id = ANY($2::uuid[]) AND coalesce(d.address, '') <> '' LIMIT 1)),
         owner_name = coalesce(nullif(k.owner_name, ''), (SELECT d.owner_name FROM perfume.contact_companies d WHERE d.id = ANY($2::uuid[]) AND coalesce(d.owner_name, '') <> '' LIMIT 1)),
         linkedin = coalesce(nullif(k.linkedin, ''), (SELECT d.linkedin FROM perfume.contact_companies d WHERE d.id = ANY($2::uuid[]) AND coalesce(d.linkedin, '') <> '' LIMIT 1)),
         role = CASE
           WHEN (SELECT bool_or(x.role IN ('vendor', 'both')) FROM perfume.contact_companies x WHERE x.id = ANY($3::uuid[]))
            AND (SELECT bool_or(x.role IN ('customer', 'both')) FROM perfume.contact_companies x WHERE x.id = ANY($3::uuid[])) THEN 'both'
           ELSE coalesce(k.role, (SELECT d.role FROM perfume.contact_companies d WHERE d.id = ANY($2::uuid[]) AND d.role IS NOT NULL LIMIT 1)) END,
         updated_at = now()
       WHERE k.id = $1::uuid`, [keep, dupIds2, [keep, ...dupIds2]]);
    await c.query(`UPDATE perfume.contact_companies SET archived_at = now(), merged_into_id = $1::uuid, merged_at = now(), updated_at = now() WHERE id = ANY($2::uuid[])`, [keep, dupIds2]);
    await logEvents(c, uid, [
      ...dups.map((m) => ({ entity: "company" as const, entity_id: m.id, company_id: keep, action: "merged_into", detail: { into: keep, name: keepName, city: m.city, ...(reason ? { reason } : {}) } })),
      { entity: "company" as const, entity_id: keep, company_id: keep, action: "merged_from", detail: { companies: dupIds2.length, ids: dupIds2 } },
    ]);
  return dupIds2.length;
}

export async function mergeDuplicateGroups(c: pg.PoolClient, uid: string, keys: string[]) {
  let merged = 0, groupsDone = 0;
  const kept: string[] = [];
  for (const key of keys) {
    const [g] = await duplicateGroups(c, { key });
    if (!g || !g.merge.length) continue;
    merged += await mergeCompanies(c, uid, g.keep.id, g.merge.map((m) => m.id));
    groupsDone += 1; kept.push(g.keep.id);
  }
  return { groups: groupsDone, merged, kept };
}

/** The locations of a company: the records merged into it (each keeps its own address / city / phone). */
export async function companyLocations(c: Q, companyId: string) {
  return (await c.query(
    `SELECT id::text, name, address, city, state, zip, country, phone, merged_at::text FROM perfume.contact_companies
      WHERE merged_into_id = $1::uuid ORDER BY state NULLS LAST, city NULLS LAST, name`, [companyId])).rows;
}
