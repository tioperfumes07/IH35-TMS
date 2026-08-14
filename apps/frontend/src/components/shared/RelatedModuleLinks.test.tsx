import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RelatedModuleLinks } from "./RelatedModuleLinks";

describe("RelatedModuleLinks", () => {
  it("renders keyboard-native route links without callback navigation", () => {
    render(
      <MemoryRouter>
        <RelatedModuleLinks
          testId="related-test"
          links={[
            { label: "Safety HOS", to: "/safety/hos" },
            { label: "Compliance", to: "/compliance" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("related-test")).toHaveAttribute("aria-label", "Related modules");
    expect(screen.getByRole("link", { name: "Safety HOS" })).toHaveAttribute("href", "/safety/hos");
    expect(screen.getByRole("link", { name: "Compliance" })).toHaveAttribute("href", "/compliance");
  });
});
