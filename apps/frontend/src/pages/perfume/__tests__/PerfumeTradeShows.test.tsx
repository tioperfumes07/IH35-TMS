import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeTradeShowsPanel } from "../PerfumeTradeShowsPanel";
import type { PerfumeShow } from "../../../api/perfume";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 15:56 CT: "i am still missing all the other views that you or he other agent deisnged" — the trade show planner.
const show = (id: string, name: string, starts: string, city: string, iGo: boolean): PerfumeShow => ({ id, name, starts_on: starts, ends_on: starts, city, country: null,
  kind: "Duty free", dates_status: "Confirmed", i_go: iGo, venue: null, website: null, notes: null, source: "EventsEye", organizer: null, register_url: null, contact_email: null, contact_phone: null, contacts: 0, meetings: 0 });
let shows: PerfumeShow[];
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  shows = [{ ...show("s1", "TFWA World Exhibition & Conference", "2027-10-03", "Cannes, France", true), website: "www.tfwa.com", register_url: "https://www.tfwa.com/register",
    organizer: "TFWA", contact_email: "info@tfwa.com", contact_phone: "+33 1 40 74 09 86" }, show("s2", "Beautyworld Middle East", "2027-10-27", "Dubai, UAE", false)];
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/trade-shows") return { shows };
    if (path.endsWith("/i-go")) { shows = shows.map((s) => (path.includes(s.id) ? { ...s, i_go: (opts!.body as { i_go: boolean }).i_go } : s)); return { ok: true }; }
    if (path.includes("/contacts")) return { contacts: [] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeTradeShowsPanel /></ToastProvider></QueryClientProvider>);

describe("trade show planner", () => {
  it("lists every show, filters to the ones I go to, and saves I go with one click", async () => {
    mount();
    const panel = await screen.findByTestId("perfume-trade-shows-panel");
    await waitFor(() => expect(within(panel).getAllByText("Beautyworld Middle East").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId("perfume-shows-only-go"));
    await waitFor(() => expect(within(panel).queryAllByText("Beautyworld Middle East").length).toBe(0));
    fireEvent.click(screen.getByTestId("perfume-shows-only-go"));
    fireEvent.click(await screen.findByTestId("perfume-show-igo-s2"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/trade-shows/s2/i-go", { i_go: true }]));
  });
  it("a show opens with its contacts and the box to add one", async () => {
    mount();
    fireEvent.click((await screen.findAllByText("TFWA World Exhibition & Conference"))[0]!);
    const detail = await screen.findByTestId("perfume-show-detail");
    expect(within(detail).getByTestId("perfume-show-find-contact")).toBeTruthy();
    expect(await within(detail).findByText("No contact linked to this show yet.")).toBeTruthy();
  });
  it("each show links to its register page and website in a new tab, with the organizer's email and phone (owner 2026-11-26 17:08 CT)", async () => {
    mount();
    const reg = await screen.findByTestId("perfume-show-register-s1");
    expect(reg.getAttribute("href")).toBe("https://www.tfwa.com/register");
    expect(reg.getAttribute("target")).toBe("_blank");
    expect(screen.getAllByText("tfwa.com")[0]!.closest("a")!.getAttribute("href")).toBe("https://www.tfwa.com/");
    expect(screen.getAllByText("info@tfwa.com")[0]!.closest("a")!.getAttribute("href")).toBe("mailto:info@tfwa.com");
    expect(screen.getAllByText("+33 1 40 74 09 86")[0]!.closest("a")!.getAttribute("href")).toBe("tel:+33140740986");
    // A show with no web address shows no link.
    expect(screen.queryByTestId("perfume-show-register-s2")).toBeNull();
  });
});
