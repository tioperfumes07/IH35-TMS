/**
 * 0280-15 — Pending approvals ↔ GL linkage behavioral tests (read-only).
 *
 * Forensic: no migrated JE approval-status column → control_available=false.
 * Active-path tests use capabilityOverride (never invents a phantom warning table).
 */

import { describe, expect, it } from "vitest";
import {
  buildApprovalItemFromCandidate,
  buildPendingApprovalsGl,
  isJeExcludedFromPendingQueue,
  journalEntryDetailHref,
  probeJeApprovalCapability,
  resolveRequiredApprover,
  type JeApprovalCapability,
  type PendingApprovalItem,
} from "../pending-approvals-gl.service.js";

const OCI_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OCI_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const JE_1 = "11111111-1111-4111-8111-111111111111";
const JE_2 = "22222222-2222-4222-8222-222222222222";
const JE_VOID = "33333333-3333-4333-8333-333333333333";
const JE_REV = "44444444-4444-4444-8444-444444444444";
const ACCT_CASH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ACCT_REV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const USER_CREATOR = "bbbbbbbb-1111-4111-8111-111111111111";
const USER_APPROVER = "bbbbbbbb-2222-4222-8222-222222222222";

type RowBag = Record<string, unknown>;

function mockClient(handlers: Array<{ match: (sql: string, values?: unknown[]) => boolean; rows: RowBag[] }>) {
  return {
    async query<T = RowBag>(sql: string, values?: unknown[]) {
      for (const h of handlers) {
        if (h.match(sql, values)) return { rows: h.rows as T[] };
      }
      throw new Error(`Unexpected SQL in test:\n${sql}\nvalues=${JSON.stringify(values)}`);
    },
  };
}

function assertNoPii(items: PendingApprovalItem[]) {
  const blob = JSON.stringify(items);
  expect(blob).not.toMatch(/@/);
  expect(blob.toLowerCase()).not.toContain("phone");
  expect(blob.toLowerCase()).not.toContain("email");
}

const PHANTOM_WARNING_TABLE = ["period", "close", "warnings"].join("_");

function assertNoPhantomSource(sqlSeen: string[]) {
  for (const sql of sqlSeen) {
    expect(sql.toLowerCase()).not.toContain(PHANTOM_WARNING_TABLE);
  }
}

const AVAILABLE_CAPABILITY: JeApprovalCapability = {
  journal_entries_present: true,
  postings_present: true,
  approval_status_column: "approval_status",
  approver_user_column: "required_approver_user_id",
  approver_role_column: "required_approver_role",
  has_voided_at: true,
  has_reverses_je_id: true,
  has_reversed_by_je_id: true,
  has_created_at: true,
  has_created_by_user_id: true,
  control_available: true,
  unavailable_reason: null,
  message: "test override",
};

describe("journalEntryDetailHref", () => {
  it("uses direct detail route /accounting/journal-entries/:id", () => {
    expect(journalEntryDetailHref(JE_1)).toBe(`/accounting/journal-entries/${JE_1}`);
    expect(journalEntryDetailHref(JE_1)).not.toContain("?");
    expect(journalEntryDetailHref(JE_1)).not.toContain("warning_id");
  });
});

describe("isJeExcludedFromPendingQueue", () => {
  it("excludes voided_at", () => {
    expect(isJeExcludedFromPendingQueue({ voided_at: "2026-07-01T00:00:00Z" }).excluded).toBe(true);
  });
  it("excludes status=voided", () => {
    expect(isJeExcludedFromPendingQueue({ status: "voided" }).excluded).toBe(true);
  });
  it("excludes reversing entry (reverses_je_id)", () => {
    expect(isJeExcludedFromPendingQueue({ reverses_je_id: JE_1 }).excluded).toBe(true);
  });
  it("excludes already-reversed original (reversed_by_je_id)", () => {
    expect(isJeExcludedFromPendingQueue({ reversed_by_je_id: JE_2 }).excluded).toBe(true);
  });
  it("keeps clean pending candidates", () => {
    expect(isJeExcludedFromPendingQueue({ status: "posted", voided_at: null }).excluded).toBe(false);
  });
});

