/**
 * LEAD 443.134 #1 — ONE running "Due to / from <party>" account per related party, created by the app.
 *
 * Owner standing rule (443.59 / RULING 443.62 #3-#4, 202615560900): every related party has ONE running ledger account,
 * "Due to / from <party>", carrying a debit or a credit balance, under 2410 Owner / Related-Party Loan Payable. Until this
 * file the app had no way to create one: the four on USMCA (2410-00-001..004) were made by hand in the chart of accounts
 * and linked to their party only by name and by the owner's Relay card map, so a party with no account yet (vendor Alberto
 * Lozano, Relay card 1993) was refused by name and waited on the owner.
 *
 * ensureRelatedPartyAccount is the ONE writer:
 *   - the party is a vendor of the SAME company (active);
 *   - idempotent: the party's existing link (accounting.related_party_accounts) is returned as is; an unlinked account
 *     already named exactly "Due to / from <vendor name>" under 2410 is ADOPTED (linked), never duplicated;
 *   - otherwise a new Liability account is created under the 2410 parent, numbered 2410-00-nnn with nnn = the next after
 *     the highest ever used under 2410 in this company (live or retired — a retired number is never reused), serialized
 *     per company with a transaction-scoped advisory lock (same discipline as allocateDriverSubAccountNnn, ROUND 389.3);
 *   - the link row, the owner's Relay card-map rows for this party that still name no account, and one audit event are
 *     written in the same transaction. Nothing posts.
 */
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { PARTY_ACCOUNT_PREFIX } from "./party-ledger.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** The CoA parent the related-party accounts sit under (202611240000: 2410 Owner / Related-Party Loan Payable). */
export const RELATED_PARTY_PARENT_ACCOUNT_NUMBER = "2410";
export const RELATED_PARTY_ACCOUNT_NUMBER_RE = /^2410-00-([0-9]{3})$/;

export class RelatedPartyAccountError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) {
    super(message);
    this.name = "RelatedPartyAccountError";
  }
}

export type EnsureRelatedPartyAccountInput = {
  operatingCompanyId: string;
  partyType: "vendor";
  partyId: string;
  actorUserId: string;
  dryRun: boolean;
};

export type EnsureRelatedPartyAccountResult = {
  dry_run: boolean;
  outcome: "exists" | "adopted" | "created" | "planned_adopt" | "planned_create";
  party_type: "vendor";
  party_id: string;
  party_name: string;
  account_id: string | null;
  account_number: string;
  account_name: string;
  card_map_rows_linked: number;
};

