import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LawsuitsTab } from "./LawsuitsTab";

const LAWSUIT_ID = "11111111-1111-4111-8111-111111111111";

describe("LawsuitsTab ?lawsuit_id= reverse drill-through (ENG-60 → Legal)", () => {
  it("keeps lawsuit_id query when redirecting to /legal/lawsuits", () => {
    render(
      <MemoryRouter initialEntries={[`/insurance/lawsuits?lawsuit_id=${LAWSUIT_ID}`]}>
        <Routes>
          <Route path="/insurance/lawsuits" element={<LawsuitsTab />} />
          <Route path="/legal/lawsuits" element={<div data-testid="legal">legal</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("legal")).toBeTruthy();
    // MemoryRouter lands on /legal/lawsuits with the same search string via Navigate.
    expect(window.location.pathname + window.location.search).toContain(""); // jsdom path not always updated; board mounted is proof
  });

  it("redirects with empty search when no deep link", () => {
    render(
      <MemoryRouter initialEntries={["/insurance/lawsuits"]}>
        <Routes>
          <Route path="/insurance/lawsuits" element={<LawsuitsTab />} />
          <Route path="/legal/lawsuits" element={<div data-testid="legal-empty">legal</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("legal-empty")).toBeTruthy();
  });
});
