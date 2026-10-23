import { describe, expect, it } from "vitest";
import { classifyUnexpectedKind } from "./unexpected-expenses.service.js";

describe("classifyUnexpectedKind", () => {
  it("classifies South Texas Truck Centers as shop (incl. BofA truncation TRUCK CE)", () => {
    expect(classifyUnexpectedKind("PURCHASE 10/02 SOUTH TX TRUCK CENTERS", null, "")).toBe("shop");
    expect(
      classifyUnexpectedKind("CHECKCARD 1002 SOUTH TX TRUCK CE LAREDO TX XXXXX8462XXXXXXXX", null, "")
    ).toBe("shop");
    expect(classifyUnexpectedKind("SOUTH TX TRUCK CE", null, "")).toBe("shop");
    expect(classifyUnexpectedKind("CHECKCARD SOUTH TEXAS TRUCK CENTERS", null, "")).toBe("shop");
  });

  it("classifies Bandal Zelle as tires", () => {
    expect(
      classifyUnexpectedKind("Zelle payment to BANDAL TIRES SERVICE LLC Conf# x0k3ht3id", null, "BANDAL TIRES SERVICE LLC")
    ).toBe("tires");
  });

  it("excludes Love's / Relay fuel / Mateo truck wash", () => {
    expect(classifyUnexpectedKind("Relay fuel · T170 · Love's · Natalia, TX · txn_abc", "Relay fuel", "Love's")).toBeNull();
    expect(classifyUnexpectedKind("CHECKCARD LOVES TRAVEL STOP", null, "")).toBeNull();
    expect(classifyUnexpectedKind("PURCHASE MATEO TRUCK WASH", null, "")).toBeNull();
  });

  it("classifies tow / fine / lumper / medical", () => {
    expect(classifyUnexpectedKind("ROADSIDE TOWING SERVICE", null, "")).toBe("towing");
    expect(classifyUnexpectedKind("TXDPS CITATION SCALE", null, "")).toBe("fines");
    expect(classifyUnexpectedKind("LUMPER FEE DETENTION", null, "")).toBe("lumper");
    expect(classifyUnexpectedKind("URGENT CARE CLINIC", null, "")).toBe("medical");
  });
});
