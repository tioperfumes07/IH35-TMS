import { describe, expect, it } from "vitest";
import {
  attachUncleared,
  factoringClearedOpenCents,
  type UnclearedDocument,
} from "../uncleared-applied-documents.js";

describe("attachUncleared — 363-CUR-A", () => {
  it("adds uncleared payments back onto the cleared balance and names them", () => {
    const docs: UnclearedDocument[] = [
      {
        party_id: "vendor-1",
        document_type: "bill payment",
        document_number: "500",
        document_date: "2026-10-01",
        amount_cents: 50_000,
      },
    ];
    const [row] = attachUncleared(
      [{ vendor_id: "vendor-1", total_cents: 150_000 }],
      docs,
      "vendor_id",
      (r) => r.total_cents,
    );
    expect(row.cleared_open_cents).toBe(200_000);
    expect(row.uncleared_cents).toBe(50_000);
    expect(row.uncleared_documents).toHaveLength(1);
    expect(row.uncleared_documents[0]?.document_number).toBe("500");
  });

  it("factoring liability cleared is GL minus unmatched wires, never plus", () => {
    expect(factoringClearedOpenCents(200_000, 50_000)).toBe(150_000);
    expect(factoringClearedOpenCents(200_000, 50_000)).not.toBe(250_000);
  });
});