/** "2410-00-" + the next 3-digit number after the highest used (pure; exported for the guard's selftest). */
export function nextRelatedPartyAccountNumber(usedNumbers: string[]): string {
  let max = 0;
  for (const n of usedNumbers) {
    const m = RELATED_PARTY_ACCOUNT_NUMBER_RE.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (max >= 999) throw new RelatedPartyAccountError("related_party_number_space_exhausted", "2410-00-999 is the last related-party number");
  return `${RELATED_PARTY_PARENT_ACCOUNT_NUMBER}-00-${String(max + 1).padStart(3, "0")}`;
}

export function relatedPartyAccountName(partyName: string): string {
  return `${PARTY_ACCOUNT_PREFIX}${partyName.trim()}`;
}

export async function ensureRelatedPartyAccount(
  client: DbClient,
  input: EnsureRelatedPartyAccountInput
): Promise<EnsureRelatedPartyAccountResult> {
  const opco = input.operatingCompanyId;
  if (input.partyType !== "vendor") {
    throw new RelatedPartyAccountError("related_party_type_unsupported", `party type ${input.partyType} is not supported`, 400);
  }
  const vendor = (
    await client.query<{ id: string; vendor_name: string }>(
      `SELECT id::text, vendor_name FROM mdata.vendors
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL`,
      [input.partyId, opco]
    )
  ).rows[0];
  if (!vendor) {
    throw new RelatedPartyAccountError("related_party_not_found", `vendor ${input.partyId} is not an active vendor of this company`, 404);
  }
  const name = relatedPartyAccountName(vendor.vendor_name);

  // One allocation at a time per company.
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('related-party-account:' || $1::text))`, [opco]);

  const linked = (
    await client.query<{ id: string; account_number: string; account_name: string }>(
      `SELECT a.id::text, a.account_number, a.account_name
         FROM accounting.related_party_accounts l
         JOIN catalogs.accounts a ON a.id = l.account_id AND a.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.party_vendor_id = $2::uuid`,
      [opco, vendor.id]
    )
  ).rows[0];
  if (linked) {
    const cards = input.dryRun ? 0 : await linkCardMapRows(client, opco, vendor.id, linked.account_number);
    return {
      dry_run: input.dryRun, outcome: "exists", party_type: "vendor", party_id: vendor.id, party_name: vendor.vendor_name,
      account_id: linked.id, account_number: linked.account_number, account_name: linked.account_name, card_map_rows_linked: cards,
    };
  }

  const parents = (
    await client.query<{ id: string }>(
      `SELECT id::text FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`,
      [opco, RELATED_PARTY_PARENT_ACCOUNT_NUMBER]
    )
  ).rows;
  if (parents.length !== 1) {
    throw new RelatedPartyAccountError(
      "related_party_parent_missing",
      `the chart of accounts must hold exactly one active ${RELATED_PARTY_PARENT_ACCOUNT_NUMBER} Owner / Related-Party Loan Payable (found ${parents.length})`
    );
  }
  const parentId = parents[0]!.id;

  // An account already carrying this party's name under 2410, not linked to any party: adopt it (never a duplicate).
  const named = (
    await client.query<{ id: string; account_number: string; account_name: string; linked_other: boolean }>(
      `SELECT a.id::text, a.account_number, a.account_name,
              EXISTS (SELECT 1 FROM accounting.related_party_accounts l
                       WHERE l.operating_company_id = a.operating_company_id AND l.account_id = a.id) AS linked_other
         FROM catalogs.accounts a
        WHERE a.operating_company_id = $1::uuid AND a.parent_account_id = $2::uuid
          AND a.deactivated_at IS NULL AND lower(a.account_name) = lower($3)`,
      [opco, parentId, name]
    )
  ).rows;
  if (named.length > 1) {
    throw new RelatedPartyAccountError("related_party_account_ambiguous", `${named.length} active accounts are named "${name}" — the owner deactivates the extra one`);
  }
  if (named[0]?.linked_other) {
    throw new RelatedPartyAccountError("related_party_account_owned_by_other_party", `"${name}" (${named[0].account_number}) is already another party's account`);
  }

  const used = (
    await client.query<{ account_number: string }>(
      `SELECT account_number FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid AND account_number ~ '^2410-00-[0-9]{3}$'`,
      [opco]
    )
  ).rows.map((r) => r.account_number);
  const target = named[0]
    ? { id: named[0].id, account_number: named[0].account_number, account_name: named[0].account_name }
    : { id: null as string | null, account_number: nextRelatedPartyAccountNumber(used), account_name: name };

  if (input.dryRun) {
    return {
      dry_run: true, outcome: named[0] ? "planned_adopt" : "planned_create", party_type: "vendor", party_id: vendor.id,
      party_name: vendor.vendor_name, account_id: target.id, account_number: target.account_number, account_name: target.account_name,
      card_map_rows_linked: 0,
    };
  }

  let accountId = target.id;
  if (!accountId) {
    accountId = (
      await client.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (
           operating_company_id, account_number, account_name, account_type, account_subtype, parent_account_id,
           is_postable, currency_code, notes, created_by_user_id, updated_by_user_id
         ) VALUES ($1::uuid, $2, $3, 'Liability', 'OtherCurrentLiability', $4::uuid, true, 'USD', $5, $6::uuid, $6::uuid)
         RETURNING id::text`,
        [
          opco, target.account_number, target.account_name, parentId,
          `Running related-party account (LEAD 443.134): created by the app for vendor ${vendor.vendor_name}.`,
          input.actorUserId,
        ]
      )
    ).rows[0]!.id;
  }
  await client.query(
    `INSERT INTO accounting.related_party_accounts (operating_company_id, party_vendor_id, account_id, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
    [opco, vendor.id, accountId, input.actorUserId]
  );
  const cards = await linkCardMapRows(client, opco, vendor.id, target.account_number);
  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "accounting.related_party_account_ensured",
    {
      operating_company_id: opco, party_type: "vendor", party_vendor_id: vendor.id, party_name: vendor.vendor_name,
      account_id: accountId, account_number: target.account_number, account_name: target.account_name,
      outcome: target.id ? "adopted" : "created", card_map_rows_linked: cards,
    },
    "info",
    "LEAD-443.134"
  );
  return {
    dry_run: false, outcome: target.id ? "adopted" : "created", party_type: "vendor", party_id: vendor.id,
    party_name: vendor.vendor_name, account_id: accountId, account_number: target.account_number,
    account_name: target.account_name, card_map_rows_linked: cards,
  };
}

/** The owner's Relay card-map rows for this party that name no account yet now name the party's account. */
async function linkCardMapRows(client: DbClient, opco: string, vendorId: string, accountNumber: string): Promise<number> {
  const exists = (await client.query<{ present: boolean }>(`SELECT to_regclass('integrations.relay_company_cards') IS NOT NULL AS present`)).rows[0]?.present;
  if (!exists) return 0;
  const res = await client.query<{ card_last4: string }>(
    `UPDATE integrations.relay_company_cards
        SET funding_account_number = $3, updated_at = now()
      WHERE operating_company_id = $1::uuid AND party_vendor_id = $2::uuid AND funding_kind = 'party'
        AND funding_account_number IS NULL AND voided_at IS NULL
      RETURNING card_last4`,
    [opco, vendorId, accountNumber]
  );
  return res.rows.length;
}

/** A non-Owner call is refused and the refusal is audited (same shape as the bill stamp routes). */
export async function refuseNonOwnerRelatedPartyAccount(
  client: DbClient,
  actor: { userId: string; role?: string | null },
  opco: string
): Promise<void> {
  if (actor.role === "Owner") return;
  await appendCrudAudit(
    client as never,
    actor.userId,
    "accounting.related_party_account_refused_non_owner",
    { resource_type: "accounting.related_party_accounts", operating_company_id: opco, role: actor.role ?? null },
    "warning",
    "LEAD-443.134-OWNER-ONLY"
  );
  throw new RelatedPartyAccountError("owner_only", "Only the Owner can create a related party's account.", 403);
}
