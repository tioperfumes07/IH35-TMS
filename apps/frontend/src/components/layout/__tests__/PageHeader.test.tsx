import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "../PageHeader";

// components/layout/PageHeader — ROUND 367.9: Up is structural (route parent), never history.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

beforeEach(() => navigateSpy.mockClear());

describe("layout PageHeader", () => {
  it("always renders a back button, even on a root-style page with no backHref", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Home" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  it("uses structural parent when onBack and backHref are not provided", () => {
    render(
      <MemoryRouter initialEntries={["/maintenance/defects/abc"]}>
        <PageHeader title="Defect" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith("/maintenance/defects");
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
  });

  it("calls onBack instead of navigating when provided (panel/drawer headers)", () => {
    const onBack = vi.fn();
    render(
      <MemoryRouter>
        <PageHeader title="Panel" backHref="/somewhere" onBack={onBack} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("uses backHref when provided (structural parent override)", () => {
    render(
      <MemoryRouter initialEntries={["/accounting/invoices/1"]}>
        <PageHeader title="Invoice" backHref="/accounting/invoices" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith("/accounting/invoices");
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
  });

  it("ROUND 435-CUR — refuses a backHref that leaves the module", () => {
    render(
      <MemoryRouter initialEntries={["/customers/abc"]}>
        <PageHeader title="Customer" backHref="/accounting" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith("/customers");
    expect(navigateSpy).not.toHaveBeenCalledWith("/accounting");
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
  });
});
