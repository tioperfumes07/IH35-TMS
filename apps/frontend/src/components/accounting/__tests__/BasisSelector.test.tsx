// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BasisSelector, type AccountingBasis } from "../BasisSelector";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

describe("BasisSelector", () => {
  it("renders both basis buttons", () => {
    render(<BasisSelector value="accrual" onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Accrual" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cash" })).toBeTruthy();
  });

  it("defaults to Accrual selection", () => {
    render(<BasisSelector value="accrual" onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Accrual" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Cash" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("fires onChange with selected basis", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(basis: AccountingBasis) => void>();
    render(<BasisSelector value="accrual" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Cash" }));
    expect(onChange).toHaveBeenCalledWith("cash");
  });

  it("does not write to localStorage", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(basis: AccountingBasis) => void>();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<BasisSelector value="accrual" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Cash" }));
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
