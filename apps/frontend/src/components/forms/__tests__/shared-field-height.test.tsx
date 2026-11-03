import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SelectCombobox } from "../../Combobox";
import { DatePicker } from "../DatePicker";
import { DateTimePicker } from "../DateTimePicker";
import { FORM_INPUT_CLASS } from "../inputClass";
import { ProfilesTab } from "../../../pages/form425c/tabs/ProfilesTab";
import { DEFAULT_PROFILES } from "../../../pages/form425c/lib/constants";
import type { CompanyKey } from "../../../pages/form425c/types";

// Register rows 196/204/208/226/227/232/234 — single-line form fields take the shared 40px field size.
describe("shared form field height (owner law 40px field, 132px date)", () => {
  it('SelectCombobox size="sm" paints the 40px form field frame on the input itself', () => {
    render(
      <SelectCombobox size="sm" aria-label="Category" value="" onChange={() => {}}>
        <option value="">Pick…</option>
        <option value="a">A</option>
      </SelectCombobox>,
    );
    const input = screen.getByRole("combobox", { name: "Category" });
    expect(input.className).toMatch(/\bh-10\b/);
    expect(input.parentElement?.className ?? "").not.toMatch(/h-8\.5/);
  });

  it("SelectCombobox default stays the 34px filter control (filter bars unchanged)", () => {
    render(
      <SelectCombobox aria-label="Filter" value="" onChange={() => {}}>
        <option value="">All</option>
      </SelectCombobox>,
    );
    const input = screen.getByRole("combobox", { name: "Filter" });
    expect(input.className).not.toMatch(/\bh-10\b/);
    expect(input.parentElement?.className ?? "").toMatch(/h-8\.5/);
  });

  it('DatePicker box="field" takes --ih-h-field height and the 132px --ih-w-date width', () => {
    render(<DatePicker box="field" value="2026-11-03" onChange={() => {}} data-testid="dp" className="h-10 w-full" />);
    const shell = screen.getByTestId("dp");
    expect(shell.getAttribute("data-date-box")).toBe("field");
    expect(shell.style.width).toBe("var(--ih-w-date)");
    expect(shell.className).not.toMatch(/\bw-full\b/);
    expect((shell.firstElementChild as HTMLElement).style.height).toBe("var(--ih-h-field)");
  });

  it('DateTimePicker box="field" takes the --ih-h-field height', () => {
    render(<DateTimePicker box="field" value="" onChange={() => {}} data-testid="dtp" />);
    const shell = screen.getByTestId("dtp");
    expect((shell.firstElementChild as HTMLElement).style.height).toBe("var(--ih-h-field)");
  });

  it("425C Profiles & Defaults: every single-line input is FORM_INPUT_CLASS and the petition date is the field box (row 227)", () => {
    const active = Object.keys(DEFAULT_PROFILES)[0] as CompanyKey;
    render(
      <MemoryRouter>
        <ProfilesTab
          profiles={DEFAULT_PROFILES}
          activeCompany={active}
          availableCompanies={[active]}
          setActiveCompany={vi.fn()}
          onChange={vi.fn()}
          onSave={vi.fn()}
          saving={false}
        />
      </MemoryRouter>,
    );
    const textInputs = Array.from(document.querySelectorAll("input")).filter(
      (el) => !["checkbox", "radio"].includes(el.type) && el.getAttribute("data-control-kind") !== "date",
    );
    expect(textInputs.length).toBeGreaterThanOrEqual(9);
    for (const el of textInputs) {
      for (const token of FORM_INPUT_CLASS.split(" ")) expect(el.classList.contains(token)).toBe(true);
    }
    expect(screen.getByTestId("form425c-petition-date").getAttribute("data-date-box")).toBe("field");
  });
});