describe("resolveRequiredApprover", () => {
  it("returns assignment_unresolved when no canonical approver", () => {
    const r = resolveRequiredApprover({
      approverUserId: null,
      approverRole: null,
      creatorUserId: USER_CREATOR,
    });
    expect(r.actor).toBeNull();
    expect(r.assignment_exception?.code).toBe("assignment_unresolved");
    expect(JSON.stringify(r)).not.toContain("Owner");
    expect(JSON.stringify(r)).not.toContain("Administrator");
    expect(JSON.stringify(r)).not.toContain("role-only");
  });

  it("uses canonical user id without inventing role", () => {
    const r = resolveRequiredApprover({
      approverUserId: USER_APPROVER,
      approverRole: null,
      creatorUserId: USER_CREATOR,
    });
    expect(r.actor).toEqual({ user_id: USER_APPROVER, role: null });
    expect(r.maker_checker_violation).toBe(false);
    expect(r.assignment_exception).toBeNull();
  });

  it("flags maker=checker when creator equals approver user", () => {
    const r = resolveRequiredApprover({
      approverUserId: USER_CREATOR,
      approverRole: "Accountant",
      creatorUserId: USER_CREATOR,
    });
    expect(r.maker_checker_violation).toBe(true);
    expect(r.actor?.user_id).toBe(USER_CREATOR);
  });
});

describe("probeJeApprovalCapability", () => {
  it("reports approval_control_unavailable when JE has no migrated approval-status column", async () => {
    const client = mockClient([
      {
        match: (sql, values) => sql.includes("to_regclass") && values?.[0] === "accounting.journal_entries",
        rows: [{ ok: true }],
      },
      {
        match: (sql, values) => sql.includes("to_regclass") && values?.[0] === "accounting.journal_entry_postings",
        rows: [{ ok: true }],
      },
      {
        match: (sql, values) =>
          sql.includes("information_schema.columns") &&
          values?.[0] === "accounting" &&
          values?.[1] === "journal_entries",
        rows: [
          "id",
          "operating_company_id",
          "status",
          "voided_at",
          "reverses_je_id",
          "reversed_by_je_id",
          "created_at",
          "created_by_user_id",
        ].map((column_name) => ({ column_name })),
      },
    ]);
    const cap = await probeJeApprovalCapability(client);
    expect(cap.control_available).toBe(false);
    expect(cap.unavailable_reason).toBe("approval_control_unavailable");
  });

  it("reports required_structure_unavailable when journal_entries missing", async () => {
    const client = mockClient([
      {
        match: (sql, values) => sql.includes("to_regclass") && values?.[0] === "accounting.journal_entries",
        rows: [{ ok: false }],
      },
      {
        match: (sql, values) => sql.includes("to_regclass") && values?.[0] === "accounting.journal_entry_postings",
        rows: [{ ok: false }],
      },
    ]);
    const cap = await probeJeApprovalCapability(client);
    expect(cap.control_available).toBe(false);
    expect(cap.unavailable_reason).toBe("required_structure_unavailable");
  });
});

