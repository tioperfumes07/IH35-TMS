import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeLeadsExcelPanel, readWorkbook } from "../PerfumeLeadsExcelPanel";
import { PerfumeCatalogsPanel } from "../PerfumeCatalogsPanel";
import type { PerfumeUpload } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 17:38 CT: "filter and categorize in an excel and then upload, and then see what is not necessary" + "where is
// the lists or catalogs for types".
const calls: Array<[string, unknown]> = [];
const upload: PerfumeUpload = {
  id: "u1", file_name: "organized.xlsx", status: "previewed", options: null, result: null, error: null, created_at: "2026-11-26T23:50:00Z", applied_at: null,
  summary: {
    file_name: "organized.xlsx",
    sheets: [{ name: "Summary", kind: "skipped", header_row: null, rows: 3, used: 0, columns: [] }, { name: "Leaked emails", kind: "leaked", header_row: 1, rows: 2, used: 2, columns: [] },
      { name: "Phone contacts", kind: "phone", header_row: 1, rows: 3, used: 3, columns: [] }],
    existing: { rows: 2, companies_changed: 1, people_changed: 0, remove_companies: 1, remove_people: 0, not_found: 0, conflicts: 0 },
    changes: [{ company: "Fragrance Hub", person: null, field: "customer_type", from: null, to: "Formal wholesale" }], changes_total: 1, conflicts: [], not_found: [],
    removals: [{ scope: "company", company: "Trucking Co", person: null }],
    new: { records: 5, would_match: 1, would_insert: 4, people: 5, by_kind: { leaked: 2, phone: 3 },
      by_category: { "(no category)": { records: 2, match: 0 }, "Unclassified - review": { records: 2, match: 0 }, "Linked to a perfume vendor": { records: 1, match: 1 } },
      samples: [{ name: "Shop MX", kind: "leaked", category: null, email: "buyer@shop.mx", phone: null, country: "Mexico", leaked_from: "Sushmaa International", match: null }] },
    unknown: { category: ["Linked to a perfume vendor"] },
  },
};
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/contacts/uploads") return { uploads: [{ id: "u1", file_name: "organized.xlsx", status: "previewed", created_at: upload.created_at, applied_at: null, error: null,
      existing: upload.summary.existing, new: { records: 5, would_match: 1, would_insert: 4, people: 5 }, result: null }] };
    if (path === "/api/v1/perfume/contacts/uploads/u1") return upload;
    if (path.endsWith("/apply")) return { status: "applying" };
    if (path === "/api/v1/perfume/catalogs" && !opts?.method) return { kinds: [
      { kind: "vendor_type", label: "Vendor types", values: [{ id: "v1", value: "Distributor", sort: 10, contacts: 12 }] },
      { kind: "product_type", label: "Perfume product types", values: [{ id: "p1", value: "Tester Man", sort: 20, contacts: 0 }] }] };
    if (path === "/api/v1/perfume/catalogs") return { id: "new" };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);

describe("leads Excel update", () => {
  it("shows the changes, removals and new leads (with the leak's sender) before anything is saved; Apply leaves Unclassified out by default", async () => {
    mount(<PerfumeLeadsExcelPanel />);
    fireEvent.click(await screen.findByText("organized.xlsx"));
    await screen.findByText("Formal wholesale");
    const review = screen.getByTestId("perfume-leadsx-review");
    expect(within(review).getByText("Trucking Co")).toBeTruthy();
    expect(within(review).getByText("Sushmaa International")).toBeTruthy();
    expect((within(review).getByTestId("perfume-leadsx-cat-Unclassified - review") as HTMLInputElement).checked).toBe(false);
    expect(within(review).getByText(/Linked to a perfume vendor$/, { selector: "div" })).toBeTruthy();
    fireEvent.click(within(review).getByTestId("perfume-leadsx-apply"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/contacts/uploads/u1/apply", { skip_categories: ["Unclassified - review"], skip_kinds: [], add_unknown: true }]));
  });
});

describe("catalogs", () => {
  it("lists every type list with how many contacts use each value, and adds a value", async () => {
    mount(<PerfumeCatalogsPanel />);
    const box = await screen.findByTestId("perfume-catalog-vendor_type");
    expect(within(box).getByText("Distributor")).toBeTruthy();
    expect(within(box).getByText("12")).toBeTruthy();
    expect(screen.getByText("Tester Man")).toBeTruthy();
    fireEvent.change(screen.getByTestId("perfume-catalog-add-vendor_type"), { target: { value: "Trader" } });
    fireEvent.click(within(box).getByText("Add"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/catalogs", { kind: "vendor_type", value: "Trader" }]));
  });
});

describe("reading the workbook in the browser", () => {
  it("keeps every sheet, dates as YYYY-MM-DD and long phone numbers as typed", async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Leak #", "Date sent", "Phone"], [1, new Date(2026, 10, 24), 9565550101]], { cellDates: true }), "Leaked emails");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Summary"]]), "Summary");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer;
    const sheets = await readWorkbook(new File([buf], "x.xlsx"));
    expect(sheets.map((s) => s.name)).toEqual(["Leaked emails", "Summary"]);
    expect(sheets[0]!.rows[1]).toEqual(["1", "2026-11-24", "9565550101"]);
  });
});
