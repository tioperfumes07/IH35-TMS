import { describe, expect, it, vi } from "vitest";
import { accrueDefaultInterestForCompany, triggerDay95RecourseForCompany } from "../default-interest.service.js";

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
vi.mock("../faro-agreement-gate.js", () => ({
  requireEffectiveFaroFullRecourseAgreement: vi.fn(async () => ({
    ok: true,
    vendorId: "faro-vendor",
    vendorName: "Faro",
    agreementId: "agr-1",
    factorProfileId: "fp-1",
    companyCode: "TRANSP",
    asOf: "2026-01-20",
  })),
  advanceBoundToFaroVendor: vi.fn(async () => true),
  FARO_FULL_RECOURSE_AGREEMENT_CODE: "FARO_FULL_RECOURSE_V1",
}));

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

// Lead ROUND 296 / 297 + owner (2026-10-02): "WHEN RECOURSE TIME ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY."
// Day 95 is an owner decision-queue event (factoring/repurchase-due.service.ts); the auto-recourse and the nightly
// accrual are retired. With the flag ON and a day-95 candidate present, neither selects nor posts.
describe("Faro factoring — day-95 asks, never recourses", () => {
  it("flag ON + a day-95 candidate ⇒ no selection, no chargeback, no audit", async () => {
    installDefaults();
    const res = await triggerDay95RecourseForCompany({ operating_company_id: OPCO, as_of_date_iso: "2026-04-06" });
    expect(res).toMatchObject({ recoursed: 0, advances_scanned: 0, retired: true });
    expect(mockChargeback).not.toHaveBeenCalled();
    expect(mockLoadExact).not.toHaveBeenCalled();
    expect(mockAppendCrudAudit).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("nightly default-interest accrual is retired (period close accrues, with approval)", async () => {
    installDefaults();
    const res = await accrueDefaultInterestForCompany({ operating_company_id: OPCO, as_of_date_iso: "2026-04-06" });
    expect(res).toMatchObject({ accruals_posted: 0, retired: true });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