describe("buildPendingApprovalsGl — control unavailable (production schema)", () => {
  it("never empty-success: control_available false + approval_control_unavailable exception + pending 0", async () => {
    const sqlSeen: string[] = [];
    const client = {
      async query<T = RowBag>(sql: string, values?: unknown[]) {
        sqlSeen.push(sql);
        if (sql.includes("to_regclass") && values?.[0] === "accounting.journal_entries") {
          return { rows: [{ ok: true }] as T[] };
        }
        if (sql.includes("to_regclass") && values?.[0] === "accounting.journal_entry_postings") {
          return { rows: [{ ok: true }] as T[] };
        }
        if (
          sql.includes("information_schema.columns") &&
          values?.[0] === "accounting" &&
          values?.[1] === "journal_entries"
        ) {
          return {
            rows: ["id", "operating_company_id", "status", "voided_at", "created_at"].map((column_name) => ({
              column_name,
            })) as T[],
          };
        }
        throw new Error(`Unexpected SQL:\n${sql}`);
      },
    };

    const result = await buildPendingApprovalsGl(client, OCI_A);
    assertNoPhantomSource(sqlSeen);
    expect(result.control_available).toBe(false);
    expect(result.pending_journal_approvals).toBe(0);
    expect(result.exceptions.some((e) => e.code === "approval_control_unavailable")).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.kind).toBe("approval_control_unavailable");
    assertNoPii(result.items);
  });

  it("does not reference the phantom period-close warning table in executed SQL", async () => {
    const sqlSeen: string[] = [];
    const client = {
      async query<T = RowBag>(sql: string, values?: unknown[]) {
        sqlSeen.push(sql);
        if (sql.includes("to_regclass")) return { rows: [{ ok: true }] as T[] };
        if (sql.includes("information_schema.columns")) {
          return {
            rows: ["id", "operating_company_id", "status"].map((column_name) => ({ column_name })) as T[],
          };
        }
        throw new Error(`Unexpected SQL:\n${sql}`);
      },
    };
    await buildPendingApprovalsGl(client, OCI_A);
    assertNoPhantomSource(sqlSeen);
  });
});

describe("buildApprovalItemFromCandidate", () => {
  it("uses direct detail href and null approver with assignment_unresolved", () => {
    const item = buildApprovalItemFromCandidate({
      operatingCompanyId: OCI_A,
      candidate: {
        id: JE_1,
        status: "posted",
        approval_status: "pending",
        entry_date: "2026-07-01",
        created_at: "2026-07-01T12:00:00Z",
        memo: "test",
        created_by_user_id: USER_CREATOR,
        qbo_journal_entry_id: null,
        display_id: null,
        voided_at: null,
        reverses_je_id: null,
        reversed_by_je_id: null,
        required_approver_user_id: null,
        required_approver_role: null,
      },
      postings: {
        debit_total_cents: 100,
        credit_total_cents: 100,
        accounts: [
          {
            account_id: ACCT_CASH,
            account_number: "1000",
            account_name: "Cash",
            debit_cents: 100,
            credit_cents: 0,
            coa_role: "cash",
          },
          {
            account_id: ACCT_REV,
            account_number: "4000",
            account_name: "Revenue",
            debit_cents: 0,
            credit_cents: 100,
            coa_role: null,
          },
        ],
      },
      userRoles: new Map([[USER_CREATOR, "Accountant"]]),
    });
    expect(item.kind).toBe("journal_approval");
    expect(item.forward_drill.href).toBe(`/accounting/journal-entries/${JE_1}`);
    expect(item.reverse_drill.href).toBe(`/accounting/journal-entries/${JE_1}`);
    expect(item.required_approver).toBeNull();
    expect(item.assignment_exception?.code).toBe("assignment_unresolved");
    expect(item.governed_accounts.some((a) => a.coa_role === "cash")).toBe(true);
  });

  it("classifies voided/reversed as excluded (not pending)", () => {
    const voided = buildApprovalItemFromCandidate({
      operatingCompanyId: OCI_A,
      candidate: {
        id: JE_VOID,
        status: "voided",
        approval_status: "pending",
        entry_date: "2026-07-01",
        created_at: "2026-07-01T12:00:00Z",
        memo: null,
        created_by_user_id: null,
        qbo_journal_entry_id: null,
        display_id: null,
        voided_at: "2026-07-02T00:00:00Z",
        reverses_je_id: null,
        reversed_by_je_id: null,
        required_approver_user_id: USER_APPROVER,
        required_approver_role: null,
      },
      postings: null,
      userRoles: new Map(),
    });
    expect(voided.kind).toBe("excluded_voided_or_reversed");
    expect(voided.voided).toBe(true);

    const reversed = buildApprovalItemFromCandidate({
      operatingCompanyId: OCI_A,
      candidate: {
        id: JE_REV,
        status: "posted",
        approval_status: "pending",
        entry_date: "2026-07-01",
        created_at: "2026-07-01T12:00:00Z",
        memo: null,
        created_by_user_id: null,
        qbo_journal_entry_id: null,
        display_id: null,
        voided_at: null,
        reverses_je_id: null,
        reversed_by_je_id: JE_2,
        required_approver_user_id: USER_APPROVER,
        required_approver_role: null,
      },
      postings: null,
      userRoles: new Map(),
    });
    expect(reversed.kind).toBe("excluded_voided_or_reversed");
    expect(reversed.reversed).toBe(true);
  });
});

