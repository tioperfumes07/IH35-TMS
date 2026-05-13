import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

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
    expect(screen.getByTestId("page-header-back")).toHaveAttribute("href", "/maintenance");
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
    expect(screen.getByTestId("page-header-back")).toHaveAttribute("href", "/home");
    expect(screen.queryByTestId("page-header-breadcrumb")).toBeNull();
    expect(screen.getByText("14 new in last 3 days")).toBeInTheDocument();
  });

  it("hides back and breadcrumb on root-style page", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Home" />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("page-header-back")).toBeNull();
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
