import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { listAllDrivers } from "../../../api/mdata";
import { getSafetyKpis } from "../../../api/safety";
import type { Driver } from "../../../types/api";
import { DriverQualificationMatrix } from "./DriverQualificationMatrix";

vi.mock("../../../api/mdata", () => ({ listAllDrivers: vi.fn() }));
vi.mock("../../../api/safety", () => ({ getSafetyKpis: vi.fn() }));
// Table mechanics are covered by the shared table suite; retain its actual column renderers.
vi.mock("../../../components/parity/ParityTable", () => ({ ParityTable: ({ rows, columns }: any) => <table><tbody>{rows.map((row: Driver) => <tr key={row.id}>{columns.map((column: any) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody></table> }));
const driver = (id: string, fields: Partial<Driver> = {}) => ({ id, first_name: "EXAMPLE", last_name: id, cdl_expires_at: null, dot_medical_expires_at: null, visa_expires_at: null, b1_visa_expires_date: null, emergency_contact_name: null, emergency_contact_phone_primary: null, emergency_contact_phone_alternate: null, samsara_driver_id: null, ...fields }) as Driver;
function mount(companyId = "company-fixture", entry = "/safety/driver-files") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <DriverQualificationMatrix companyId={companyId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe("driver qualification board uses the canonical roster", () => {
  beforeEach(() => {
    vi.mocked(listAllDrivers).mockReset();
    vi.mocked(getSafetyKpis).mockReset().mockResolvedValue({ drivers_with_open_fines: 2, critical_integrity_alerts: 1 });
  });
  it("scopes reads, formats real dates and links every record to its source", async () => {
    vi.mocked(listAllDrivers).mockResolvedValue({ drivers: [driver("one", { cdl_expires_at: "2027-06-15", samsara_driver_id: "external-fixture" })], total: 1 });
    mount();
    const driverHref = (await screen.findByRole("link", { name: "Example One" })).getAttribute("href") ?? "";
    expect(driverHref.startsWith("/drivers/one")).toBe(true);
    expect(listAllDrivers).toHaveBeenCalledWith({ operating_company_id: "company-fixture", status: "Active" });
    expect(screen.getByRole("link", { name: "06/15/2027" }).getAttribute("href") ?? "").toMatch(/^\/drivers\/one/);
    expect(screen.getByRole("link", { name: "Linked" }).getAttribute("href") ?? "").toMatch(/^\/drivers\/one/);
    expect(screen.getByRole("link", { name: "Review records" }).getAttribute("href") ?? "").toMatch(/^\/drivers\/one/);
    expect(screen.queryByText("paper")).not.toBeInTheDocument();
    expect(screen.queryByText("external-fixture")).not.toBeInTheDocument();
  });
  it("N24 — midnight-UTC expiry stays the stored calendar day (no Central shift)", async () => {
    vi.mocked(listAllDrivers).mockResolvedValue({
      drivers: [driver("one", { cdl_expires_at: "2029-09-22T00:00:00.000Z" })],
      total: 1,
    });
    mount();
    expect(await screen.findByRole("link", { name: "09/22/2029" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "09/21/2029" })).not.toBeInTheDocument();
  });
  it("KPI clicks filter the exact counted cohort; view all restores it", async () => {
    vi.mocked(listAllDrivers).mockResolvedValue({ drivers: [driver("one", { dot_medical_expires_at: "2027-06-15" }), driver("two")], total: 2 });
    mount();
    await screen.findByRole("link", { name: "Example Two" });
    fireEvent.click(screen.getByRole("button", { name: /DOT medical on file/ }));
    expect(screen.queryByRole("link", { name: "Example Two" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Example One" })).toBeInTheDocument();
    // Cohort lands in URL so EntityLink ret restores the filtered matrix on Back.
    const medicalHref = screen.getByRole("link", { name: "Example One" }).getAttribute("href") ?? "";
    expect(decodeURIComponent(new URL(medicalHref, "http://local").searchParams.get("ret") ?? "")).toContain(
      "cohort=medical",
    );
    fireEvent.click(screen.getByRole("button", { name: /View all active drivers/ }));
    expect(screen.getByRole("link", { name: "Example Two" })).toBeInTheDocument();
  });
  it("hydrates cohort from ?cohort= so Back restores the filtered matrix", async () => {
    vi.mocked(listAllDrivers).mockResolvedValue({
      drivers: [driver("one", { cdl_expires_at: "2027-06-15" }), driver("two")],
      total: 2,
    });
    mount("company-fixture", "/safety/driver-files?cohort=cdl");
    expect(await screen.findByRole("link", { name: "Example One" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Example Two" })).not.toBeInTheDocument();
    const href = screen.getByRole("link", { name: "Example One" }).getAttribute("href") ?? "";
    expect(decodeURIComponent(new URL(href, "http://local").searchParams.get("ret") ?? "")).toContain("cohort=cdl");
  });
  it("a contact requires a name and reachable phone, not merely a name", async () => {
    vi.mocked(listAllDrivers).mockResolvedValue({ drivers: [driver("one", { emergency_contact_name: "Example contact" })], total: 1 });
    mount();
    expect(await screen.findByRole("link", { name: "Add contact" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Emergency contact/ }));
    expect(screen.queryByRole("link", { name: "Example One" })).not.toBeInTheDocument();
  });
  it("never presents a failed roster as zero drivers", async () => {
    vi.mocked(listAllDrivers).mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load driver qualifications")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Active drivers/ })).not.toBeInTheDocument();
  });
  it("never requests an unscoped roster", () => {
    mount("");
    expect(listAllDrivers).not.toHaveBeenCalled();
    expect(getSafetyKpis).not.toHaveBeenCalled();
  });
  it("discloses both fine sources and the exact alert count definition", async () => {
    vi.mocked(listAllDrivers).mockResolvedValue({ drivers: [], total: 0 });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Open fines/ }));
    expect(screen.getByRole("link", { name: /Civil fine register/ }).getAttribute("href") ?? "").toMatch(
      /^\/safety\/external-fines/,
    );
    expect(screen.getByRole("link", { name: /Internal fine register/ }).getAttribute("href") ?? "").toMatch(
      /^\/safety\/internal-fines/,
    );
    fireEvent.click(screen.getByRole("button", { name: /Critical integrity alerts/ }));
    expect(screen.getByText(/unresolved or investigating and not currently snoozed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Integrity alert register/ }).getAttribute("href") ?? "").toMatch(
      /^\/safety\/integrity-alerts/,
    );
  });
});
