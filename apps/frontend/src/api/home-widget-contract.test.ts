import * as client from "./client";
import {
  fetchHomeWoStatusCounts,
  fetchHomeWeeklyRevenue,
  fetchHomeOpenLoadsCount,
  fetchHomeDriversOnDuty,
  fetchHomeWosOpenCount,
  fetchHomeFleetUtilization,
  fetchHomeTodayRevenue,
  fetchHomeCashPosition,
  fetchHomeFactoringBalance,
} from "./home";
import { beforeEach, describe, expect, it, vi } from "vitest";

// REGRESSION GUARD (GUARD audit HOME-2..6): the Home dashboard tiles read undefined → 0/[] when the
// frontend reader and the backend `home-widgets` response shapes drift apart. These tests pin each
// reader to the EXACT shape `apps/backend/src/home/home-widgets.routes.ts` returns, so a future
// rename on either side fails here instead of silently zeroing the dashboard.
describe("home-widgets FE↔BE response contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("wo-status-counts: reads the backend keyed object (not an array)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      draft: 1,
      open: 2,
      in_progress: 3,
      awaiting_parts: 4,
      completed: 5,
      cancelled: 6,
      unknown: 0,
    } as never);
    const rows = await fetchHomeWoStatusCounts("c1");
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    expect(byStatus).toMatchObject({ open: 2, in_progress: 3, awaiting_parts: 4, completed: 5, cancelled: 6, draft: 1 });
  });

  it("weekly-revenue: reads { days: [{ date, cents, invoice_basis, gl_posted }] }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      days: [
        { date: "2026-06-28", cents: 12_345, invoice_basis_cents: 12_345, gl_posted_revenue_cents: 12_000 },
        { date: "2026-06-29", cents: 0, invoice_basis_cents: 0, gl_posted_revenue_cents: 0 },
      ],
      totalCents: 12_345,
      status: "ok",
      basis: {
        invoice: { label: "invoice_basis", source: "accounting.invoices", recognition: "delivery" },
        gl: { label: "gl_posted", source: "accounting.journal_entry_postings", recognition: "entry_date" },
      },
    } as never);
    const points = await fetchHomeWeeklyRevenue("c1", 7);
    expect(points).toEqual([
      { date: "2026-06-28", revenue_cents: 12_345, invoice_basis_cents: 12_345, gl_posted_revenue_cents: 12_000 },
      { date: "2026-06-29", revenue_cents: 0, invoice_basis_cents: 0, gl_posted_revenue_cents: 0 },
    ]);
  });

  it("open-loads-count: reads { total, in_transit, assigned, unassigned }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ total: 4, in_transit: 1, assigned: 2, unassigned: 1 } as never);
    expect(await fetchHomeOpenLoadsCount("c1")).toEqual({ total: 4, in_transit: 1, assigned: 2, unassigned: 1 });
  });

  it("drivers-on-duty: reads { active, total_drivers, on_break } (denominator present)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ active: 3, total_drivers: 84, on_break: 0 } as never);
    expect(await fetchHomeDriversOnDuty("c1")).toEqual({ active: 3, total_drivers: 84, on_break: 0 });
  });

  it("wos-open-count: reads { open, in_progress }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ open: 11, in_progress: 4 } as never);
    expect(await fetchHomeWosOpenCount("c1")).toEqual({ open: 11, in_progress: 4 });
  });

  it("fleet-utilization: reads snake_case { active_units, total_units, percentage }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ active_units: 8, total_units: 10, percentage: 80 } as never);
    expect(await fetchHomeFleetUtilization("c1")).toEqual({ active_units: 8, total_units: 10, percentage: 80 });
  });

  it("today-revenue: reads dual-basis invoice + GL fields (0280-02)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      revenue_cents: 4_900,
      invoice_basis_cents: 4_900,
      gl_posted_revenue_cents: 4_900,
      status: "ok",
      basis: {
        invoice: { label: "invoice_basis", source: "accounting.invoices", recognition: "delivery" },
        gl: { label: "gl_posted", source: "accounting.journal_entry_postings", recognition: "entry_date" },
      },
      discrepancy_count: 0,
      discrepancy_cents: 0,
    } as never);
    const tr = await fetchHomeTodayRevenue("c1");
    expect(tr.revenue_cents).toBe(4_900);
    expect(tr.invoice_basis_cents).toBe(4_900);
    expect(tr.gl_posted_revenue_cents).toBe(4_900);
    expect(tr.basis?.invoice.label).toBe("invoice_basis");
  });

  it("today-revenue: unverifiable keeps revenue_cents null (never fabricates $0)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      revenue_cents: null,
      status: "unverifiable",
      unverifiable_reason: "missing_table:accounting.transaction_source_links",
    } as never);
    const tr = await fetchHomeTodayRevenue("c1");
    expect(tr.revenue_cents).toBeNull();
    expect(tr.status).toBe("unverifiable");
  });

  it("today-revenue: maps 422 revenue_gl_linkage_unverifiable to typed unverifiable", async () => {
    vi.spyOn(client, "apiRequest").mockRejectedValue(
      new client.ApiError(422, {
        error: "revenue_gl_linkage_unverifiable",
        unverifiable_reason: "missing_table:accounting.posting_batches",
        revenue_cents: null,
      })
    );
    const tr = await fetchHomeTodayRevenue("c1");
    expect(tr.status).toBe("unverifiable");
    expect(tr.revenue_cents).toBeNull();
    expect(tr.unverifiable_reason).toContain("posting_batches");
  });

  it("today-revenue: real 500 is thrown (not labeled schema unverifiable)", async () => {
    const err = new client.ApiError(500, { error: "revenue_gl_linkage_failed", message: "connection_reset" });
    vi.spyOn(client, "apiRequest").mockRejectedValue(err);
    await expect(fetchHomeTodayRevenue("c1")).rejects.toBe(err);
    expect(err.status).toBe(500);
  });

  it("today-revenue: exposes drill hrefs for forward navigation", async () => {
    const invId = "11111111-1111-4111-8111-111111111112";
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      revenue_cents: 5000,
      status: "ok",
      discrepancy_count: 1,
      discrepancy_cents: 5000,
      drill: {
        mismatched_invoices: [
          {
            invoice_id: invId,
            display_id: "INV-X",
            recognition_date: "2026-07-18",
            invoice_revenue_cents: 5000,
            gl_revenue_cents: 0,
            journal_entry_ids: [],
            reason: "missing_je",
            href: `/accounting/invoices/${invId}`,
          },
        ],
        mismatched_journal_entries: [],
      },
    } as never);
    const tr = await fetchHomeTodayRevenue("c1");
    expect(tr.drill?.mismatched_invoices[0]?.href).toBe(`/accounting/invoices/${invId}`);
  });

  it("cash-position: reads backend { totalCents } into balance_cents (not balance_cents)", async () => {
    // Backend returns { totalCents, byAccount } — reading `balance_cents` zeroed the tile (HOME-2).
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      totalCents: 10_000_000,
      byAccount: [{ accountName: "Ops", cents: 10_000_000 }],
    } as never);
    const cp = await fetchHomeCashPosition("c1");
    expect(cp.balance_cents).toBe(10_000_000);
  });

  it("factoring-balance: headlines outstanding Faro LIABILITY, never reserveCents", async () => {
    // 0280-05: outstanding_liability_cents is the tile; reserve is separate and never netted.
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      status: "ok",
      outstanding_liability_cents: 7_500_000,
      reserve_receivable_cents: 2_500_000,
      reserveCents: 2_500_000,
      advancedCents: 7_500_000,
      totalCents: 7_500_000,
      invoice_count: 4,
      invoices_factored: 4,
    } as never);
    const fb = await fetchHomeFactoringBalance("c1");
    expect(fb.outstanding_cents).toBe(7_500_000);
    expect(fb.reserve_receivable_cents).toBe(2_500_000);
    expect(fb.invoices_factored).toBe(4);
    expect(fb.outstanding_cents).not.toBe(fb.reserve_receivable_cents);
    // Must not prefer reserve as the headline when liability fields are present.
    expect(fb.outstanding_cents).not.toBe(2_500_000);
  });

  it("factoring-balance: unverifiable keeps outstanding_cents null (never coerces to $0)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      status: "unverifiable",
      unverifiable_reason: "mixed_factor_assignment",
      outstanding_liability_cents: null,
      reserve_receivable_cents: null,
      outstanding_cents: null,
      reserveCents: null,
      totalCents: null,
      invoice_count: null,
    } as never);
    const fb = await fetchHomeFactoringBalance("c1");
    expect(fb.status).toBe("unverifiable");
    expect(fb.outstanding_cents).toBeNull();
    expect(fb.reserve_receivable_cents).toBeNull();
    expect(fb.invoices_factored).toBeNull();
    expect(fb.outstanding_cents).not.toBe(0);
  });

  it("factoring-balance: accounting_exception keeps headline null (never $0)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      status: "accounting_exception",
      unverifiable_reason: "accounting_exception:debit_liability_anomaly",
      outstanding_liability_cents: null,
      diagnostics: { outstanding_liability_signed_cents: -150_000 },
      totalCents: null,
    } as never);
    const fb = await fetchHomeFactoringBalance("c1");
    expect(fb.status).toBe("accounting_exception");
    expect(fb.outstanding_cents).toBeNull();
    expect(fb.outstanding_cents).not.toBe(0);
  });
});
