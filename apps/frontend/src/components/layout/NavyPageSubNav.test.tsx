// @vitest-environment jsdom
// B6 (owner, 2026-09-12) — "a dot on any tab that contains data." Additive: hasData is optional so
// every pre-existing consumer (30+ pages) that never sets it renders identically to before.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { NavyPageSubNav } from "./NavyPageSubNav";

afterEach(cleanup);

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("NavyPageSubNav data dot", () => {
  it("renders a dot on a tab with hasData: true", () => {
    render(
      wrap(
        <NavyPageSubNav
          items={[
            { label: "Contacts", to: "Contacts", hasData: true },
            { label: "Loads", to: "Loads", hasData: false },
          ]}
          activeId="Contacts"
          onTabChange={vi.fn()}
          itemIds={["Contacts", "Loads"]}
        />
      )
    );
    const contactsBtn = screen.getByRole("button", { name: /Contacts/ });
    const loadsBtn = screen.getByRole("button", { name: /Loads/ });
    expect(contactsBtn.querySelector(".bg-white")).not.toBeNull();
    expect(loadsBtn.querySelector(".bg-white")).toBeNull();
  });

  it("renders no dot at all when hasData is never passed (every pre-existing consumer)", () => {
    render(
      wrap(
        <NavyPageSubNav
          items={[{ label: "Profile", to: "Profile" }]}
          activeId="Profile"
          onTabChange={vi.fn()}
          itemIds={["Profile"]}
        />
      )
    );
    expect(document.querySelector(".bg-white")).toBeNull();
  });
});
