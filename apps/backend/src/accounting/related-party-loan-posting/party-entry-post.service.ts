/**
 * RULING 443.65 #2 (443.59 entries a / c / d / e) — posts ONE party entry to the GL through the shared JE writer.
 *
 *   party_transfer_out (a, e)  USMCA sends the party money / repays it   Dr Due to / from <party>  / Cr the bank account
 *   party_paid_vendor  (c, d)  the party pays a USMCA vendor / expense   Dr 2510 or the expense    / Cr Due to / from <party>
 *
 * Entry b (the party's card pays Relay: Dr 1295 + Dr 5005 / Cr Due to / from) is NOT here — it is CC-2's Relay deposit
 * poster (relay-deposit-post.service.ts, kind "party"). One engine per movement, no second path.
 *
 * The legs come from buildRelatedPartyLoanPostings (poster.service.ts) and the counter side from resolveCounterAccount —
 * the same builder the balance-invariant test and verify-related-party-loan-integrity check. Both legs name the party
 * (entity = the party vendor); the posting-line writer refuses a line on a party account without one. Flag-gated per
 * entity (RELATED_PARTY_LOAN_GL_POSTING_ENABLED). Idempotent: an entry with je_id is already posted, and the je_id stamp
 * is conditional (je_id IS NULL), so a replay posts nothing twice.
 */
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { PARTY_ENTRY_TARGET_TYPES } from "./create-entry.service.js";
import { buildRelatedPartyLoanPostings, postingEnabled, resolveCounterAccount } from "./poster.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type JePosting = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
  source_transaction_type: string;
  source_transaction_id: string;
  entity_uuid: string;
  entity_type: "vendor";
};

export type PartyEntryJeCreator = (
  client: DbClient,
  input: {
    operating_company_id: string;
    entry_date: string;
    memo: string;
    source: "auto";
    source_transaction_type: string;
    source_transaction_id: string;
    postings: JePosting[];
  },
  actor: { userId: string; role: string }
) => Promise<{ id: string }>;

export type PartyEntryPostResult =
  | { outcome: "posted"; entry_id: string; display_id: string; journal_entry_id: string; amount_cents: number }
  | { outcome: "already_posted"; entry_id: string; journal_entry_id: string }
  | { outcome: "refused"; entry_id: string; reason: string };

export const PARTY_ENTRY_SOURCE_TYPE = "related_party_loan";

