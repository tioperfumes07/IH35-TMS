/**
 * Owner 11-02: Trailer 445 on 13595 is a broker trailer — printedTrailerChoice must NOT invent
 * a fleet row; a number missing from company equipment resolves to kind "customer".
 */
import { describe, expect, it, vi } from "vitest";
import { printedTrailerChoice } from "../creator-trailer-choice.js";

describe("printedTrailerChoice — broker / customer trailer", () => {
  it("445 not in fleet → customer (broker) choice, never invent company equipment", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const choice = await printedTrailerChoice(client as never, "5c854333-6ea5-4faa-af31-67cb272fef80", "445", false);
    expect(choice).toEqual({ kind: "customer", trailer_number: "445" });
    expect(client.query).toHaveBeenCalled();
  });

  it("fleet hit → company choice", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] })),
    };
    const choice = await printedTrailerChoice(client as never, "5c854333-6ea5-4faa-af31-67cb272fef80", "10209", false);
    expect(choice).toEqual({ kind: "company", equipment_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  });
});
