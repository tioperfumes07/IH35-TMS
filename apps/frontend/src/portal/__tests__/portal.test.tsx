import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalLoginPage } from "./PortalLoginPage";

describe("PortalLoginPage", () => {
  it("renders shipper portal sign-in heading", () => {
    render(
      <MemoryRouter>
        <PortalLoginPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /shipper portal sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
