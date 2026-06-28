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

    // The card surfaces the unit and an explicit "+ Book load" <button> (no longer a bare draggable card).
    expect(screen.getByText("T171")).toBeInTheDocument();
    const bookButton = screen.getByTestId("awaiting-truck-book-unit:u-171");
    expect(bookButton.tagName).toBe("BUTTON");
    expect(bookButton).toHaveTextContent("+ Book load");

    // Clicking the explicit button books FOR this truck (bare id, "unit:" prefix stripped) — not a load drawer.
    await user.click(bookButton);
    expect(onBookForUnit).toHaveBeenCalledTimes(1);
    expect(onBookForUnit).toHaveBeenCalledWith("u-171");
    expect(onLoadClick).not.toHaveBeenCalled();
  });

  it("also opens Book when the card body (outside the button) is clicked", async () => {
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

    await user.click(screen.getByTestId("awaiting-truck-card-unit:u-171"));
    expect(onBookForUnit).toHaveBeenCalledWith("u-171");
    expect(onLoadClick).not.toHaveBeenCalled();
  });
});

describe("DispatchKanban — DB-2 lane headers link to the filtered List view", () => {
  it("a status lane header is a BUTTON that fires onColumnHeaderClick with that lane's statuses", async () => {
    const onColumnHeaderClick = vi.fn();
    const user = userEvent.setup();
    render(
      <DispatchKanban
        loads={[]}
        loading={false}
        onLoadClick={vi.fn()}
        onStatusDrop={vi.fn()}
        onColumnHeaderClick={onColumnHeaderClick}
      />
    );
    const headerLink = screen.getByTestId("kanban-column-header-link-assigned");
    expect(headerLink.tagName).toBe("BUTTON");
    await user.click(headerLink);
    // carries the lane's status filter (so the List view can pre-filter via the `statuses` param)
    expect(onColumnHeaderClick).toHaveBeenCalledWith(["assigned", "assigned_not_dispatched"]);
  });

  it("synthetic lanes with no statuses (awaiting_assignment) render a plain heading, not a link", () => {
    render(
      <DispatchKanban
        loads={[]}
        loading={false}
        onLoadClick={vi.fn()}
        onStatusDrop={vi.fn()}
        onColumnHeaderClick={vi.fn()}
      />
    );
    expect(screen.queryByTestId("kanban-column-header-link-awaiting_assignment")).toBeNull();
  });
});
