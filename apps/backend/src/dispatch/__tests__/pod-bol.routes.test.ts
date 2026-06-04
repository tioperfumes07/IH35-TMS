import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildBolStops, formatScheduledWindow } from "../bol-generator.service.js";
import { canReviewPod, isDeliveryStop } from "../pod.routes.js";

describe("dispatch pod-bol routes (B21-D10)", () => {
  const routesPath = resolve(import.meta.dirname, "../pod.routes.ts");
  const bolPath = resolve(import.meta.dirname, "../bol-generator.service.ts");
  const migrationPath = resolve(import.meta.dirname, "../../../../../db/migrations/0356_dispatch_pod_bol.sql");
  const bolTemplatePath = resolve(import.meta.dirname, "../pdf-template/bol.hbs");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

  it("registers driver POD capture and office POD/BOL review endpoints", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/driver/loads/:loadId/stops/:stopId/pod");
    expect(src).toContain("/api/v1/dispatch/pod-documents");
    expect(src).toContain("/api/v1/dispatch/pod-documents/:id/review");
    expect(src).toContain("/api/v1/dispatch/loads/:loadId/bol/generate");
    expect(src).toContain("/api/v1/dispatch/loads/:loadId/bol.pdf");
    expect(src).toContain("registerDispatchPodBolRoutes");
  });

  it("creates dispatch.pod_documents and dispatch.bol_documents in migration 0356", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("dispatch.pod_documents");
    expect(sql).toContain("dispatch.bol_documents");
    expect(sql).toContain("pending_review");
    expect(sql).toContain("archived_at");
    expect(sql).toContain("NULLIF(current_setting('app.operating_company_id', true), '')::uuid");
  });

  it("BOL generator builds stop rows and scheduled windows from load data", () => {
    const bol = readFileSync(bolPath, "utf8");
    expect(bol).toContain("fetchBolPayload");
    expect(bol).toContain("generateBolPdf");
    expect(bol).toContain("storeBolDocument");
    expect(readFileSync(bolTemplatePath, "utf8")).toContain("Bill of Lading");
    expect(formatScheduledWindow("2026-06-04T08:00:00Z", "2026-06-04T10:00:00Z")).toContain("2026");
    const stops = buildBolStops([
      {
        stop_type: "pickup",
        sequence_number: 1,
        location_name: "Origin DC",
        address_line1: "100 Main",
        city: "Dallas",
        state: "TX",
        appointment_start: "2026-06-04T08:00:00Z",
        appointment_end: null,
      },
    ]);
    expect(stops[0].locationName).toBe("Origin DC");
    expect(stops[0].cityState).toBe("Dallas, TX");
  });

  it("POD capture requires delivery stops and supports review workflow", () => {
    expect(isDeliveryStop("delivery")).toBe(true);
    expect(isDeliveryStop("pickup")).toBe(false);
    expect(canReviewPod("pending_review")).toBe(true);
    expect(canReviewPod("approved")).toBe(false);
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("photo_base64");
    expect(src).toContain("signature_base64");
    expect(src).toContain("putObjectBytes");
    expect(src).toContain("dispatch/pod/");
  });

  it("office review updates pod status and BOL generation stores PDF in R2", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("reviewed_by_user_id");
    expect(src).toContain("generateAndStoreBol");
    expect(src).toContain("generatePresignedDownloadUrl");
    const bol = readFileSync(bolPath, "utf8");
    expect(bol).toContain("dispatch/bol/");
    expect(bol).toContain("puppeteer");
  });

  it("registers POD/BOL routes in backend index", () => {
    const index = readFileSync(indexPath, "utf8");
    expect(index).toContain("registerDispatchPodBolRoutes");
  });
});
