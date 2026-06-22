// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UnitsWithoutLoad } from "../../api/dispatch";
import { DispatchKanban } from "./DispatchKanban";

expect.extend(jestDomMatchers);

vi.mock("../Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

const truck: UnitsWithoutLoad = {
  id: "u-171",
  unit_number: "T171",
  trailer_number: null,
  driver_id: "d-1",
  driver_name: "Joe Driver",
  last_drop_at: null,
  hours_since_last_delivery: null,
  location: null,
};

describe("DispatchKanban — Awaiting-assignment truck card opens Book", () => {
  it("renders a +Book load button and fires onBookForUnit (bare unit id) on click — not onLoadClick", async () => {
    const onBookForUnit = vi.fn();
    const onLoadClick = vi.fn();
    const user = userEvent.setup();

    render(
      <DispatchKanban
        loads={[]}
        awaitingTrucks={[truck]}
        loading={false}
        onLoadClick={onLoadClick}
        onBookForUnit={onBookForUnit}
        onStatusDrop={vi.fn()}
      />
    );

    // The card surfaces the unit and an explicit "+ Book load" affordance (no longer a bare draggable card).
    expect(screen.getByText("T171")).toBeInTheDocument();
    const card = screen.getByTestId("awaiting-truck-card-unit:u-171");
    expect(card).toHaveTextContent("+ Book load");

    await user.click(card);

    // Clicking books FOR this truck (bare id, "unit:" prefix stripped) — and does NOT open a load drawer.
    expect(onBookForUnit).toHaveBeenCalledTimes(1);
    expect(onBookForUnit).toHaveBeenCalledWith("u-171");
    expect(onLoadClick).not.toHaveBeenCalled();
  });
});
