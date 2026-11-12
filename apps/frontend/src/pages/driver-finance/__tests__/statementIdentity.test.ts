import { describe, expect, it } from "vitest";
import { statementIdentity } from "../statementIdentity";

describe("statementIdentity", () => {
  it("prefers driver AlwaysTrack source_document_ref", () => {
    expect(
      statementIdentity({
        settlement: { source_document_ref: "5851", status: "locked" },
        companyDisplayId: "9999",
      }),
    ).toBe("5851");
  });

  it("falls back to linked company AlwaysTrack display_id when driver has none", () => {
    expect(
      statementIdentity({
        settlement: { status: "locked", source_document_ref: null },
        companyDisplayId: "5851",
      }),
    ).toBe("5851");
  });

  it("rejects non-AlwaysTrack company display_id (no bare dash when open)", () => {
    expect(
      statementIdentity({
        settlement: { status: "open", source_document_ref: null },
        companyDisplayId: "S-2026-0001",
      }),
    ).toBe("PENDING");
  });

  it("returns null for closed unnumbered without company AlwaysTrack", () => {
    expect(
      statementIdentity({
        settlement: { status: "locked", source_document_ref: null },
        companyDisplayId: null,
      }),
    ).toBeNull();
  });
});
