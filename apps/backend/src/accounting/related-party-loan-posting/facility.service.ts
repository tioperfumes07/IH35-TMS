/**
 * Option 1 related-party LOC — one running facility per (company, 2410-family account / person).
 *
 * ROUND 443.22-2b. Facilities are the register header; advances and repayments live on
 * accounting.related_party_loan_entries under facility_id. This module never posts GL and never
 * invents a second loan engine — create / bank Loan action / repayment all call ensureFacility.
 */

type PgClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type EnsureFacilityInput = {
  companyId: string;
  accountId: string;
  counterpartyName: string | null | undefined;
  relationship: string;
  actorUserUuid: string;
};

export type FacilityRollupRow = {
  id: string;
  operating_company_id: string;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  counterparty_name: string | null;
  relationship: string;
  status: string;
  principal_advanced_cents: number;
  principal_repaid_cents: number;
  open_balance_cents: number;
  accrued_interest_cents: number;
  advance_count: number;
  repayment_count: number;
  created_at: string | null;
};

/**
 * Idempotent: one live facility per company + CoA account. Name/relationship refresh on re-use.
 */
export async function ensureRelatedPartyLoanFacility(
  client: PgClient,
  input: EnsureFacilityInput
): Promise<string> {
  const name = (input.counterpartyName ?? "").trim() || null;
  const res = await client.query(
    `INSERT INTO accounting.related_party_loan_facilities
       (operating_company_id, account_id, counterparty_name, relationship, status, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'open', $5::uuid)
     ON CONFLICT (operating_company_id, account_id) WHERE deleted_at IS NULL AND is_active
     DO UPDATE SET
       counterparty_name = COALESCE(EXCLUDED.counterparty_name, accounting.related_party_loan_facilities.counterparty_name),
       relationship = COALESCE(EXCLUDED.relationship, accounting.related_party_loan_facilities.relationship),
       updated_by_user_id = EXCLUDED.created_by_user_id,
       updated_at = now()
     RETURNING id::text AS facility_id`,
    [input.companyId, input.accountId, name, input.relationship, input.actorUserUuid]
  );
  return String((res.rows[0] as { facility_id: string }).facility_id);
}

/** Mint RPL-YYYY-NNNN display id for an advance / repayment document (company-scoped, year series). */
export async function allocateRelatedPartyLoanDisplayId(
  client: PgClient,
  companyId: string,
  at: Date = new Date()
): Promise<string> {
  const year = at.getUTCFullYear();
  const seqRes = await client.query(
    `SELECT COALESCE(MAX(
       CASE WHEN display_id ~ ('^RPL-' || $2::text || '-[0-9]+$')
            THEN NULLIF(split_part(display_id, '-', 3), '')::int END
     ), 0)::int + 1 AS next_n
       FROM accounting.related_party_loan_entries
      WHERE operating_company_id = $1::uuid`,
    [companyId, String(year)]
  );
  const nextN = Number((seqRes.rows[0] as { next_n?: number }).next_n ?? 1);
  return `RPL-${year}-${String(nextN).padStart(4, "0")}`;
}

/**
 * ROUND 443.22-2d — open principal on a facility (advanced − repaid). Used to STOP overpay on
 * bank_repayment / repayment creates. Never invents balance — same rollup math as the register.
 */
export async function getFacilityOpenBalanceCents(
  client: PgClient,
  companyId: string,
  facilityId: string
): Promise<number> {
  const res = await client.query(
    `SELECT
       COALESCE(SUM(
         CASE
           WHEN e.status = 'reversed' OR e.deleted_at IS NOT NULL THEN 0
           WHEN e.document_kind = 'repayment' OR e.target_type IN ('repayment', 'bank_repayment')
             THEN 0
           ELSE e.principal_cents
         END
       ), 0)::bigint AS principal_advanced_cents,
       COALESCE(SUM(
         CASE
           WHEN e.status = 'reversed' OR e.deleted_at IS NOT NULL THEN 0
           WHEN e.document_kind = 'repayment' OR e.target_type IN ('repayment', 'bank_repayment')
             THEN e.principal_cents
           ELSE 0
         END
       ), 0)::bigint AS principal_repaid_cents
       FROM accounting.related_party_loan_facilities f
       LEFT JOIN accounting.related_party_loan_entries e
         ON e.facility_id = f.id AND e.operating_company_id = f.operating_company_id
      WHERE f.id = $1::uuid
        AND f.operating_company_id = $2::uuid
        AND f.deleted_at IS NULL
        AND f.is_active
      GROUP BY f.id`,
    [facilityId, companyId]
  );
  if (!res.rows[0]) return 0;
  const advanced = Number(res.rows[0].principal_advanced_cents ?? 0);
  const repaid = Number(res.rows[0].principal_repaid_cents ?? 0);
  return advanced - repaid;
}

