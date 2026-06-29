import { describe, expect, it } from "vitest";
import { __test__ } from "./pdf-renderer.service.js";

const { buildPdfHtml } = __test__;

const basePayload = {
  templateCode: "lease_to_own",
  templateVersion: 1,
  contractInstanceId: "11111111-1111-1111-1111-111111111111",
  language: "en" as const,
  signerName: "Jane Driver",
  contentHtmlEn: "<p>Lease terms for {{unit_number}}.</p>",
  contentHtmlEs: "<p>Términos de arrendamiento para {{unit_number}}.</p>",
  filledVariables: { unit_number: "TRK-42" },
  signedAtIso: "2026-06-29T12:00:00.000Z",
  typedSignature: "Jane Driver",
  drawnSignatureSvg: "<svg><path d='M0 0 L10 10' /></svg>",
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0",
};

describe("legal pdf-renderer draft option", () => {
  it("signed render (draft=false) keeps the signature evidence block and adds no watermark", () => {
    const html = buildPdfHtml({ ...basePayload, draft: false });
    expect(html).toContain("Electronic Signature Evidence");
    expect(html).toContain("Jane Driver");
    expect(html).not.toContain("DRAFT — NOT EXECUTED");
    expect(html).not.toContain("draft-watermark");
  });

  it("signed render is byte-identical whether draft is omitted or explicitly false", () => {
    const omitted = buildPdfHtml(basePayload);
    const explicitFalse = buildPdfHtml({ ...basePayload, draft: false });
    expect(omitted).toBe(explicitFalse);
  });

  it("draft render (draft=true) stamps the watermark/header and omits the signature evidence", () => {
    const html = buildPdfHtml({ ...basePayload, draft: true });
    expect(html).toContain("DRAFT — NOT EXECUTED");
    expect(html).toContain("draft-watermark");
    expect(html).toContain("draft-banner");
    expect(html).not.toContain("Electronic Signature Evidence");
    // resolved template content is still rendered for review
    expect(html).toContain("TRK-42");
  });
});
