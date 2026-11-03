import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LawsuitsTab } from "./LawsuitsTab";

const LAWSUIT_ID = "11111111-1111-4111-8111-111111111111";

function LegalLawsuitsDestination() {
  const { pathname, search } = useLocation();
  return (
    <div data-testid="legal-lawsuits-dest">
      {pathname}
      {search}
    </div>
  );
}

describe("LawsuitsTab ?lawsuit_id= reverse drill-through (ENG-60 → Legal)", () => {
  it("keeps lawsuit_id query when redirecting to /legal/lawsuits", () => {
    render(
      <MemoryRouter initialEntries={[`/insurance/lawsuits?lawsuit_id=${LAWSUIT_ID}`]}>
        <Routes>
          <Route path="/insurance/lawsuits" element={<LawsuitsTab />} />
          <Route path="/legal/lawsuits" element={<LegalLawsuitsDestination />} />
        </Routes>
      </MemoryRouter>,
    );
    const dest = screen.getByTestId("legal-lawsuits-dest");
    expect(dest.textContent).toBe(`/legal/lawsuits?lawsuit_id=${LAWSUIT_ID}`);
  });

  it("redirects with empty search when no deep link", () => {
    render(
      <MemoryRouter initialEntries={["/insurance/lawsuits"]}>
        <Routes>
          <Route path="/insurance/lawsuits" element={<LawsuitsTab />} />
          <Route path="/legal/lawsuits" element={<LegalLawsuitsDestination />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("legal-lawsuits-dest").textContent).toBe("/legal/lawsuits");
  });

  it("fails closed if Navigate drops the lawsuit_id search", () => {
    // Plant: a broken redirect that strips search must not satisfy the destination assertion.
    function BrokenLawsuitsTab() {
      return <Navigate to="/legal/lawsuits" replace />;
    }
    render(
      <MemoryRouter initialEntries={[`/insurance/lawsuits?lawsuit_id=${LAWSUIT_ID}`]}>
        <Routes>
          <Route path="/insurance/lawsuits" element={<BrokenLawsuitsTab />} />
          <Route path="/legal/lawsuits" element={<LegalLawsuitsDestination />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("legal-lawsuits-dest").textContent).not.toContain(`lawsuit_id=${LAWSUIT_ID}`);
  });
});
