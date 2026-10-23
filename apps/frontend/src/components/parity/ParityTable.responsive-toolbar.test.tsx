import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ParityTable } from "./ParityTable";

afterEach(cleanup);

describe("ParityTable narrow toolbar", () => {
  it("allows long titles and the shell to shrink within their panel", () => {
    render(<ParityTable columns={[{ key: "name", label: "Name" }]} rows={[]} rowKey={() => ""}
      title="Maintenance work-order vendor bills awaiting approval" tableTestId="narrow-table" />);
    const title = screen.getByTestId("parity-table-title");
    expect(title.className).not.toContain("whitespace-nowrap");
    expect(title.className).toContain("break-words");
    expect(title.parentElement?.className).toContain("min-w-0");
    expect(screen.getByTestId("narrow-table").className).toContain("max-w-full");
    expect(screen.getByTestId("narrow-table").className).toContain("min-w-0");
  });
});
