/**
 * CLOSURE-12 — Payroll class allocator: UNIT-DRIVER vs OFFICE vs OTHER.
 * No new financial math — reads existing settlements/QBO data.
 */
export type AllocationClass = "UNIT-DRIVER" | "OFFICE" | "OTHER";

export type AllocationLine = {
  class: AllocationClass;
  amount_cents: number;
  sources: string[];
};

export type PersonAllocation = {
  person_id: string;
  person_name: string;
  pay_type: "1099" | "W2";
  class: AllocationClass;
  gross_cents: number;
  deductions_cents: number;
  net_cents: number;
};

/**
 * Drivers on settlements → UNIT-DRIVER class (per Verified Deltas memory: VQ allocations show as UNIT-DRIVER).
 * W-2 office staff → OFFICE class.
 */
export function allocatePayrollClass(
  payType: "1099" | "W2",
  jobTitle?: string | null
): AllocationClass {
  if (payType === "1099") return "UNIT-DRIVER";
  const title = (jobTitle ?? "").toLowerCase();
  if (title.includes("driver") || title.includes("operator")) return "UNIT-DRIVER";
  return "OFFICE";
}

export function buildClassSummary(persons: PersonAllocation[]): AllocationLine[] {
  const map = new Map<AllocationClass, AllocationLine>();
  for (const person of persons) {
    const existing = map.get(person.class);
    if (existing) {
      existing.amount_cents += person.gross_cents;
      existing.sources.push(person.person_name);
    } else {
      map.set(person.class, {
        class: person.class,
        amount_cents: person.gross_cents,
        sources: [person.person_name],
      });
    }
  }
  return Array.from(map.values());
}
