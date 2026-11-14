import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";
import { extractRows, guessMapping, PDF_NO_NAME, pdfLinePairs, priceToCents } from "../perfumeFileReaders";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const VENDOR = { id: "v-pca", name: "Perfume Center of America (Kanak)", kind: "buy", cushion_lo_cents: null, cushion_hi_cents: null,
  freight_lo_cents: null, freight_hi_cents: null, earn_pct: null, sells_by_box: false, contact: null, column_mapping: {} };
const RULES = { round_step: "50", round_dir: "up", cushion_lo_cents: 25, cushion_hi_cents: 50, freight_lo_cents: 35, freight_hi_cents: 45,
  vendor_earn_pct: 16, store_earn_pct: 16, wholesale_targets_pct: [11, 12.5, 15] };
const GRID = {
  cols: [
    { key: "brand", label: "Brand", group: "Item", kind: "text" },
    { key: "name", label: "Name", group: "Item", kind: "text" },
    { key: "landed_likely", label: "My cost", group: "Purchase", kind: "money" },
    { key: "margin", label: "Margin %", group: "Laredo", kind: "pct" },
    { key: "v:a:price", label: "List price", group: "Supplier A", kind: "money" },
  ],
  rows: [{ id: "i1", brand: "CAROLINA HERRERA", name: "212 SEXY", landed_likely: 5420, margin: 13.6, "v:a:price": 6150, n_vendors: 2 }],
  total: 1, rules: RULES, vendors: [VENDOR], measured_at: "2026-11-12T06:00:00Z",
};

