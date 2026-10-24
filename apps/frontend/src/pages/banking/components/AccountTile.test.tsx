// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BankingTile } from "../../../api/banking";
import { AccountTile } from "./AccountTile";

// LEAD 443.308 D072 — account tiles (bank + Relay wallet) print QBO money with thousands separators.
describe("AccountTile balance", () => {
  const base = { id: "t1", display_name: "Relay wallet", tile_kind: "real", uncategorized_count: 0 } as unknown as BankingTile;
  it("formats a five-digit balance as $12,345.67", () => {
    render(<AccountTile tile={{ ...base, current_balance: 12345.67 } as BankingTile} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByTestId("account-tile-balance").textContent).toBe("$12,345.67");
  });
  it("shows a dash, not $0.00, when the balance is missing", () => {
    render(<AccountTile tile={{ ...base, current_balance: null } as unknown as BankingTile} selected={false} onSelect={vi.fn()} />);
    expect(screen.getAllByTestId("account-tile-balance").at(-1)!.textContent).toBe("—");
  });
});
