import { describe, expect, it } from "vitest";
import { buildTrailerChoice, trailerChoicePrefill } from "./trailerChoice";

describe("Book Load trailer choice (LEAD 443.107)", () => {
  it("is incomplete until a choice is made", () => {
    expect(buildTrailerChoice({ trailer_source: "owned", assigned_trailer_unit_id: "" })).toBeNull();
    expect(buildTrailerChoice({ trailer_source: "customer", customer_trailer_number: "  " })).toBeNull();
    expect(buildTrailerChoice({ trailer_source: "interchange", interchange_trailer_id: "" })).toBeNull();
  });
  it("builds each kind the server reads", () => {
    expect(buildTrailerChoice({ trailer_source: "owned", assigned_trailer_unit_id: "e1" })).toEqual({ kind: "company", equipment_id: "e1" });
    expect(buildTrailerChoice({ trailer_source: "customer", customer_trailer_number: " 53A " })).toEqual({ kind: "customer", trailer_number: "53A" });
    expect(buildTrailerChoice({ trailer_source: "interchange", interchange_trailer_id: "n1" })).toEqual({ kind: "interchange", non_owned_trailer_id: "n1" });
    expect(buildTrailerChoice({ trailer_source: "none" })).toEqual({ kind: "none" });
  });
  it("Edit Load prefills the recorded choice; an unrecorded load starts incomplete", () => {
    expect(trailerChoicePrefill({ trailer_source: "none" }).trailer_source).toBe("none");
    expect(trailerChoicePrefill({ trailer_source: "customer", non_owned_trailer_number: "53A" })).toMatchObject({ trailer_source: "customer", customer_trailer_number: "53A" });
    expect(trailerChoicePrefill({ trailer_source: "company", assigned_trailer_unit_id: "e1" })).toMatchObject({ trailer_source: "owned", assigned_trailer_unit_id: "e1" });
    expect(buildTrailerChoice(trailerChoicePrefill({ trailer_source: null }))).toBeNull();
  });
});
