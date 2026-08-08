import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CappedListNotice } from "../CappedListNotice";

// CLS-SILENT-CAP. The property under test is that a truncated list can never again be SILENT, and —
// just as important — that an untruncated list stays quiet, because a notice that cries wolf on every
// screen is the fastest way to get it deleted again.
describe("CappedListNotice", () => {
  it("renders nothing when the server total fits inside what is shown", () => {
    const { container } = render(<CappedListNotice shown={12} limit={200} total={12} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when fewer rows came back than the cap and no total is known", () => {
    const { container } = render(<CappedListNotice shown={37} limit={200} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("trusts the server total over the cap heuristic — a full page that IS everything stays silent", () => {
    // The heuristic alone (shown >= limit) would cry wolf here. The total says otherwise, and the
    // total wins: exactly 200 rows out of exactly 200 is not a truncation.
    const { container } = render(<CappedListNotice shown={200} limit={200} total={200} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("states both numbers when the total is known — the legal.matters LIMIT 500 shape", () => {
    render(<CappedListNotice shown={500} limit={500} total={4213} />);
    expect(screen.getByTestId("capped-list-notice")).toHaveTextContent("Showing 500 of 4,213.");
  });

  it("still discloses the truncation when no total is available", () => {
    render(<CappedListNotice shown={200} limit={200} />);
    expect(screen.getByTestId("capped-list-notice")).toHaveTextContent("Showing the first 200.");
  });

  it("carries a caller hint, so a searchable picker says the useful thing instead of the generic one", () => {
    render(<CappedListNotice shown={200} limit={200} hint="Type to search the full catalog." />);
    const el = screen.getByTestId("capped-list-notice");
    expect(el).toHaveTextContent("Type to search the full catalog.");
    expect(el).not.toHaveTextContent("narrow the filters");
  });
});
