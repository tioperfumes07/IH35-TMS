import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("multi-stop extra rates (GAP-31)", () => {
  const servicePath = resolve(import.meta.dirname, "../extra-rate.service.ts");
  const routesPath = resolve(import.meta.dirname, "../extra-rate.routes.ts");
  const fromLoadPath = resolve(import.meta.dirname, "../../../../accounting/from-load.ts");
  const indexPath = resolve(import.meta.dirname, "../../../../index.ts");

  it("service exposes add/list/total/soft-delete operations", () => {
    const src = readFileSync(servicePath, "utf8");
    expect(src).toContain("export async function addStopExtra");
    expect(src).toContain("export async function listForLoad");
    expect(src).toContain("export async function totalForLoad");
    expect(src).toContain("export async function softDelete");
    expect(src).toContain("dispatch.stop_extra_rates");
    expect(src).toContain("is_active = true");
  });

  it("routes expose post/get/delete stop extra endpoints", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates");
    expect(src).toContain("/api/v1/dispatch/loads/:load_uuid/extra-rates");
    expect(src).toContain("/api/v1/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates/:rate_uuid");
    expect(src).toContain("registerLoadStopExtraRateRoutes");
  });

  it("invoice build from load includes active stop extras as accessorial lines", () => {
    const src = readFileSync(fromLoadPath, "utf8");
    expect(src).toContain("dispatch.stop_extra_rates");
    expect(src).toContain("line_type");
    expect(src).toContain("revenue_code");
    expect(src).toContain("account_id");
    expect(src).toContain("display_order");
    expect(src).toContain("'accessorial'");
    expect(src).toContain("invoice_line_uuid");
    expect(src).toContain("recomputeInvoiceTotals");
  });

  it("bootstraps extra-rate routes in backend index", () => {
    const src = readFileSync(indexPath, "utf8");
    expect(src).toContain("registerLoadStopExtraRateRoutes");
  });
});
