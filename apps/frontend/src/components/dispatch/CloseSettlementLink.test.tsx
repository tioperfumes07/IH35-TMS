// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CloseSettlementLink } from "./CloseSettlementLink";

describe("CloseSettlementLink", () => {
  it("links the dispatch control to the pre-filled settlement close wizard", () => {
    render(
      <MemoryRouter>
        <CloseSettlementLink driverId="drv-7" settlementId="set-3" testId="dispatch-tour-close-settlement" />
      </MemoryRouter>,
    );
    const link = screen.getByTestId("dispatch-tour-close-settlement");
    expect(link).toHaveTextContent("Close settlement");
    expect(link).toHaveAttribute(
      "href",
      "/driver-finance/settlement-close?driver_id=drv-7&settlement_id=set-3",
    );
    expect(link.className).toContain("h-7");
    expect(link.className).toContain("rounded-sm");
  });

  it("renders nothing without a driver", () => {
    const { container } = render(
      <MemoryRouter>
        <CloseSettlementLink driverId="  " />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