/**
 * Finance → Loans & Advances facility register: one row per person with advanced / repaid / open /
 * accrued interest, entity-scoped.
 */
export async function listRelatedPartyLoanFacilities(
  client: PgClient,
  companyId: string
): Promise<FacilityRollupRow[]> {
  const res = await client.query(
    `SELECT f.id::text,
            f.operating_company_id::text,
            f.account_id::text,
            a.account_number,
            a.account_name,
            f.counterparty_name,
            f.relationship,
            f.status,
            f.created_at::text,
            COALESCE(SUM(
              CASE
                WHEN e.id IS NULL THEN 0
                WHEN e.status = 'reversed' OR e.deleted_at IS NOT NULL THEN 0
                WHEN e.document_kind = 'repayment' OR e.target_type IN ('repayment', 'bank_repayment')
                  THEN 0
                ELSE e.principal_cents
              END
            ), 0)::bigint AS principal_advanced_cents,
            COALESCE(SUM(
              CASE
                WHEN e.id IS NULL THEN 0
                WHEN e.status = 'reversed' OR e.deleted_at IS NOT NULL THEN 0
                WHEN e.document_kind = 'repayment' OR e.target_type IN ('repayment', 'bank_repayment')
                  THEN e.principal_cents
                ELSE 0
              END
            ), 0)::bigint AS principal_repaid_cents,
            COUNT(e.id) FILTER (
              WHERE e.deleted_at IS NULL AND e.status IS DISTINCT FROM 'reversed'
                AND e.document_kind IS DISTINCT FROM 'repayment'
                AND e.target_type IS DISTINCT FROM 'repayment'
                AND e.target_type IS DISTINCT FROM 'bank_repayment'
            )::int AS advance_count,
            COUNT(e.id) FILTER (
              WHERE e.deleted_at IS NULL AND e.status IS DISTINCT FROM 'reversed'
                AND (e.document_kind = 'repayment' OR e.target_type IN ('repayment', 'bank_repayment'))
            )::int AS repayment_count,
            COALESCE((
              SELECT SUM(s.interest_cents)::bigint
                FROM accounting.related_party_loan_schedule s
                JOIN accounting.related_party_loan_entries le ON le.id = s.loan_id
               WHERE le.facility_id = f.id
                 AND le.operating_company_id = f.operating_company_id
                 AND le.deleted_at IS NULL
                 AND le.status IS DISTINCT FROM 'reversed'
                 AND s.is_active AND NOT s.posted
            ), 0)::bigint AS accrued_interest_cents
       FROM accounting.related_party_loan_facilities f
       LEFT JOIN catalogs.accounts a
         ON a.id = f.account_id AND a.operating_company_id = f.operating_company_id
       LEFT JOIN accounting.related_party_loan_entries e
         ON e.facility_id = f.id AND e.operating_company_id = f.operating_company_id
      WHERE f.operating_company_id = $1::uuid
        AND f.deleted_at IS NULL
        AND f.is_active
      GROUP BY f.id, a.account_number, a.account_name
      ORDER BY COALESCE(f.counterparty_name, a.account_name, a.account_number, f.id::text)`,
    [companyId]
  );

  return res.rows.map((r) => {
    const advanced = Number(r.principal_advanced_cents ?? 0);
    const repaid = Number(r.principal_repaid_cents ?? 0);
    return {
      id: String(r.id),
      operating_company_id: String(r.operating_company_id),
      account_id: String(r.account_id),
      account_number: (r.account_number as string | null) ?? null,
      account_name: (r.account_name as string | null) ?? null,
      counterparty_name: (r.counterparty_name as string | null) ?? null,
      relationship: String(r.relationship),
      status: String(r.status),
      principal_advanced_cents: advanced,
      principal_repaid_cents: repaid,
      open_balance_cents: advanced - repaid,
      accrued_interest_cents: Number(r.accrued_interest_cents ?? 0),
      advance_count: Number(r.advance_count ?? 0),
      repayment_count: Number(r.repayment_count ?? 0),
      created_at: (r.created_at as string | null) ?? null,
    };
  });
}
