import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExcelJS from "exceljs";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { CustomerSalesImportCard } from "../PerfumeContactsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// L.29 E1 (CC3, landed by LEAD): the owner's USA + México customer workbook → customer companies by name, country, NO balances.
const posts: unknown[][] = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/perfume/contacts/import" && opts?.method === "POST") {
      const recs = (opts.body as { records: unknown[] }).records; posts.push(recs);
      return { records: recs.length, inserted: recs.length - 1, matched: 1, by: {}, people_inserted: 0, people_existing: 0, origins: 0 };
    }
    throw new Error(`unexpected ${path}`);
  });
});
async function workbook() {
  const wb = new ExcelJS.Workbook();
  const usa = wb.addWorksheet("Clientes USA"); const mx = wb.addWorksheet("Clientes México");
  for (const s of [usa, mx]) { s.addRow(["title"]); s.addRow([]); s.addRow([]); s.addRow(["No.", "Customer", "Open Balance"]); }
  usa.addRow([101, "Perfumes El Sol", 999.99]); usa.addRow([102, "Laredo Scents", 50]); usa.addRow([103, "", 0]);
  mx.addRow([7, "Perfumería La Rosa", 1234]);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], "TIO-Customers.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("customer purchase-history import", () => {
  it("preview counts USA + MX names; Apply imports role=customer with country, never the balance column", async () => {
    render(<MemoryRouter><ToastProvider><CustomerSalesImportCard onDone={() => undefined} /></ToastProvider></MemoryRouter>);
    fireEvent.change(screen.getByTestId("perfume-sales-import-file"), { target: { files: [await workbook()] } });
    expect(await screen.findByText(/3 companies to import/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-sales-import-apply"));
    await waitFor(() => expect(posts).toHaveLength(1));
    const recs = posts[0] as Array<{ company: Record<string, unknown> }>;
    expect(recs.map((r) => [r.company.name, r.company.role, r.company.country])).toEqual([
      ["Perfumes El Sol", "customer", "US"], ["Laredo Scents", "customer", "US"], ["Perfumería La Rosa", "customer", "MX"]]);
    expect(JSON.stringify(recs)).not.toMatch(/999|1234|balance/i);
    expect(await screen.findByText(/3 of 3 posted · 2 new · 1 matched · done/)).toBeTruthy();
  });
});
