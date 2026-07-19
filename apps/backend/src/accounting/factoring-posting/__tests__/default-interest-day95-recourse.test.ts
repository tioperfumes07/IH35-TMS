import { describe, expect, it, vi } from "vitest";
import { triggerDay95RecourseForCompany } from "../default-interest.service.js";

// Day-95 auto-recourse orchestration: catch interest, then fire chargeback with EXACT linked amounts
// (no guessed Net / accrual-ledger amounts). Status flip lives inside chargeback txn; orchestration
// only appends day-95 audit. Flag OFF ⇒ pure no-op.
const {
  mockWithLuciaBypass,
  mockQuery,
  mockIsEnabled,
  mockAppendCrudAudit,
  mockChargeback,
  mockAccrual,
  mockLoadExact,
} = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    mockIsEnabled: vi.fn(),
    mockAppendCrudAudit: vi.fn(),
    mockChargeback: vi.fn(),
    mockAccrual: vi.fn(),
    mockLoadExact: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAppendCrudAudit }));
vi.mock("../poster.service.js", () => ({
  FACTORING_GL_POSTING_FLAG: "FACTORING_GL_POSTING_ENABLED",
  postFactoringChargebackEvent: mockChargeback,
  postFactoringDefaultInterestAccrualEvent: mockAccrual,
  loadExactLinkedChargebackAmounts: mockLoadExact,
}));

const OPCO = "11111111-1111-4111-8111-111111111111";

function installDefaults(opts: { flagOn?: boolean; candidate?: boolean } = {}) {
  const flagOn = opts.flagOn ?? true;
  const candidate = opts.candidate ?? true;
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockAppendCrudAudit.mockReset();
  mockChargeback.mockReset();
  mockAccrual.mockReset();
  mockLoadExact.mockReset();

  mockIsEnabled.mockResolvedValue(flagOn);
  mockAppendCrudAudit.mockResolvedValue(undefined);
  mockAccrual.mockResolvedValue({ posted: false, reason: "already_posted" });
  mockLoadExact.mockResolvedValue({ liability_cents: 520000, recoursed_ar_cents: 500000 });
  mockChargeback.mockResolvedValue({ posted: true, journal_entry_id: "je-cb" });

  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
    if (sql.includes("FROM accounting.factoring_advances") && sql.includes("status = 'advanced'")) {
      return {
        rows: candidate
          ? [
              {
                id: "fac-1",
                display_id: "FAC-0001",
                invoice_total_cents: "500000",
                advanced_at: "2026-01-01T00:00:00.000Z",
                day_index: "95",
                last_accrual_date: "2026-04-04",
              },
            ]
          : [],
      };
    }
    return { rows: [] };
  });
}

describe("Faro factoring — day-95 auto-recourse", () => {
  it("fires chargeback with exact linked liability + A/R; audit only (no outer status flip)", async () => {
    installDefaults();
    const res = await triggerDay95RecourseForCompany({
      operating_company_id: OPCO,
      as_of_date_iso: "2026-04-06",
    });

    expect(res).toMatchObject({ flag_off: false, recoursed: 1 });
    expect(mockLoadExact).toHaveBeenCalledWith(OPCO, "fac-1");
    expect(mockChargeback).toHaveBeenCalledTimes(1);
    expect(mockChargeback.mock.calls[0][0]).toMatchObject({
      operating_company_id: OPCO,
      factoring_advance_id: "fac-1",
      chargeback_amount_cents: 520000,
      default_interest_cents: 0,
      recoursed_ar_cents: 500000,
      charged_back_at_iso: "2026-04-06",
    });

    const statusFlip = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        c[0].includes("UPDATE accounting.factoring_advances") &&
        c[0].includes("recourse_returned")
    );
    expect(statusFlip).toBeFalsy();
    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "accounting.factoring_recourse_auto_day95",
      expect.objectContaining({ outstanding_liability_cents: 520000, net_recoursed_ar_cents: 500000 }),
      "warning",
      "FACTORING-DAY95-RECOURSE"
    );
  });

  it("skips when exact linked amounts are zero/missing (fail closed — no guessed Net)", async () => {
    installDefaults();
    mockLoadExact.mockResolvedValue({ liability_cents: 0, recoursed_ar_cents: 500000 });
    const res = await triggerDay95RecourseForCompany({
      operating_company_id: OPCO,
      as_of_date_iso: "2026-04-06",
    });
    expect(res.recoursed).toBe(0);
    expect(mockChargeback).not.toHaveBeenCalled();
  });

  it("FLAG OFF ⇒ no selection / no chargeback", async () => {
    installDefaults({ flagOn: false });
    const res = await triggerDay95RecourseForCompany({
      operating_company_id: OPCO,
      as_of_date_iso: "2026-04-06",
    });
    expect(res).toMatchObject({ flag_off: true, advances_scanned: 0, recoursed: 0 });
    expect(mockChargeback).not.toHaveBeenCalled();
  });
});