export async function postPartyEntry(
  client: DbClient,
  args: { operatingCompanyId: string; entryId: string; actorUserId: string; actorRole: string },
  deps: { createJournalEntryOnClient: PartyEntryJeCreator }
): Promise<PartyEntryPostResult> {
  const e = (
    await client.query<{
      id: string; display_id: string; direction: "in" | "out"; target_type: string; account_id: string;
      funding_account_id: string | null; counterparty_id: string | null; counterparty_kind: string;
      counterparty_name: string | null; principal_cents: string; entry_date: string; je_id: string | null;
      reversed_at: string | null;
    }>(
      `SELECT id::text, display_id, direction, target_type, account_id::text, funding_account_id::text,
              counterparty_id::text, counterparty_kind, counterparty_name, principal_cents::text, entry_date::text,
              je_id::text, reversed_at::text
         FROM accounting.related_party_loan_entries
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deleted_at IS NULL
        FOR UPDATE`,
      [args.entryId, args.operatingCompanyId]
    )
  ).rows[0];
  const refuse = (reason: string): PartyEntryPostResult => ({ outcome: "refused", entry_id: args.entryId, reason });
  if (!e) return refuse("entry_not_found");
  if (e.je_id) return { outcome: "already_posted", entry_id: e.id, journal_entry_id: e.je_id };
  if (e.reversed_at) return refuse("entry_reversed");
  if (!(PARTY_ENTRY_TARGET_TYPES as readonly string[]).includes(e.target_type)) return refuse(`not_a_party_entry (${e.target_type})`);
  const expected = e.target_type === "party_transfer_out" ? "out" : "in";
  if (e.direction !== expected) return refuse(`${e.target_type}_requires_direction_${expected}`);
  if (!(await postingEnabled(client, args.operatingCompanyId))) return refuse("flag_off");

  // The party entity — required on every related-party posting (443.59 item 8).
  if (e.counterparty_kind !== "vendor" || !e.counterparty_id) return refuse("party_entity_missing");
  const party = (
    await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL`,
      [e.counterparty_id, args.operatingCompanyId]
    )
  ).rows[0];
  if (!party) return refuse("party_entity_missing");

  const counter = await resolveCounterAccount(client, args.operatingCompanyId, e.direction, e.funding_account_id);
  if (!counter.ok) return refuse(`counter_account_unresolved (${counter.missingRole})`);

  const amount = Number(e.principal_cents);
  if (!(amount > 0)) return refuse("zero_amount");
  const memo =
    e.target_type === "party_transfer_out"
      ? `${e.display_id} — USMCA to ${e.counterparty_name ?? "party"} (Due to / from)`
      : `${e.display_id} — ${e.counterparty_name ?? "party"} paid for USMCA (Due to / from)`;
  const src = { source_transaction_type: PARTY_ENTRY_SOURCE_TYPE, source_transaction_id: e.id };
  const entity = { entity_uuid: party.id, entity_type: "vendor" as const };
  const postings: JePosting[] = buildRelatedPartyLoanPostings(e.direction, e.account_id, counter.accountId, amount, memo).map(
    (p) => ({ ...p, ...src, ...entity })
  );

  const je = await deps.createJournalEntryOnClient(
    client,
    { operating_company_id: args.operatingCompanyId, entry_date: e.entry_date, memo, source: "auto", ...src, postings },
    { userId: args.actorUserId, role: args.actorRole }
  );
  const stamped = await client.query<{ id: string }>(
    `UPDATE accounting.related_party_loan_entries
        SET je_id = $2::uuid, updated_at = now(), updated_by_user_id = $3::uuid
      WHERE id = $1::uuid AND operating_company_id = $4::uuid AND je_id IS NULL
      RETURNING id::text`,
    [e.id, je.id, args.actorUserId, args.operatingCompanyId]
  );
  if (!stamped.rows[0]) throw new Error(`party_entry_post_race: ${e.id} was posted by another call — rolled back`);

  await appendCrudAudit(
    client as never,
    args.actorUserId,
    "accounting.related_party_loan.posted",
    {
      resource_type: "accounting.related_party_loan_entries",
      resource_id: e.id,
      operating_company_id: args.operatingCompanyId,
      display_id: e.display_id,
      target_type: e.target_type,
      journal_entry_id: je.id,
      amount_cents: amount,
      party_vendor_id: party.id,
    },
    "info",
    "LOAN-02"
  );
  return { outcome: "posted", entry_id: e.id, display_id: e.display_id, journal_entry_id: je.id, amount_cents: amount };
}

/**
 * Record the owner-confirmed pair (443.59 item 5: nothing auto-pairs): a party_transfer_out names the party funding it
 * answers. Only when it names none yet; the funding must be a paid_direct_vendor / party_paid_vendor on the SAME party
 * account. Audited. Posts nothing.
 */
export async function pairPartyTransfer(
  client: DbClient,
  args: { operatingCompanyId: string; transferEntryId: string; fundingEntryId: string; actorUserId: string }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rows = (
    await client.query<{ id: string; target_type: string; account_id: string; target_id: string | null }>(
      `SELECT id::text, target_type, account_id::text, target_id::text FROM accounting.related_party_loan_entries
        WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid AND deleted_at IS NULL AND reversed_at IS NULL`,
      [[args.transferEntryId, args.fundingEntryId], args.operatingCompanyId]
    )
  ).rows;
  const t = rows.find((r) => r.id === args.transferEntryId);
  const f = rows.find((r) => r.id === args.fundingEntryId);
  if (!t || t.target_type !== "party_transfer_out") return { ok: false, reason: "transfer_not_a_party_transfer_out" };
  if (!f || !["paid_direct_vendor", "party_paid_vendor"].includes(f.target_type)) return { ok: false, reason: "funding_not_a_party_funding" };
  if (t.account_id !== f.account_id) return { ok: false, reason: "different_party_accounts" };
  if (t.target_id) return { ok: false, reason: "transfer_already_paired" };
  const upd = await client.query<{ id: string }>(
    `UPDATE accounting.related_party_loan_entries SET target_id = $2::uuid, updated_at = now(), updated_by_user_id = $3::uuid
      WHERE id = $1::uuid AND operating_company_id = $4::uuid AND target_id IS NULL RETURNING id::text`,
    [t.id, f.id, args.actorUserId, args.operatingCompanyId]
  );
  if (!upd.rows[0]) return { ok: false, reason: "transfer_already_paired" };
  await appendCrudAudit(
    client as never,
    args.actorUserId,
    "accounting.related_party_loan.paired",
    {
      resource_type: "accounting.related_party_loan_entries",
      resource_id: t.id,
      operating_company_id: args.operatingCompanyId,
      funding_entry_id: f.id,
    },
    "info",
    "LOAN-02"
  );
  return { ok: true };
}
