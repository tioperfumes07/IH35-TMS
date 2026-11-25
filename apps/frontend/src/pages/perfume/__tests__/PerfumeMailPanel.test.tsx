import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeMailPanel } from "../PerfumeMailPanel";
import type { PerfumeMailFile, PerfumeMailState } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-25 17:29 CT: "AN ENGINE THAT AUTOMATICALLY GOES TO MY MAIL APP, GETS ALL THE PRICE LISTS DAILY AND UPDATES
// THE APP" — the two TIO mailboxes, what came in, what is held and why, and a sender set up once from a file.
const F = (o: Partial<PerfumeMailFile>): PerfumeMailFile => ({ id: "f", account_email: "tioperfumes07@gmail.com", file_name: "PCA 11-25.xlsx", sender: "kanak@pca.com",
  subject: "Price list", received_at: "2026-11-25T13:00:00Z", status: "imported", reason: null, vendor_id: "v-pca", vendor_name: "PCA", list_id: "l1", rows_read: 4210,
  rows_saved: 4210, file_total_cents: 12345678, processed_at: "2026-11-25T13:01:00Z", list_voided_at: null, ...o });
let state: PerfumeMailState;
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  state = {
    configured: true, mailboxes: ["tioperfumes07@gmail.com", "jpm@tioperfumes.com"], schedule: "Every day at 6:15 AM Laredo time", running: false,
    accounts: [{ email: "tioperfumes07@gmail.com", status: "connected", last_error: null, connected_at: "2026-11-25T23:00:00Z", last_checked_at: "2026-11-26T12:15:00Z" }],
    rules: [{ id: "r1", from_address: "kanak@pca.com", file_text: null, vendor_id: "v-pca", vendor_name: "PCA", special: false, ignore: false, created_at: "2026-11-25T23:00:00Z" }],
    runs: [{ id: "run1", trigger: "schedule", started_at: "2026-11-26T12:15:00Z", finished_at: "2026-11-26T12:16:00Z", accounts: 1, messages_seen: 9, imported: 1, held: 1, unassigned: 1, failed: 0, error: null }],
    files: [
      F({ id: "f1" }),
      F({ id: "f2", file_name: "MTZ.xls", sender: "sales@mtz.com", vendor_id: "v-mtz", vendor_name: "MTZ", status: "held", reason: "Old Excel format (.xls) — open it on the Lists tab.", list_id: null }),
      F({ id: "f3", file_name: "ELEGANCE 11-24.xlsx", sender: "ana@elegance.com", vendor_id: null, vendor_name: null, status: "unassigned", reason: "Sender not set up — pick the vendor on the desk.", list_id: null }),
    ],
  };
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/perfume/mail") return state;
    if (path === "/api/v1/perfume/vendors") return { vendors: [
      { id: "v-pca", name: "PCA", kind: "buy" }, { id: "v-mtz", name: "MTZ", kind: "buy" }, { id: "v-eleg", name: "ELEGANCE", kind: "buy" }, { id: "v-mine", name: "MY OFFER", kind: "offer" },
    ] };
    if (opts?.method === "POST") {
      posts.push([path, opts.body]);
      if (path.endsWith("/import")) return { status: "imported", rowsSaved: 812 };
      return { ok: true, started: true, id: "r2" };
    }
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ToastProvider><MemoryRouter initialEntries={["/perfume?tab=mail"]}><PerfumeMailPanel /></MemoryRouter></ToastProvider>
  </QueryClientProvider>);

describe("Mail price lists", () => {
  it("shows both TIO mailboxes, the schedule and the last run", async () => {
    mount();
    const boxes = await screen.findAllByTestId("perfume-mail-account");
    expect(boxes.map((b) => within(b).getAllByText(/@/)[0].textContent)).toEqual(["tioperfumes07@gmail.com", "jpm@tioperfumes.com"]);
    expect(within(boxes[0]).getByText(/Connected \(read-only\)/)).toBeTruthy();
    expect(within(boxes[1]).getByText("Not connected")).toBeTruthy();
    expect(screen.getByTestId("perfume-mail-schedule").textContent).toBe("Every day at 6:15 AM Laredo time");
    expect(screen.getByTestId("perfume-mail-last-run").textContent).toContain("9 emails · 1 imported · 1 held · 1 from senders not set up · 0 failed");
  });
  it("'Needs you' lists only the held and not-set-up files, each with its reason", async () => {
    mount();
    expect(await screen.findByText("MTZ.xls")).toBeTruthy();
    expect(screen.getByText("ELEGANCE 11-24.xlsx")).toBeTruthy();
    expect(screen.queryByText("PCA 11-25.xlsx")).toBeNull();
    expect(screen.getByText("Old Excel format (.xls) — open it on the Lists tab.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-mail-show-all"));
    expect(await screen.findByText("PCA 11-25.xlsx")).toBeTruthy();
  });
  it("Check mail now starts a run", async () => {
    mount();
    const btn = await screen.findByTestId("perfume-mail-run");
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(posts.map((p) => p[0])).toContain("/api/v1/perfume/mail/run"));
  });
  it("a file from a sender not set up: pick the vendor once, the file is imported and the sender is kept", async () => {
    mount();
    const vendor = await screen.findByRole("combobox", { name: "Vendor of this sender" }) as HTMLInputElement;
    fireEvent.focus(vendor); fireEvent.click(vendor);
    fireEvent.click(await screen.findByText("ELEGANCE"));
    expect(screen.queryByText("MY OFFER")).toBeNull();
    fireEvent.click(screen.getByTestId("perfume-mail-assign"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/perfume/mail/files/f3/import", { vendor_id: "v-eleg", special: false }]));
  });
  it("a held file can be imported anyway", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("perfume-mail-force"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/perfume/mail/files/f2/import", { force: true }]));
  });
});
