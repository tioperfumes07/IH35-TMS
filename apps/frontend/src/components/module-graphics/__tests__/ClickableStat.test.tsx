import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ClickableStat } from "../ClickableStat";

describe("ClickableStat (443.248 click-through law)", () => {
  it("requires a destination and stamps data-mod-click-through", () => {
    render(
      <MemoryRouter>
        <ClickableStat label="Owed to us" value="$1,234.00" to="/reports/ar-aging" />
      </MemoryRouter>
    );
    const link = screen.getByTestId("mod-clickable-stat");
    expect(link.getAttribute("href")).toBe("/reports/ar-aging");
    expect(link.getAttribute("data-mod-click-through")).toBe("1");
    expect(link.getAttribute("data-mod-click-to")).toBe("/reports/ar-aging");
    expect(screen.getByText("Owed to us")).toBeTruthy();
    expect(screen.getByText("$1,234.00")).toBeTruthy();
  });
});
