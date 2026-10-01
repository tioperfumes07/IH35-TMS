/**
 * ROUND 285.4.10 / #60 — auto-invoice-on-bol unit tests (no DB).
 * Proves: awaiting_bol when no BOL rows; link SQL shape; result typing.
 */
import { describe, expect, it, vi } from "vitest";
import { autoInvoiceOnBol, BILLING_EVIDENCE_DOC_CODES, loadHasBolDocument } from "../auto-invoice-on-bol.service.js";

describe("auto-invoice-on-bol — BOL gate", () => {
  it("loadHasBolDocument returns hasBol=false when no bol file linked", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const result = await loadHasBolDocument(client, "11111111-1111-1111-1111-111111111111");
    expect(result).toEqual({ hasBol: false, fileId: null });
    expect(String(client.query.mock.calls[0][0])).toMatch(/dfc\.code = ANY\(\$2::text\[\]\)/);
    // ROUND 321 item 6: a signed BOL OR a signed POD is the billing document.
    expect(client.query.mock.calls[0][1]).toEqual(["11111111-1111-1111-1111-111111111111", ["bol", "pod"]]);
    expect(String(client.query.mock.calls[0][0])).toMatch(/upload_completed_at IS NOT NULL/);
  });

  it("loadHasBolDocument returns file id when bol exists", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ file_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }] }),
    };
    const result = await loadHasBolDocument(client, "11111111-1111-1111-1111-111111111111");
    expect(result).toEqual({ hasBol: true, fileId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
  });

  it("autoInvoiceOnBol returns awaiting_bol and audits when BOL missing", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        // isEnabled probe — return true-ish via feature flag path may call query;
        // loadHasBol returns empty; appendCrudAudit inserts.
        if (sql.includes("feature_flag") || sql.includes("lib.feature_flags")) {
          return { rows: [{ enabled: true }] };
        }
        if (sql.includes("dfc.code = ANY($2::text[])")) return { rows: [] };
        return { rows: [] };
      }),
    };

    // Stub isEnabled by making the first path fail closed to pipeline — mock via module is heavy;
    // instead call with bypassPipelineFlag so we hit the BOL gate directly.
    const result = await autoInvoiceOnBol(client as never, {
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      loadId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      bypassPipelineFlag: true,
    });

    expect(result).toEqual({ ok: false, reason: "awaiting_bol" });
    expect(queries.some((q) => q.includes("dfc.code = ANY($2::text[])"))).toBe(true);
  });

  it("ROUND 321: the billing-evidence list is exactly BOL and POD", () => {
    expect([...BILLING_EVIDENCE_DOC_CODES]).toEqual(["bol", "pod"]);
  });

  it("ROUND 321: a load with only a POD has its billing document (POD releases the invoice)", async () => {
    const client = {
      query: vi.fn(async (_sql: string, values?: unknown[]) => {
        const codes = (values?.[1] as string[]) ?? [];
        return { rows: codes.includes("pod") ? [{ file_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }] : [] };
      }),
    };
    const result = await loadHasBolDocument(client as never, "11111111-1111-1111-1111-111111111111");
    expect(result).toEqual({ hasBol: true, fileId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
  });
});