function renderPage(path = "/perfume") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <PerfumeDeskPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("PERFUME-DESK page", () => {
  beforeEach(() => {
    vi.mocked(clientApi.apiRequest).mockReset();
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/grid")) return GRID;
      if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 3 };
      if (path.startsWith("/api/v1/perfume/vendors")) return { vendors: [VENDOR] };
      if (path.startsWith("/api/v1/perfume/lists")) return { lists: [] };
      if (path.startsWith("/api/v1/perfume/rules")) return RULES;
      throw new Error(`unexpected ${path}`);
    });
  });

  it("opens on Buy: money as dollars, and only the Buy columns are shown once the server's columns arrive", async () => {
    renderPage();
    expect(await screen.findByText("TIO Perfumes · Price desk")).toBeTruthy();
    expect(await screen.findByText("$61.50")).toBeTruthy();
    // Purchase shows no cost columns (owner 2026-11-12: "I don't have costs, so there should be no costs").
    expect(screen.queryByText("$54.20")).toBeNull();
    // Owner 2026-11-12: a column outside the view's defaults stays hidden (it used to show because the table
    // read its default-hidden set before the server sent the columns).
    expect(screen.queryByText("13.6%")).toBeNull();
    expect(screen.getByTestId("perfume-tab-header").textContent).toBe("Purchase · compare vendors");
    // Owner 2026-11-12: a rule separates each vendor's columns from the next.
    const vendorHead = screen.getAllByRole("columnheader").find((th) => th.textContent?.includes("List price"));
    expect(vendorHead?.className).toContain("border-l-2");
    // Grouped tables carry a <colgroup> so each column keeps its own fitted width (not an equal split).
    const colgroup = screen.getByTestId("parity-table-colgroup");
    expect(colgroup.querySelectorAll("col").length).toBe(screen.getAllByRole("columnheader").filter((th) => th.closest("tr")?.getAttribute("data-testid") !== "parity-table-column-groups").length);
    expect(screen.getByText(/Review \(3\)/)).toBeTruthy();
    const gridCall = vi.mocked(clientApi.apiRequest).mock.calls.find(([p]) => String(p).startsWith("/api/v1/perfume/grid"));
    expect(String(gridCall?.[0])).toContain("view=buy");
  });

  it("Show: My offer list holds on every tab, sends mine=offer, and shows every supplier and competitor price", async () => {
    const MINE_GRID = {
      ...GRID,
      cols: [
        { key: "brand", label: "Brand", group: "Item", kind: "text" },
        { key: "name", label: "Name", group: "Item", kind: "text" },
        { key: "my_offer_price", label: "My offer price", group: "Mine", kind: "money" },
        { key: "v:a:price", label: "List price", group: "Supplier A", kind: "money" },
        { key: "s:b:price", label: "Their price", group: "Competitor · B", kind: "money" },
      ],
      rows: [{ id: "i1", brand: "ARMAF", name: "CLUB NUIT INTENSE", my_offer_price: 2250, "v:a:price": 2020, "s:b:price": 2450 }],
    };
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/grid")) return MINE_GRID;
      if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
      throw new Error(`unexpected ${path}`);
    });
    renderPage("/perfume?tab=wholesale&mine=offer");
    expect(await screen.findByText("$24.50")).toBeTruthy(); // competitor
    expect(screen.getByText("$20.20")).toBeTruthy(); // supplier — shown on Wholesale only because the list is narrowed
    expect(screen.getByText("$22.50")).toBeTruthy(); // my offer
    expect(screen.getByTestId("perfume-mine-offer").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Competition · their margin" }));
    await waitFor(() => expect(vi.mocked(clientApi.apiRequest).mock.calls.some(([p]) => String(p).includes("view=comp") && String(p).includes("mine=offer"))).toBe(true));
    expect(screen.getByTestId("perfume-mine-offer").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("perfume-mine-all"));
    await waitFor(() => expect(screen.getByTestId("perfume-mine-all").getAttribute("aria-pressed")).toBe("true"));
  });

  it("Review with Show: My offer list asks only for my list's lines and shows the item each line can be", async () => {
    const ROW = { id: "r1", list_id: "l1", vendor_name: "ESPERANZA", row_no: 7, upc: null, sku: null, brand: null,
      description: "ARMAF CLUB DE NUIT MILESTONE 3.4oz", size_text: null, case_pack: null, price_cents: 2600, match_status: "review",
      suggestions: [{ item_id: "i9", display_name: "ARMAF · CLUB NUIT MILESTONE · 110 ml", score: 0.7, why: "SIZE DIFFERS: line 100 ml, your item 110 ml" }],
      gender_override: null, brand_name: "ARMAF", model: "CLUB DE NUIT MILESTONE", size_ml: 100, conc: null, gender: null, flags: "", category: "", country: null,
      for_my_item: "ARMAF · CLUB NUIT MILESTONE · 110 ml" };
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/review")) return path.includes("mine=offer") ? { rows: [ROW], total: 1 } : { rows: [], total: 1744 };
      if (path.startsWith("/api/v1/perfume/lists")) return { lists: [] };
      throw new Error(`unexpected ${path}`);
    });
    renderPage("/perfume?tab=review&mine=offer");
    expect((await screen.findAllByText("ARMAF · CLUB NUIT MILESTONE · 110 ml")).length).toBeGreaterThan(0);
    expect(screen.getByText("My item")).toBeTruthy();
    expect(screen.getByText("SIZE DIFFERS: line 100 ml, your item 110 ml")).toBeTruthy();
    expect(screen.getByTestId("perfume-mine-offer").getAttribute("aria-pressed")).toBe("true");
    expect(vi.mocked(clientApi.apiRequest).mock.calls.some(([p]) => String(p).startsWith("/api/v1/perfume/review?") && String(p).includes("mine=offer"))).toBe(true);
  });

  it("another Owner-role login not listed in perfume.desk_users sees the locked notice and no data is fetched", async () => {
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      if (path === "/api/v1/perfume/access") return { allowed: false };
      throw new Error(`must not fetch ${path}`);
    });
    renderPage();
    expect(await screen.findByText("The TIO Perfumes price desk is not open for this login.")).toBeTruthy();
    const paths = vi.mocked(clientApi.apiRequest).mock.calls.map(([p]) => String(p));
    expect(paths.every((p) => p === "/api/v1/perfume/access")).toBe(true);
  });

  it("every tab renders without crashing", async () => {
    for (const tab of ["trade", "wholesale", "all", "lists", "review", "rules"]) {
      const { unmount } = renderPage(`/perfume?tab=${tab}`);
      await waitFor(() => expect(screen.getByTestId("perfume-desk")).toBeTruthy());
      unmount();
    }
    renderPage("/perfume?tab=rules");
    expect(await screen.findByText("Closed numbers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ".25" }));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("PERFUME-DESK file reader", () => {
  it("prices to exact cents", () => {
    expect(priceToCents("$1,234.50")).toBe(123450);
    expect(priceToCents(45.5)).toBe(4550);
    expect(priceToCents(17.45)).toBe(1745);
    expect(priceToCents("")).toBeNull();
    expect(priceToCents("N/A")).toBeNull();
  });

  it("maps the real Perfume Center of America header and carries section rows; file total is independent", () => {
    const header = ["DEPT", "D", "DESIGNER", "COO", "Item", "Description", "CASEPACK", "UPC", "Price", "Qty", "Hyperlink", "Hyperlink"];
    const map = guessMapping(header);
    expect(map).toMatchObject({ section: 0, brand: 2, sku: 4, desc: 5, case_pack: 6, upc: 7, price: 8, qty: 9 });
    const sheet = { name: "PriceList", cells: [
      header,
      ["M", "", "Carolina Herrera", "ES", "I0082511", "212 (M) EDT SP 3.4oz(NEW PACK)", null, "8411061043868", 45.5, null, "", ""],
      ["WOMEN", null, null, null, null, null, null, null, null, null, null, null],
      ["", "", "Carolina Herrera", "ES", "I0086634", "212 SEXY(W)EDP SP 3.4oz", null, "8411061865439", 54, null, "", ""],
    ] };
    const out = extractRows(sheet, 0, map);
    expect(out.rowsRead).toBe(2);
    expect(out.fileTotalCents).toBe(9950);
    expect(out.rows[1].section).toBe("WOMEN");
    expect(out.rows[0].upc).toBe("8411061043868");
  });

  it("maps the real MTZ header: Avail = qty, Full Box Qty = box qty (never qty)", () => {
    const header = ["DESCRIPTION", "UPC", "PRICE", "Avail", "ORDER", "TOTAL", "TYPE", "BRAND", "Full Box Qty"];
    const map = guessMapping(header);
    expect(map).toMatchObject({ desc: 0, upc: 1, price: 2, qty: 3, brand: 7, case_pack: 8 });
  });

  it("PDF lines: two-column pairs, and a price with no name is kept (real LISTA N 5 line), never dropped", () => {
    expect(pdfLinePairs("CK DEFY M 3.4oz $41.00 CURVE WAVE M 4.2oz EDT $11.00")).toEqual([["CK DEFY M 3.4oz", "41.00"], ["CURVE WAVE M 4.2oz EDT", "11.00"]]);
    expect(pdfLinePairs("$41.00")).toEqual([[PDF_NO_NAME, "41.00"]]);
    // LISTA N 5 prints one price with no "$"; sizes inside a name are never prices.
    expect(pdfLinePairs("                 PRINCESS GIFT SET 3X30ML EDT             10.25")).toEqual([["PRINCESS GIFT SET 3X30ML EDT", "10.25"]]);
    expect(pdfLinePairs("CK DEFY M 3.4oz $41.00 PRINCESS GIFT SET 3X30ML EDT 10.25")).toEqual([["CK DEFY M 3.4oz", "41.00"], ["PRINCESS GIFT SET 3X30ML EDT", "10.25"]]);
    expect(pdfLinePairs("3.0EDT+3.4SGEL+0.33EDT                           3.4 EDP/3.0 GEL/MINI")).toEqual([]);
    expect(pdfLinePairs("2.7oz EDP+0.68oz EDP")).toEqual([]);
    expect(pdfLinePairs("3.3 EDT + 3.4SG + 0.25 EDT")).toEqual([]);
    expect(pdfLinePairs("LANCOME LA VIE EST BELLE 100ML EDP $1,105.00")).toEqual([["LANCOME LA VIE EST BELLE 100ML EDP", "1105.00"]]);
    expect(pdfLinePairs("WOMEN")).toEqual([]);
  });
});

describe("PERFUME-DESK header mapping — real lists 2026-11-12", () => {
  it("Perfumes Plus: WHS is the price (MSRP is not)", () => {
    expect(guessMapping(["ITEM#", "UPC", "ITEM DESCRIPTION", "WHS", "MSRP", "QTY", "TOTAL"])).toMatchObject({ sku: 0, upc: 1, desc: 2, price: 3, qty: 5 });
  });
  it("Nandansons: Special = price, Item Type = gender", () => {
    expect(guessMapping(["UPC", "Brand", "Item Type", "SKU-11/7/26", "Name", "Special", "Quantity"])).toMatchObject({ upc: 0, brand: 1, gender: 2, sku: 3, desc: 4, price: 5, qty: 6 });
  });
  it("Darielle: Product Line = brand", () => {
    expect(guessMapping(["Item ID", "UPC Code", "Description", "Product Line", "QTY", "Price", "Order"])).toMatchObject({ upc: 1, desc: 2, brand: 3, qty: 4, price: 5 });
  });
  it("JIZAN: BARCODE / ITEM CODE / PRICE USD", () => {
    expect(guessMapping(["ITEM CODE", "BARCODE", "BRAND", "ITEM DESCRIPTION", "TYPE", "NICHE", "QTY", "PRICE USD"])).toMatchObject({ sku: 0, upc: 1, brand: 2, desc: 3, qty: 6, price: 7 });
  });
});
