import { describe, expect, it, vi } from "vitest";
import { triggerDay95RecourseForCompany, accrueDefaultInterestForCompany } from "../default-interest.service.js";

// Day-95 auto-recourse orchestration proof (mocked). At the 95-day Repurchase Deadline, an unpaid advance
// auto-fires the SHIPPED chargeback poster with chargeback = the FULL outstanding liability (Net + all
// compounded interest) and default_interest = 0 (interest is already expensed + already compounded into the
// liability by the daily accrual — re-debiting it would double-count), and flips the advance + its invoices
// to recourse_returned. Flag OFF ⇒ pure no-op.
const { mockWithLuciaBypass, mockQuery, mockIsEnabled, mockAppendCrudAudit, mockChargeback, mockAccrual, mockSumAccrued } =
  vi.hoisted(() => {
    const query = vi.fn();
    return {
      mockQuery: query,
      mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
      mockIsEnabled: vi.fn(),
      mockAppendCrudAudit: vi.fn(),
      mockChargeback: vi.fn(),
      mockAccrual: vi.fn(),
      mockSumAccrued: vi.fn(),
    };
  });

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAppendCrudAudit }));
vi.mock("../poster.service.js", () => ({
  FACTORING_GL_POSTING_FLAG: "FACTORING_GL_POSTING_ENABLED",
  postFactoringChargebackEvent: mockChargeback,
  postFactoringDefaultInterestAccrualEvent: mockAccrual,
  sumAccruedDefaultInterest: mockSumAccrued,
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
  mockSumAccrued.mockReset();

  mockIsEnabled.mockResolvedValue(flagOn);
  mockAppendCrudAudit.mockResolvedValue(undefined);
  mockAccrual.mockResolvedValue({ posted: false, reason: "already_posted" });
  // Net 500,000 + 20,000 accrued default interest = 520,000 outstanding liability at day 95.
  mockSumAccrued.mockResolvedValue({ total_interest_cents: 20000, last_closing_cents: 520000 });
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
  it("fires the chargeback poster with FULL outstanding liability + 0 separate interest, and flips status", async () => {
    installDefaults();
    const res = await triggerDay95RecourseForCompany({
      operating_company_id: OPCO,
      as_of_date_iso: "2026-04-06T00:00:00.000Z",
    });

    expect(res).toMatchObject({ flag_off: false, recoursed: 1 });
    expect(mockChargeback).toHaveBeenCalledTimes(1);
    expect(mockChargeback.mock.calls[0][0]).toMatchObject({
      operating_company_id: OPCO,
      factoring_advance_id: "fac-1",
      chargeback_amount_cents: 520000, // Net + accrued interest (the whole liability)
      default_interest_cents: 0, // already expensed by the daily accrual — no double-count
      recoursed_ar_cents: 500000, // A/R was only ever the invoice Net
    });

    // status flip to recourse_returned + invoices flip + audit
    const statusFlip = mockQuery.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("UPDATE accounting.factoring_advances") && c[0].includes("recourse_returned")
    );
    expect(statusFlip).toBeTruthy();
    const invoiceFlip = mockQuery.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("UPDATE accounting.invoices") && c[0].includes("recourse_returned")
    );
    expect(invoiceFlip).toBeTruthy();
    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "accounting.factoring_recourse_auto_day95",
      expect.objectContaining({ outstanding_liability_cents: 520000, net_recoursed_ar_cents: 500000 }),
      "warning",
      "FACTORING-DAY95-RECOURSE"
    );
  });

  it("falls back to Net when nothing accrued (last_closing null → chargeback = Net)", async () => {
    installDefaults();
    mockSumAccrued.mockResolvedValue({ total_interest_cents: 0, last_closing_cents: null });
    const res = await triggerDay95RecourseForCompany({
      operating_company_id: OPCO,
      as_of_date_iso: "2026-04-06T00:00:00.000Z",
    });
    expect(res.recoursed).toBe(1);
    expect(mockChargeback.mock.calls[0][0]).toMatchObject({ chargeback_amount_cents: 500000, default_interest_cents: 0 });
  });

  it("FLAG OFF: no candidates scanned, no chargeback, no status flip", async () => {
    installDefaults({ flagOn: false });
    const res = await triggerDay95RecourseForCompany({
      operating_company_id: OPCO,
      as_of_date_iso: "2026-04-06T00:00:00.000Z",
    });
    expect(res).toMatchObject({ flag_off: true, recoursed: 0 });
    expect(mockChargeback).not.toHaveBeenCalled();
  });

  it("accrual engine FLAG OFF: pure no-op", async () => {
    installDefaults({ flagOn: false });
    const res = await accrueDefaultInterestForCompany({
      operating_company_id: OPCO,
      as_of_date_iso: "2026-04-06T00:00:00.000Z",
    });
    expect(res).toMatchObject({ flag_off: true, accruals_posted: 0 });
  });
});
