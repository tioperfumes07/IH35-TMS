/**
 * GAP-53 — Bank account multi-company drift audit.
 * Audit-first pattern: detect OCI mismatches, manual reassignment via Owner flow.
 */
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../../audit/crud-audit.js";

/** Jorge locked truth table: Wells Fargo last-4 → expected operating company code. */
export const BANK_ACCOUNT_TRUTH_TABLE: Record<string, string> = {
  "6103": "TRANSP",
  "6129": "TRANSP",
  "6137": "TRANSP",
};

export type AuditSeverity = "critical" | "warning" | "info";

export interface BankAccountCompanyMismatch {
  account_uuid: string;
  bank_name: string;
  account_last4: string;
  current_oci: string;
  expected_oci: string;
  evidence: string;
  severity: AuditSeverity;
}

function resolveExpectedOci(last4: string, bankName: string): string | null {
  const key = last4.trim();
  if (BANK_ACCOUNT_TRUTH_TABLE[key]) return BANK_ACCOUNT_TRUTH_TABLE[key];
  if (bankName.toLowerCase().includes("wells fargo") && ["6103", "6129", "6137"].includes(key)) {
    return "TRANSP";
  }
  return null;
}

function companyCodeFromId(client: PoolClient, oci: string): Promise<string | null> {
  return client
    .query<{ code: string }>(
      `SELECT code FROM org.companies WHERE id = $1::uuid LIMIT 1`,
      [oci]
    )
    .then((r) => r.rows[0]?.code ?? null);
}

export async function auditBankAccountCompanyAssignment(
  client: PoolClient,
  operatingCompanyId?: string
): Promise<BankAccountCompanyMismatch[]> {
  const params: unknown[] = [];
  let filter = "";
  if (operatingCompanyId) {
    filter = "WHERE ba.operating_company_id = $1::uuid";
    params.push(operatingCompanyId);
  }

  const res = await client.query<{
    id: string;
    bank_name: string;
    account_mask: string | null;
    operating_company_id: string;
    company_code: string;
  }>(
    `SELECT ba.id::text, ba.bank_name, ba.account_mask, ba.operating_company_id::text,
            c.code AS company_code
     FROM banking.bank_accounts ba
     JOIN org.companies c ON c.id = ba.operating_company_id
     ${filter}`,
    params
  );

  const mismatches: BankAccountCompanyMismatch[] = [];
  for (const row of res.rows) {
    const last4 = (row.account_mask ?? "").slice(-4);
    const expected = resolveExpectedOci(last4, row.bank_name);
    if (!expected) continue;
    if (row.company_code !== expected) {
      mismatches.push({
        account_uuid: row.id,
        bank_name: row.bank_name,
        account_last4: last4,
        current_oci: row.company_code,
        expected_oci: expected,
        evidence: `Wells Fargo ••${last4} belongs to ${expected} per locked truth table`,
        severity: "critical",
      });
    }
  }
  return mismatches;
}

export async function applyCompanyReassignment(
  client: PoolClient,
  accountUuid: string,
  newOperatingCompanyId: string,
  userUuid: string
): Promise<{ updated: boolean }> {
  const ociCode = await companyCodeFromId(client, newOperatingCompanyId);
  const acct = await client.query<{ account_mask: string | null; bank_name: string }>(
    `SELECT account_mask, bank_name FROM banking.bank_accounts WHERE id = $1::uuid LIMIT 1`,
    [accountUuid]
  );
  const row = acct.rows[0];
  if (!row) return { updated: false };

  const last4 = (row.account_mask ?? "").slice(-4);
  const expected = resolveExpectedOci(last4, row.bank_name);
  if (expected && ociCode !== expected) {
    throw new Error(`reassignment_target_mismatch: expected ${expected}, got ${ociCode}`);
  }

  const old = await client.query<{ operating_company_id: string }>(
    `SELECT operating_company_id::text FROM banking.bank_accounts WHERE id = $1::uuid`,
    [accountUuid]
  );
  const oldOci = old.rows[0]?.operating_company_id;
  if (!oldOci) return { updated: false };

  await client.query(
    `UPDATE banking.bank_accounts SET operating_company_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`,
    [accountUuid, newOperatingCompanyId]
  );

  await appendCrudAudit(
    client,
    userUuid,
    "WF-064.bank_account_company_reassignment",
    {
      resource_type: "banking.bank_accounts",
      resource_id: accountUuid,
      old_operating_company_id: oldOci,
      new_operating_company_id: newOperatingCompanyId,
      account_last4: last4,
    },
    "critical"
  );

  return { updated: true };
}
