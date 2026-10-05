import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "./PageHeader";

// ROUND 367.9 — Up is structural (route parent / backHref), never navigate(-1).
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

beforeEach(() => navigateSpy.mockClear());

describe("PageHeader primitive (invariant #21)", () => {
  it("renders back + breadcrumb on drilled-in page", () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Work Order WO-T169-IS-05-06-2026-0035-23914"
          backHref="/maintenance"
          breadcrumb={[
            { label: "Maintenance", href: "/maintenance" },
            { label: "WO-T169-IS-...", href: "/maintenance/wo-1" },
            { label: "Details" },
          ]}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("page-header-back"));
    expect(navigateSpy).toHaveBeenCalledWith("/maintenance");
    expect(screen.getByTestId("page-header-breadcrumb")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Work Order WO-T169-IS-05-06-2026-0035-23914",
    );
  });

  it("renders back without breadcrumb (one level deep)", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Maintenance" backHref="/home" subtitle="14 new in last 3 days" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("page-header-back"));
    expect(navigateSpy).toHaveBeenCalledWith("/home");
    expect(screen.queryByTestId("page-header-breadcrumb")).toBeNull();
    expect(screen.getByText("14 new in last 3 days")).toBeInTheDocument();
  });

  it("keeps the back arrow on a root-style page and uses structural parent", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <PageHeader title="Home" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("page-header-back"));
    // Module home has no parent crumb — structuralParentHref falls back to /home.
    expect(navigateSpy).toHaveBeenCalledWith("/home");
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
    expect(screen.queryByTestId("page-header-breadcrumb")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Home");
  });

  it("does not show breadcrumb when only one item is passed", () => {
    render(
      <MemoryRouter>
        <PageHeader title="X" breadcrumb={[{ label: "Only", href: "/only" }]} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("page-header-breadcrumb")).toBeNull();
  });

  it("prefers backHref over structural parent (explicit parent wins)", () => {
    render(
      <MemoryRouter initialEntries={["/maintenance/work-orders/1"]}>
        <PageHeader title="Work Order" backHref="/maintenance" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("page-header-back"));
    expect(navigateSpy).toHaveBeenCalledWith("/maintenance");
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
  });

  it("applies single-line ellipsis styles to H1 (invariant #23)", () => {
    const long =
      "ANTONIO RAMIREZ-MARTINEZ JR. — VERY LONG DISPLAY LINE THAT MUST NOT WRAP IN PRODUCTION CHROME";
    render(
      <MemoryRouter>
        <PageHeader title={long} backHref="/drivers" />
      </MemoryRouter>,
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(long);
    const style = window.getComputedStyle(h1);
    expect(style.whiteSpace).toBe("nowrap");
    expect(style.overflow).toBe("hidden");
    expect(style.textOverflow).toBe("ellipsis");
  });
});
