// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PostingGrid, type PostingGridRow } from "../PostingGrid";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function row(i: number, over: Partial<PostingGridRow>): PostingGridRow {
  return {
    id: `p${i}`,
    line_sequence: i,
    account_id: `0000000${i}-0000-4000-8000-00000000000${i}`,
    account_name: "Accounts Payable",
    debit_or_credit: i % 2 ? "debit" : "credit",
    amount_cents: 10_000,
    description: null,
    ...over,
  };
}

// D068 (register row 244): the Bill detail Journal "Entity" column names the party (server-resolved
// entity_name, postingPartyNameSql) and never prints its uuid — not even when the name is missing.
describe("PostingGrid Entity column (D068)", () => {
  afterEach(() => cleanup());

  it("renders the resolved party name for every posting and no raw uuid anywhere", () => {
    const rows: PostingGridRow[] = [
      row(1, { entity_uuid: "dcd683f5-b8a1-46a8-aa6b-093732e70b92", entity_type: "driver", entity_name: "ALFONSO HIDALGO CHAVEZ" }),
      row(2, { entity_uuid: "40823a77-d8d4-481c-88cb-1387556aa98e", entity_type: "driver", entity_name: "Alfonso Hidalgo Chavez" }),
      row(3, { entity_uuid: "d519a2c3-3abd-4c1d-98b3-35b65b169774", entity_type: "vendor", entity_name: "Cimarron" }),
      row(4, { entity_uuid: "f054bdb8-00c3-47aa-b096-9f00523f831c", entity_type: "vendor", entity_name: "Lloyds Of London" }),
      row(5, { entity_uuid: "5c854333-6ea5-4faa-af31-67cb272fef80", entity_type: "customer", entity_name: null }),
      row(6, { entity_uuid: null }),
    ];
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PostingGrid postings={rows} storageKey="test.posting-grid.d068" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const text = screen.getByTestId("posting-grid").textContent ?? "";
    expect(text).not.toMatch(UUID_RE);
    expect(text).toContain("Alfonso Hidalgo Chavez");
    expect(text).toContain("Cimarron");
    expect(text).toContain("Lloyds Of London");
    expect(text).toMatch(/Customer — not visible/);
  });
});
