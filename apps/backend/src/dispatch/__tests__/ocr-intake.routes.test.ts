import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildBookLoadPrefillFromExtracted,
  heuristicExtractFromFilename,
  shouldAutoProcessQueueItem,
} from "../ocr-intake.lib.js";

describe("dispatch ocr intake routes (B21-D7)", () => {
  const routesPath = resolve(import.meta.dirname, "../ocr-intake.routes.ts");
  const servicePath = resolve(import.meta.dirname, "../ocr-processor.service.ts");
  const migrationPath = resolve(import.meta.dirname, "../../../../../db/migrations/0354_dispatch_ocr_intake.sql");
  const indexPath = resolve(import.meta.dirname, "../../index.ts");

  it("registers OCR queue, email webhook, convert, and reprocess endpoints", () => {
    const src = readFileSync(routesPath, "utf8");
    expect(src).toContain("/api/v1/dispatch/ocr-intake/queue");
    expect(src).toContain("/api/v1/dispatch/ocr-intake/webhook/email");
    expect(src).toContain("/api/v1/dispatch/ocr-intake/items/:id/convert");
    expect(src).toContain("/api/v1/dispatch/ocr-intake/items/:id/reprocess");
    expect(src).toContain("registerDispatchOcrIntakeRoutes");
  });

  it("creates dispatch.ocr_intake_queue with review statuses in migration 0354", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("dispatch.ocr_intake_queue");
    expect(sql).toContain("ready_review");
    expect(sql).toContain("email_forward");
    expect(sql).toContain("NULLIF(current_setting('app.operating_company_id', true), '')::uuid");
  });

  it("email webhook intake stores PDF in R2 and schedules async OCR processing", () => {
    const service = readFileSync(servicePath, "utf8");
    expect(service).toContain("createOcrIntakeFromEmail");
    expect(service).toContain("putObjectBytes");
    expect(service).toContain("scheduleOcrIntakeProcessing");
    expect(service).toContain("dispatch/ocr/");
    expect(shouldAutoProcessQueueItem("pending_ocr")).toBe(true);
  });

  it("async processor writes extracted_fields for review queue", () => {
    const service = readFileSync(servicePath, "utf8");
    expect(service).toContain("processOcrIntakeQueueItem");
    expect(service).toContain("extracted_fields");
    expect(service).toContain("ready_review");
    const extracted = heuristicExtractFromFilename("ACME_1500_L12345.pdf", "dispatch/ocr/oc1/x.pdf");
    expect(extracted.customer_name_raw).toContain("ACME");
    expect(extracted.rate_cents).toBe(150000);
  });

  it("convert returns BookLoad prefill payload from extracted OCR fields", () => {
    const service = readFileSync(servicePath, "utf8");
    expect(service).toContain("getOcrIntakeConvertPrefill");
    expect(service).toContain("book_load_prefill");
    const prefill = buildBookLoadPrefillFromExtracted({
      customer_name_raw: "Acme",
      customer_id: "c1",
      origin_city: "Dallas",
      origin_state: "TX",
      destination_city: "Houston",
      destination_state: "TX",
      pickup_date: "2026-06-03",
      delivery_date: "2026-06-04",
      rate_cents: 250000,
      ocr_source_pdf_r2_key: "dispatch/ocr/x/y.pdf",
    });
    expect(prefill.customer_name).toBe("Acme");
    expect(prefill.linehaul_cents).toBe(250000);
    expect(Array.isArray(prefill.stops)).toBe(true);
  });

  it("registers OCR intake routes in backend index", () => {
    const index = readFileSync(indexPath, "utf8");
    expect(index).toContain("registerDispatchOcrIntakeRoutes");
  });
});
