import { describe, expect, it } from "vitest";
import {
  coaAccountReferenceOption,
  customerReferenceOption,
  formatCustomerTypeLabel,
  vendorReferenceOption,
} from "./referenceOptionLabels";

describe("referenceOptionLabels — QBO Name + Type", () => {
  it("vendorReferenceOption surfaces vendor_type as the Type sublabel", () => {
    expect(vendorReferenceOption({ id: "v1", name: "Pilot Travel", vendor_type: "Fuel" })).toEqual({
      value: "v1",
      label: "Pilot Travel",
      type: "Fuel",
    });
  });

  it("coaAccountReferenceOption uses name-only label and account_type as Type (numbers off by default)", () => {
    expect(
      coaAccountReferenceOption({
        id: "a1",
        account_number: "QBO-1150040124",
        account_name: "BOA-CHECKING-1135",
        account_type: "Bank",
      })
    ).toEqual({
      value: "a1",
      label: "BOA-CHECKING-1135",
      type: "Bank",
    });
  });

  it("formatReferenceTypeLabel humanizes snake_case", () => {
    expect(vendorReferenceOption({ id: "v2", name: "Pilot", vendor_type: "fuel_card" }).type).toBe("Fuel card");
  });

  it("customerReferenceOption humanizes customer_type", () => {
    expect(formatCustomerTypeLabel("direct_shipper")).toBe("Direct shipper");
    expect(customerReferenceOption({ id: "c1", name: "Acme Logistics", customer_type: "broker" })).toEqual({
      value: "c1",
      label: "Acme Logistics",
      type: "Broker",
    });
  });
});
