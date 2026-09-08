import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as factoringApi from "../../../api/factoring";
import * as dataInfraApi from "../../../api/data-infra";
import * as mdataApi from "../../../api/mdata";
import { FactoringHomePage } from "../FactoringHome";
import { ToastProvider } from "../../../components/Toast";

/**
 * MERGE-DEEPLINK-NEVER-FIRES-2026-09-08: live-Chrome reproduced the "Merge these" deep-link
 * prefill NOT populating the vendor-merges form even on a genuine full browser navigation to the
 * exact deep-link URL (not just a client-side tab click) -- deeper than the mount-only useEffect
 * bug already fixed in PR #21410. This test renders FactoringHomePage directly at that URL (the
 * true "cold mount at this path" case a full navigation should exercise) to determine, outside of
 * any deploy/CDN/browser-cache confound, whether the prefill logic actually populates state when
 * mounted fresh at the deep-link path.
 */

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

function wrapAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <FactoringHomePage initialTab="vendor_merges" />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function stubHappyPathApis() {
  vi.spyOn(mdataApi, "listVendors").mockResolvedValue({ vendors: [] } as never);
  vi.spyOn(factoringApi, "listFactors").mockResolvedValue({ factors: [] } as never);
  vi.spyOn(factoringApi, "getFactoringRecoursePipeline").mockResolvedValue({ invoices: [] } as never);
  vi.spyOn(factoringApi, "getFactoringChargebacksFees").mockResolvedValue({ history: [], monthly_summary: [] } as never);
  vi.spyOn(factoringApi, "getFactoringStatementsSettings").mockResolvedValue({
    current: { active_factor_count: 0, single_factor_invariant_ok: true, recourse_days: 95 },
    statements: [],
  } as never);
  vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
    active_factor_name: "Faro Factoring",
    reserve_balance: 0,
    chargeback_balance: 0,
    recourse_days: 95,
  } as never);
  vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [] } as never);
  vi.spyOn(dataInfraApi, "listFaroDailyImports").mockResolvedValue({ imports: [] } as never);
  vi.spyOn(dataInfraApi, "listEquipmentLoans").mockResolvedValue({ loans: [] } as never);
  vi.spyOn(dataInfraApi, "listDriverVendorMerges").mockResolvedValue({ merges: [] } as never);
}

describe("FactoringHomePage vendor-merge deep-link prefill (MERGE-DEEPLINK-NEVER-FIRES-2026-09-08)", () => {
  it("prefills From/To vendor id inputs from the Merge-these deep-link query params on a cold mount at that exact URL", async () => {
    stubHappyPathApis();
    const fromId = "2bb0cc18-21ef-46de-890c-426b54112ffd";
    const toId = "3a5fa060-2ff4-4ebe-843d-7871eab7b322";
    wrapAt(
      `/factoring/vendor-merges?merge_from_vendor_id=${fromId}&merge_from_vendor_name=NEFTALI+URBANO+CORONADO&merge_to_vendor_id=${toId}&merge_to_vendor_name=Neftali+Coronado+Urbano`
    );
    const fromInput = await screen.findByPlaceholderText("from qbo vendor id");
    const toInput = await screen.findByPlaceholderText("to qbo vendor id");
    expect((fromInput as HTMLInputElement).value).toBe(fromId);
    expect((toInput as HTMLInputElement).value).toBe(toId);
    expect(await screen.findByText("NEFTALI URBANO CORONADO")).toBeTruthy();
    expect(await screen.findByText("Neftali Coronado Urbano")).toBeTruthy();
  });
});
