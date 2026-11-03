import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AGING_BY_DEBTOR_COLUMNS } from "./factoring-summary-groups";

describe("Factoring debtor / customer names (row 223 / D047)", () => {
  it("ACME FREIGHT LLC → Acme Freight LLC", () => {
    const col = AGING_BY_DEBTOR_COLUMNS((c) => String(c)).find((c) => c.key === "customer_name")!;
    const node = col.render!({
      key: "k",
      customer_id: "11111111-1111-4111-8111-111111111111",
      customer_name: "ACME FREIGHT LLC",
      invoices: 1,
      b0_30: 0,
      b31_60: 0,
      b61_90: 0,
      b90: 0,
      balance: 0,
    } as never);
    render(<MemoryRouter>{node as never}</MemoryRouter>);
    expect(screen.getByText("Acme Freight LLC")).toBeInTheDocument();
  });
});
