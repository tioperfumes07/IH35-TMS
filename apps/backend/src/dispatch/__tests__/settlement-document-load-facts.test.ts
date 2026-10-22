import { describe, expect, it } from "vitest";
import { alignDocumentStops, documentAddressOf, documentMiles, documentStopPlan, stopDocumentPatch, type DocumentLoad, type DocumentStop } from "../settlement-document-load-facts.service.js";

const doc = (o: Partial<DocumentLoad>): DocumentLoad => ({
  load_number: "1", settlement_no: 5800, stops: [], loaded_miles_doc: null, empty_miles_doc: null, practical_miles_doc: null, ...o,
});
const dstop = (o: Partial<DocumentStop>): DocumentStop => ({ type: "PICKUP", date: null, company: "Cold Chain Solutions", city: "Laredo", state: "TX", zip: "78045", leg_miles: null, ...o });
const tstop = (o: Record<string, unknown> = {}) => ({
  id: "s", sequence_number: 1, stop_type: "pickup", facility_name: null, address_line1: null, city: "Laredo", state: "TX",
  postal_code: null, geocode_source: "manual_seed", geocode_precision: "locality", leg_miles: null, location_id: null, ...o,
}) as never;

describe("443.241 — the signed settlement document fills the load", () => {
  it("document miles: printed lines first, flat-rate legs second, no empty line = 0 from the document", () => {
    expect(documentMiles(doc({ loaded_miles_doc: 1855.1, practical_miles_doc: 1900.4 }))).toEqual({ practical: 1900.4, short: 1855.1, empty: 0 });
    expect(documentMiles(doc({ loaded_miles_legs: 409.6, empty_miles_legs: 160.3, practical_miles_doc: 590.3 }))).toEqual({ practical: 590.3, short: 409.6, empty: 160.3 });
  });
  it("a document that prints no miles (13680) sets nothing — never guessed", () => {
    expect(documentMiles(doc({}))).toEqual({ practical: null, short: null, empty: null });
    // 443.243: the extract writes 0.0 for a practical the company settlement does not print (13680) — never locked as 0.
    expect(documentMiles(doc({ practical_miles_doc: 0 }))).toEqual({ practical: null, short: null, empty: null });
  });
  it("a seed stop with only a city gets the document's facility and ZIP (the geocode pass then finds the street)", () => {
    const { patch, conflict } = stopDocumentPatch(tstop(), dstop({}), true);
    expect(patch).toEqual({ facility_name: "Cold Chain Solutions", postal_code: "78045" });
    expect(conflict).toBeNull();
  });
  it("a stop already at a street keeps it; a different printed city + ZIP is listed, never applied", () => {
    const { patch, conflict } = stopDocumentPatch(
      tstop({ facility_name: "RUSH TOWN POULTRY", address_line1: "90 Court Street", city: "Bethel", state: "PA", postal_code: "19507", geocode_source: "google_place" }),
      dstop({ company: "RUSH TOWN POULTRY", city: "JONESTOWN", state: "PA", zip: "17038" }), true);
    expect(patch).toEqual({});
    expect(conflict).not.toBeNull();
  });
  it("later legs take the document's printed leg miles; stop 1 keeps the whole deadhead", () => {
    expect(stopDocumentPatch(tstop({ facility_name: "X", postal_code: "78045", leg_miles: "1584.4" }), dstop({ leg_miles: 1548.4 }), false).patch).toEqual({ leg_miles: 1548.4 });
    expect(stopDocumentPatch(tstop({ facility_name: "X", postal_code: "78045", leg_miles: "353.2" }), dstop({ leg_miles: 12.3 }), true).patch).toEqual({});
  });
});

describe("443.241 — aligning the document's stops to the load's", () => {
  it("a document with an extra relay stop aligns the load's stops by type + city (13576)", () => {
    const docStops = [dstop({ city: "Laredo" }), dstop({ type: "DELIVER", city: "VINTON" }), dstop({ city: "Laredo" }), dstop({ type: "DELIVER", city: "LUMBERTON" })];
    expect(alignDocumentStops([{ stop_type: "pickup", city: "Laredo" }, { stop_type: "delivery", city: "Lumberton" }], docStops)).toEqual([0, 3]);
  });
  it("a load stop the document does not have is not aligned", () => {
    expect(alignDocumentStops([{ stop_type: "pickup", city: "Laredo" }, { stop_type: "delivery", city: "Dallas" }], [dstop({}), dstop({ type: "DELIVER", city: "X" }), dstop({ type: "DELIVER", city: "Y" })])).toBeNull();
  });
  it("a misspelled document city still gives a city-only seed stop its ZIP (TERREL / Terrell)", () => {
    expect(stopDocumentPatch(tstop({ facility_name: "GH Crane 249", city: "Terrell" }), dstop({ city: "TERREL", zip: "75160" }), false).patch).toEqual({ postal_code: "75160" });
  });
});

describe("LEAD 443.248 — the signed settlement is the address of record; a printed relay stop is added", () => {
  it("the address of record is the printed company / city / state / ZIP + settlement number", () => {
    expect(documentAddressOf(dstop({ company: " RUSH TOWN POULTRY ", city: "JONESTOWN", state: "PA", zip: "17038" }), 5784))
      .toEqual({ settlement_no: 5784, company: "RUSH TOWN POULTRY", city: "JONESTOWN", state: "PA", zip: "17038" });
  });
  it("13576: the Love's Vinton relay + EBT Yard pickup are inserted between the load's pickup and its Lumberton delivery", () => {
    const docStops = [dstop({ city: "Laredo" }), dstop({ type: "DELIVER", city: "VINTON" }), dstop({ city: "Laredo" }), dstop({ type: "DELIVER", city: "LUMBERTON" })];
    expect(documentStopPlan(docStops, [0, 3])).toEqual([
      { existingIndex: 0, docIndex: 0 }, { existingIndex: null, docIndex: 1 }, { existingIndex: null, docIndex: 2 }, { existingIndex: 1, docIndex: 3 },
    ]);
  });
});
