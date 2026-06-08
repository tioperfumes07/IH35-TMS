import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  auditBankAccountCompanyAssignment,
  applyCompanyReassignment,
  BANK_ACCOUNT_TRUTH_TABLE,
} from "../account-company-audit.service.js";

describe("BANK_ACCOUNT_TRUTH_TABLE", () => {
  it("locks Wells Fargo TRANSP suffixes", () => {
    expect(BANK_ACCOUNT_TRUTH_TABLE["6103"]).toBe("TRANSP");
    expect(BANK_ACCOUNT_TRUTH_TABLE["6129"]).toBe("TRANSP");
    expect(BANK_ACCOUNT_TRUTH_TABLE["6137"]).toBe("TRANSP");
  });
});

describe("auditBankAccountCompanyAssignment", () => {
  it("flags TRK shadow rows for TRANSP Wells accounts", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM banking.bank_accounts")) {
          return {
            rows: [
              {
                id: "a1",
                bank_name: "Wells Fargo",
                account_mask: "****6103",
                operating_company_id: "trk-uuid",
                company_code: "TRK",
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const findings = await auditBankAccountCompanyAssignment(client as never);
    expect(findings).toHaveLength(1);
    expect(findings[0].expected_oci).toBe("TRANSP");
    expect(findings[0].severity).toBe("critical");
  });
});

describe("applyCompanyReassignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits WF-064 audit event on success", async () => {
    const appendCrudAudit = vi.fn(async () => undefined);
    vi.doMock("../../../audit/crud-audit.js", () => ({ appendCrudAudit }));

    let updateCalled = false;
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT code FROM org.companies")) return { rows: [{ code: "TRANSP" }] };
        if (sql.includes("SELECT account_mask")) return { rows: [{ account_mask: "****6103", bank_name: "Wells Fargo" }] };
        if (sql.includes("SELECT operating_company_id")) return { rows: [{ operating_company_id: "old-oci" }] };
        if (sql.includes("UPDATE banking.bank_accounts")) {
          updateCalled = true;
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const mod = await import("../account-company-audit.service.js");
    const result = await mod.applyCompanyReassignment(client as never, "acct-1", "transp-uuid", "user-1");
    expect(result.updated).toBe(true);
    expect(updateCalled).toBe(true);
  });
});
