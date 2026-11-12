import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeListsPanel } from "../PerfumeListsPanel";
import * as readers from "../perfumeFileReaders";
import { pictureLinesToExtracted, type PictureLine } from "../perfumeFileReaders";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

const line = (p: Partial<PictureLine>): PictureLine => ({
  key: Math.random().toString(36), include: true, image: 1, image_name: "PHOTO 1.jpg", brand: "CHANEL", description: "COCO NOIR EDP 100ML",
  size: "100ML", type: "EDP", gender: null, price: "166.50", qty: null, section: null, note: null, ...p,
});

describe("PERFUME-DESK picture lines → import rows", () => {
  it("only approved lines with a real price count, and they ARE the file total", () => {
    const x = pictureLinesToExtracted([
      line({}), line({ description: "CHANCE EAU VIVE EDT 150ML", price: "171.00" }),
      line({ description: "N5 EDP 200ML", price: null }), line({ description: "SKIPPED", include: false, price: "10.00" }),
    ]);
    expect(x.rowsRead).toBe(2);
    expect(x.fileTotalCents).toBe(33750);
    expect(x.rows.map((r) => r.row_no)).toEqual([1, 2]);
    expect(x.rows[0]).toMatchObject({ brand: "CHANEL", description: "COCO NOIR EDP 100ML", price: "166.50", type: "EDP" });
  });
});

describe("PERFUME-DESK picture reader screen", () => {
  beforeEach(() => {
    vi.mocked(clientApi.apiRequest).mockReset();
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { body?: unknown }) => {
      if (path === "/api/v1/perfume/vendors") return { vendors: [{ id: "v1", name: "Offer photos vendor", kind: "buy" }] };
      if (path === "/api/v1/perfume/lists") return { lists: [] };
      if (path === "/api/v1/perfume/extract") {
        const n = (opts?.body as { images: unknown[] }).images.length;
        return { model_id: "m", images: n, lines: [
          { image: 1, image_name: "a.jpg", brand: "CHANEL", description: "COCO NOIR EDP 100ML", size: "100ML", type: "EDP", gender: null, price: "166.50", qty: null, section: null, note: null },
          { image: 2, image_name: "b.jpg", brand: "CHANEL", description: "N5 EDP 200ML", size: "200ML", type: "EDP", gender: null, price: null, qty: null, section: null, note: "price hidden by a finger" },
        ] };
      }
      throw new Error(`unexpected ${path}`);
    });
    vi.spyOn(readers, "readPictureFiles").mockResolvedValue({ kind: "image", sheets: [], pictures: [
      { name: "a.jpg", media_type: "image/jpeg", data_base64: "AAAA" }, { name: "b.jpg", media_type: "image/jpeg", data_base64: "BBBB" }] });
  });

  it("reads pictures, holds Save until every approved line has a price, then sends only approved lines", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><ToastProvider><MemoryRouter><PerfumeListsPanel /></MemoryRouter></ToastProvider></QueryClientProvider>);
    const input = await screen.findByTestId("perfume-import-file");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" }), new File(["y"], "b.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(await screen.findByTestId("perfume-read-pictures"));
    expect(await screen.findByText(/approved line\(s\) have no price/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save list" }) as HTMLButtonElement).disabled).toBe(true);
    const prices = screen.getAllByLabelText("Price") as HTMLInputElement[];
    fireEvent.change(prices[1], { target: { value: "250" } });
    await waitFor(() => expect(screen.queryByText(/have no price/)).toBeNull());
    expect(screen.getByText("$416.50")).toBeTruthy();
    const extractCall = vi.mocked(clientApi.apiRequest).mock.calls.find(([p]) => p === "/api/v1/perfume/extract");
    expect((extractCall?.[1] as { body: { images: unknown[] } }).body.images).toHaveLength(2);
  });
});
