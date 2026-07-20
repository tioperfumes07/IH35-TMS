import { describe, expect, it, vi } from "vitest";

vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-FAKE")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { buildEldAuditPdfHtml, renderEldAuditPdf } from "../eld-audit-pdf-renderer.service.js";

const SAMPLE = {
  title: "FMCSA ELD Edit History Report",
  generated_at: "2026-07-20T12:00:00.000Z",
  driver_uuid: "d1",
  driver_name: "Ada Driver",
  period: { from: "2026-05-01", to: "2026-05-31" },
  edits: [
    {
      id: "e1",
      edited_at: "2026-05-01T10:00:00.000Z",
      edited_by: "dispatcher@ih35.com",
      reason: "Corrected off-duty gap",
      field_name: "duty_status",
      before_state: "off_duty",
      after_state: "sleeper",
    },
  ],
  fmcsa_notice: "This report is read-only.",
};

describe("ELD audit PDF renderer", () => {
  it("builds HTML with escaped edit rows (no window.print)", () => {
    const html = buildEldAuditPdfHtml({
      ...SAMPLE,
      edits: [
        {
          ...SAMPLE.edits[0]!,
          before_state: "<script>alert(1)</script>",
          reason: 'a & b "c"',
        },
      ],
    });
    expect(html).toContain("FMCSA ELD Edit History Report");
    expect(html).toContain("Ada Driver");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("a &amp; b &quot;c&quot;");
    expect(html).not.toMatch(/window\.print|popup\.print/);
  });

  it("renders application/pdf bytes via puppeteer page.pdf", async () => {
    const result = await renderEldAuditPdf(SAMPLE);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filename).toMatch(/^ELD_Edit_History_Ada_Driver_2026-05-31\.pdf$/);
    expect(result.pdfBuffer.toString("utf8")).toContain("%PDF");
  });
});
