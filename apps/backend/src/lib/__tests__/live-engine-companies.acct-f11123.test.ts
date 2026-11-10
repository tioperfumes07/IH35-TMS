import { describe, expect, it } from "vitest";
import { filterLiveEngineCompanies, isLiveEngineCompany, LIVE_ENGINE_COMPANY_IDS } from "../live-engine-companies.js";
import { listActiveOperatingCompanyIds as depreciationCompanies } from "../../cron/depreciation-autopost.cron.js";
import { listActiveOperatingCompanyIds as factoringInterestCompanies } from "../../cron/factoring-default-interest-accrual.cron.js";
import { listActiveOperatingCompanyIds as collectionsCompanies } from "../../cron/collections-sync.cron.js";
import { listActiveOperatingCompanyIds as bankDriftCompanies } from "../../cron/bank-drift-alerts.cron.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// Any other active org.companies row (the frozen entities are active rows too).
const OTHER_A = "0a0a0a0a-1111-4111-8111-111111111111";
const OTHER_B = "0b0b0b0b-2222-4222-8222-222222222222";

const activeCompaniesClient = {
  query: async () => ({ rows: [{ operating_company_id: OTHER_A }, { operating_company_id: USMCA }, { operating_company_id: OTHER_B }] }),
};

describe("ACCT-F11123 — engines run for the live entity only", () => {
  it("the live list is USMCA alone", () => {
    expect(LIVE_ENGINE_COMPANY_IDS).toEqual([USMCA]);
    expect(isLiveEngineCompany(USMCA)).toBe(true);
    expect(isLiveEngineCompany(USMCA.toUpperCase())).toBe(true);
    expect(isLiveEngineCompany(OTHER_A)).toBe(false);
    expect(isLiveEngineCompany(null)).toBe(false);
    expect(filterLiveEngineCompanies([OTHER_A, USMCA, OTHER_B])).toEqual([USMCA]);
  });

  it.each([
    ["depreciation auto-post (also cash-flow snapshot / rolling ledger / held-expense retry)", depreciationCompanies],
    ["factoring default-interest accrual", factoringInterestCompanies],
    ["collections sync", collectionsCompanies],
    ["bank drift alerts", bankDriftCompanies],
  ])("%s never lists a frozen entity", async (_name, list) => {
    expect(await list(activeCompaniesClient as never)).toEqual([USMCA]);
  });
});