describe("buildPendingApprovalsGl — active path (capabilityOverride)", () => {
  it("excludes voided/reversed from pending count; orders created_at+id; scopes entity", async () => {
    const sqlSeen: string[] = [];
    const client = mockClient([
      {
        match: (sql, values) =>
          sql.includes("information_schema.columns") &&
          values?.[0] === "accounting" &&
          values?.[1] === "journal_entries",
        rows: [
          "id",
          "operating_company_id",
          "status",
          "approval_status",
          "required_approver_user_id",
          "required_approver_role",
          "voided_at",
          "reverses_je_id",
          "reversed_by_je_id",
          "created_at",
          "created_by_user_id",
          "entry_date",
          "memo",
          "qbo_journal_entry_id",
        ].map((column_name) => ({ column_name })),
      },
      {
        match: (sql, values) => {
          sqlSeen.push(sql);
          return (
            sql.includes("FROM accounting.journal_entries") &&
            sql.includes("operating_company_id = $1::uuid") &&
            sql.includes("ORDER BY") &&
            Boolean(values?.[0] === OCI_A)
          );
        },
        rows: [
          {
            id: JE_2,
            status: "posted",
            approval_status: "pending",
            entry_date: "2026-07-02",
            created_at: "2026-07-02T10:00:00Z",
            memo: "later",
            created_by_user_id: USER_CREATOR,
            qbo_journal_entry_id: null,
            display_id: null,
            voided_at: null,
            reverses_je_id: null,
            reversed_by_je_id: null,
            required_approver_user_id: USER_APPROVER,
            required_approver_role: null,
          },
          {
            id: JE_1,
            status: "posted",
            approval_status: "pending",
            entry_date: "2026-07-01",
            created_at: "2026-07-01T10:00:00Z",
            memo: "earlier",
            created_by_user_id: USER_CREATOR,
            qbo_journal_entry_id: null,
            display_id: null,
            voided_at: null,
            reverses_je_id: null,
            reversed_by_je_id: null,
            required_approver_user_id: null,
            required_approver_role: null,
          },
          {
            id: JE_VOID,
            status: "voided",
            approval_status: "pending",
            entry_date: "2026-07-01",
            created_at: "2026-07-01T09:00:00Z",
            memo: "voided",
            created_by_user_id: USER_CREATOR,
            qbo_journal_entry_id: null,
            display_id: null,
            voided_at: "2026-07-03T00:00:00Z",
            reverses_je_id: null,
            reversed_by_je_id: null,
            required_approver_user_id: USER_APPROVER,
            required_approver_role: null,
          },
          {
            id: JE_REV,
            status: "posted",
            approval_status: "pending",
            entry_date: "2026-07-01",
            created_at: "2026-07-01T08:00:00Z",
            memo: "reversed",
            created_by_user_id: USER_CREATOR,
            qbo_journal_entry_id: null,
            display_id: null,
            voided_at: null,
            reverses_je_id: null,
            reversed_by_je_id: JE_2,
            required_approver_user_id: USER_APPROVER,
            required_approver_role: null,
          },
        ],
      },
      {
        match: (sql) => sql.includes("to_regclass") && sql.includes("$1"),
        rows: [{ ok: true }],
      },
      {
        match: (sql, values) =>
          sql.includes("information_schema.columns") && values?.[0] === "catalogs" && values?.[1] === "accounts",
        rows: ["account_number", "account_name", "operating_company_id"].map((column_name) => ({ column_name })),
      },
      {
        match: (sql) => sql.includes("FROM accounting.journal_entry_postings"),
        rows: [
          {
            journal_entry_uuid: JE_1,
            account_id: ACCT_CASH,
            account_number: "1000",
            account_name: "Cash",
            debit_cents: 50,
            credit_cents: 0,
            coa_role: "cash",
          },
          {
            journal_entry_uuid: JE_1,
            account_id: ACCT_REV,
            account_number: "4000",
            account_name: "Revenue",
            debit_cents: 0,
            credit_cents: 50,
            coa_role: null,
          },
          {
            journal_entry_uuid: JE_2,
            account_id: ACCT_CASH,
            account_number: "1000",
            account_name: "Cash",
            debit_cents: 75,
            credit_cents: 0,
            coa_role: "cash",
          },
          {
            journal_entry_uuid: JE_2,
            account_id: ACCT_REV,
            account_number: "4000",
            account_name: "Revenue",
            debit_cents: 0,
            credit_cents: 75,
            coa_role: null,
          },
        ],
      },
      {
        match: (sql) => sql.includes("FROM identity.users"),
        rows: [
          { id: USER_CREATOR, role: "Accountant" },
          { id: USER_APPROVER, role: "Owner" },
        ],
      },
    ]);

    const result = await buildPendingApprovalsGl(client, OCI_A, {
      capabilityOverride: AVAILABLE_CAPABILITY,
    });

    assertNoPhantomSource(sqlSeen);
    expect(result.control_available).toBe(true);
    // Voided + reversed excluded from pending
    expect(result.pending_journal_approvals).toBe(2);
    expect(result.items.every((i) => i.kind === "journal_approval")).toBe(true);
    expect(result.items.every((i) => i.operating_company_id === OCI_A)).toBe(true);
    expect(result.items.every((i) => i.operating_company_id !== OCI_B)).toBe(true);
    // SQL asked for created_at + id ordering
    expect(sqlSeen.some((s) => /ORDER BY[\s\S]*created_at ASC NULLS LAST,\s*id ASC/i.test(s))).toBe(true);
    // Direct detail routes
    for (const item of result.items) {
      expect(item.forward_drill.href).toMatch(/^\/accounting\/journal-entries\/[0-9a-f-]+$/i);
      expect(item.forward_drill.href).not.toContain("warning_id");
    }
    // Null approver → assignment_unresolved on JE_1
    const unresolved = result.items.find((i) => i.journal_entry_id === JE_1);
    expect(unresolved?.assignment_exception?.code).toBe("assignment_unresolved");
    assertNoPii(result.items);
  });

  it("cross-entity: company B scope does not return company A rows", async () => {
    const client = mockClient([
      {
        match: (sql, values) =>
          sql.includes("information_schema.columns") &&
          values?.[0] === "accounting" &&
          values?.[1] === "journal_entries",
        rows: [
          "id",
          "operating_company_id",
          "status",
          "approval_status",
          "required_approver_user_id",
          "required_approver_role",
          "voided_at",
          "reverses_je_id",
          "reversed_by_je_id",
          "created_at",
          "created_by_user_id",
          "entry_date",
          "memo",
          "qbo_journal_entry_id",
        ].map((column_name) => ({ column_name })),
      },
      {
        match: (sql, values) =>
          sql.includes("FROM accounting.journal_entries") && values?.[0] === OCI_B,
        rows: [], // entity B: no rows
      },
      {
        match: (sql) => sql.includes("to_regclass"),
        rows: [{ ok: true }],
      },
    ]);

    const result = await buildPendingApprovalsGl(client, OCI_B, {
      capabilityOverride: AVAILABLE_CAPABILITY,
    });
    expect(result.pending_journal_approvals).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.control_available).toBe(true);
  });
});
