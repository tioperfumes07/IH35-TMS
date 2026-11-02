import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LawsuitsTab } from "./LawsuitsTab";

describe("LawsuitsTab ENG-60 redirect", () => {
  it("redirects to Legal › Lawsuits (insurance.lawsuit retired)", () => {
    render(
      <MemoryRouter initialEntries={["/insurance/lawsuits"]}>
        <Routes>
          <Route path="/insurance/lawsuits" element={<LawsuitsTab />} />
          <Route path="/legal/lawsuits" element={<div>legal-lawsuits-board</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("legal-lawsuits-board")).toBeTruthy();
  });
});
