/**
 * CLOSURE-12 — payroll integration aggregate unit tests.
 */
import { describe, it, expect } from "vitest";
import { allocatePayrollClass, buildClassSummary, type PersonAllocation } from "./class-allocator.js";

describe("allocatePayrollClass", () => {
  it("maps 1099 drivers to UNIT-DRIVER", () => {
    expect(allocatePayrollClass("1099")).toBe("UNIT-DRIVER");
  });

  it("maps W2 office staff to OFFICE", () => {
    expect(allocatePayrollClass("W2", "Accountant")).toBe("OFFICE");
  });

  it("maps W2 driver to UNIT-DRIVER", () => {
    expect(allocatePayrollClass("W2", "Driver")).toBe("UNIT-DRIVER");
  });
});

describe("buildClassSummary", () => {
  it("sums by class correctly", () => {
    const persons: PersonAllocation[] = [
      { person_id: "a", person_name: "Jose", pay_type: "1099", class: "UNIT-DRIVER", gross_cents: 100_00, deductions_cents: 0, net_cents: 100_00 },
      { person_id: "b", person_name: "Maria", pay_type: "1099", class: "UNIT-DRIVER", gross_cents: 80_00, deductions_cents: 0, net_cents: 80_00 },
      { person_id: "c", person_name: "Ana", pay_type: "W2", class: "OFFICE", gross_cents: 200_00, deductions_cents: 10_00, net_cents: 190_00 },
    ];
    const summary = buildClassSummary(persons);
    const driverEntry = summary.find((s) => s.class === "UNIT-DRIVER");
    const officeEntry = summary.find((s) => s.class === "OFFICE");
    expect(driverEntry?.amount_cents).toBe(180_00);
    expect(officeEntry?.amount_cents).toBe(200_00);
  });
});
