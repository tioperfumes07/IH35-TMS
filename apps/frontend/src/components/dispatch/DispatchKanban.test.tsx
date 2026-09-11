// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { UnitsWithoutLoad } from "../../api/dispatch";
import type { DispatchLoadRow } from "../../api/loads";
import { DispatchKanban } from "./DispatchKanban";

expect.extend(jestDomMatchers);

vi.mock("../Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

// DispatchKanban uses useQueryClient (for the assign mutation) and useQuery (for profit badge),
// so tests that render real loads must wrap in a QueryClientProvider.
function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockLoad(overrides: Partial<DispatchLoadRow> = {}): DispatchLoadRow {
  return {
    id: "load-1",
    operating_company_id: "co-1",
    load_number: "13500",
    customer_id: "cust-1",
    customer_name: "ACME TRANSPORTATION SERVICES LLC",
    status: "assigned",
    rate_total_cents: 10000,
    currency_code: "USD",
    assigned_unit_id: "u-1",
    assigned_unit_number: "T169",
    assigned_primary_driver_id: "d-1",
    assigned_primary_driver_name: "ANTONIO RAMIREZ-MARTINEZ JR.",
    assigned_secondary_driver_id: null,
    dispatcher_user_id: "u-1",
    notes: null,
    first_pickup_city: "Austin",
    first_delivery_city: "Dallas",
    flag_code: "GRAY",
    dispatch_flag_color_id: "00000000-0000-4000-8000-0000000000ff",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    soft_deleted_at: null,
    deleted_by_user_id: null,
    ...overrides,
  };
}

const truck: UnitsWithoutLoad = {
  id: "u-171",
  unit_number: "T171",
  trailer_id: null,
  trailer_number: null,
  driver_id: "d-1",
  driver_name: "Joe Driver",
  last_drop_at: null,
  last_delivered_load_id: null,
  last_delivered_load_number: null,
  hours_since_last_delivery: null,
  location: null,
};

describe("DispatchKanban — Awaiting-assignment truck card opens Book", () => {
  it("renders a +Book load button and fires onBookForUnit (bare unit id) on click — not onLoadClick", async () => {
    const onBookForUnit = vi.fn();
    const onLoadClick = vi.fn();
    const user = userEvent.setup();

    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={[]}
          awaitingTrucks={[truck]}
          loading={false}
          onLoadClick={onLoadClick}
          onBookForUnit={onBookForUnit}
          onStatusDrop={vi.fn()}
        />
      </MemoryRouter>
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

    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={[]}
          awaitingTrucks={[truck]}
          loading={false}
          onLoadClick={onLoadClick}
          onBookForUnit={onBookForUnit}
          onStatusDrop={vi.fn()}
        />
      </MemoryRouter>
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
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={[]}
          loading={false}
          onLoadClick={vi.fn()}
          onStatusDrop={vi.fn()}
          onColumnHeaderClick={onColumnHeaderClick}
        />
      </MemoryRouter>
    );
    const headerLink = screen.getByTestId("kanban-column-header-link-assigned");
    expect(headerLink.tagName).toBe("BUTTON");
    await user.click(headerLink);
    // carries the lane's status filter (so the List view can pre-filter via the `statuses` param)
    expect(onColumnHeaderClick).toHaveBeenCalledWith(["draft", "planned", "unassigned", "booked", "assigned", "assigned_not_dispatched"]);
  });

  it("synthetic lanes with no statuses (awaiting_assignment) render a plain heading, not a link", () => {
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={[]}
          loading={false}
          onLoadClick={vi.fn()}
          onStatusDrop={vi.fn()}
          onColumnHeaderClick={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("kanban-column-header-link-awaiting_assignment")).toBeNull();
  });
});

// REG-018 — Kanban drag/drop must call onStatusDrop (the existing status endpoint) for both
// forward and backward moves. The root cause was that handleDragEnd only resolved
// `column:<key>` droppable IDs; when a card was dropped onto a lane that already had cards,
// dnd-kit's pointerWithin resolved `event.over` to the CARD droppable (`droppable:load:<id>`),
// not the column, and the handler silently failed. These tests verify the wiring is correct.
describe("DispatchKanban — REG-018 drag/drop wiring", () => {
  it("forward drag: an assigned card is draggable and the dispatched column is a drop target", () => {
    const loads = [
      mockLoad({ id: "load-1", load_number: "13500", status: "assigned", assigned_unit_id: "u-1", assigned_unit_number: "T169" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={loads}
          loading={false}
          onLoadClick={vi.fn()}
          onStatusDrop={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByTestId("kanban-column-assigned")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-dispatched")).toBeInTheDocument();
    const card = screen.getByTestId("kanban-standard-card-13500");
    expect(card.className).toContain("cursor-grab");
  });

  it("drop onto a card (not a column) — the REG-018 root cause scenario renders both cards", () => {
    const loads = [
      mockLoad({ id: "load-1", load_number: "13500", status: "assigned", assigned_unit_id: "u-1", assigned_unit_number: "T169" }),
      mockLoad({ id: "load-2", load_number: "13501", status: "dispatched", assigned_unit_id: "u-2", assigned_unit_number: "T170" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={loads}
          loading={false}
          onLoadClick={vi.fn()}
          onStatusDrop={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByTestId("kanban-standard-card-13500")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-standard-card-13501")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-assigned")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-dispatched")).toBeInTheDocument();
  });

  it("backward drag: a dispatched card is draggable and the assigned column is a drop target", () => {
    const loads = [
      mockLoad({ id: "load-1", load_number: "13502", status: "dispatched", assigned_unit_id: "u-1", assigned_unit_number: "T171" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={loads}
          loading={false}
          onLoadClick={vi.fn()}
          onStatusDrop={vi.fn()}
        />
      </MemoryRouter>
    );
    const card = screen.getByTestId("kanban-standard-card-13502");
    expect(card.className).toContain("cursor-grab");
    expect(screen.getByTestId("kanban-column-assigned")).toBeInTheDocument();
  });

  it("terminal status (cancelled) card is not draggable", () => {
    const loads = [
      mockLoad({ id: "load-1", load_number: "13503", status: "cancelled", assigned_unit_id: "u-1", assigned_unit_number: "T172" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban
          loads={loads}
          loading={false}
          onLoadClick={vi.fn()}
          onStatusDrop={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByTestId("kanban-column-cancelled")).toBeInTheDocument();
  });
});

describe("DispatchKanban — REG-048 one card per unit", () => {
  it("owner-reported scenario: a unit with an old delivered_pending_docs load AND a new dispatched load renders exactly ONE card, the newer one", () => {
    const loads = [
      mockLoad({
        id: "load-old",
        load_number: "13400",
        status: "delivered_pending_docs",
        assigned_unit_id: "u-164",
        assigned_unit_number: "T164",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      mockLoad({
        id: "load-new",
        load_number: "13600",
        status: "dispatched",
        assigned_unit_id: "u-164",
        assigned_unit_number: "T164",
        created_at: "2026-02-01T00:00:00.000Z",
      }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );
    // Exactly one card for unit T164 across the whole board — the newer (dispatched) one wins,
    // the old delivered_pending_docs backlog load collapses out of view rather than competing.
    expect(screen.getByTestId("kanban-standard-card-13600")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-standard-card-13400")).not.toBeInTheDocument();
  });

  it("a unit with two DIFFERENT non-cancelled loads still resolves to exactly one card (latest wins) even when both are 'active'-looking", () => {
    const loads = [
      mockLoad({ id: "load-a", load_number: "13401", status: "assigned", assigned_unit_id: "u-165", created_at: "2026-01-01T00:00:00.000Z" }),
      mockLoad({ id: "load-b", load_number: "13601", status: "assigned", assigned_unit_id: "u-165", created_at: "2026-03-01T00:00:00.000Z" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("kanban-standard-card-13601")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-standard-card-13401")).not.toBeInTheDocument();
  });

  it("a unit whose only load is cancelled still counts toward the Cancelled lane rather than vanishing (lane is collapsedByDefault, so the card itself is not rendered until expanded — same as every other cancelled load)", () => {
    const loads = [
      mockLoad({ id: "load-c", load_number: "13402", status: "cancelled", assigned_unit_id: "u-166" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );
    const column = screen.getByTestId("kanban-column-cancelled");
    expect(column.textContent).toContain("1");
  });

  it("a cancelled load never wins over a real active load for the same unit, even if it is the most recently created", () => {
    const loads = [
      mockLoad({ id: "load-d", load_number: "13403", status: "dispatched", assigned_unit_id: "u-167", created_at: "2026-01-01T00:00:00.000Z" }),
      mockLoad({ id: "load-e", load_number: "13603", status: "cancelled", assigned_unit_id: "u-167", created_at: "2026-05-01T00:00:00.000Z" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("kanban-standard-card-13403")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-standard-card-13603")).not.toBeInTheDocument();
  });

  it("loads with no assigned unit never dedupe against each other", () => {
    const loads = [
      mockLoad({ id: "load-f", load_number: "13404", status: "assigned", assigned_unit_id: null, assigned_unit_number: null }),
      mockLoad({ id: "load-g", load_number: "13405", status: "assigned", assigned_unit_id: null, assigned_unit_number: null }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("kanban-standard-card-13404")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-standard-card-13405")).toBeInTheDocument();
  });
});

// KANBAN-DUP-UNIT-2 (owner correction 2026-09-11, verbatim): "dedupeLoadsByUnit() only dedupes the
// `loads` array. The Awaiting-Assignment lane renders a SEPARATE source, `awaitingTrucks` ...
// Reconcile the two ... One unit, one card, period, regardless of which source found it." Live-
// confirmed on the deployed build BEFORE this fix: real units T163/T173/T148 each carry a load whose
// status (delivered_pending_docs / invoiced) both wins a real Kanban card AND still satisfies
// listUnitsWithoutLoad's own "no active load" definition (which only excludes
// assigned_not_dispatched/dispatched/in_transit) — rendering the SAME unit twice. This suite asserts
// the CORRECTNESS property the owner named directly: zero unit_ids ever appear in both the
// loads-card set and the awaitingTrucks-card set simultaneously.
describe("DispatchKanban — KANBAN-DUP-UNIT-2 loads/awaitingTrucks reconciliation", () => {
  it("a unit that already won a real card via dedupeLoadsByUnit does NOT also get an Awaiting-Assignment ghost card", () => {
    const loads = [
      // Mirrors the live T163 case: a delivered_pending_docs load wins a real card AND the same
      // unit_id is also (incorrectly, pre-fix) present in awaitingTrucks.
      mockLoad({ id: "load-h", load_number: "13533", status: "delivered_pending_docs", assigned_unit_id: "u-163", assigned_unit_number: "T163", created_at: "2026-09-05T12:58:54.000Z" }),
    ];
    const awaitingTrucks: UnitsWithoutLoad[] = [
      { ...truck, id: "u-163", unit_number: "T163" }, // same unit as the real card above
      { ...truck, id: "u-idle-1", unit_number: "T900" }, // genuinely idle unit, unrelated
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} awaitingTrucks={awaitingTrucks} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );

    // Real card renders once, in its own status column.
    expect(screen.getByTestId("kanban-standard-card-13533")).toBeInTheDocument();
    // T163 must NOT also render as an Awaiting-Assignment ghost card.
    expect(screen.queryByTestId("awaiting-truck-card-unit:u-163")).not.toBeInTheDocument();
    // The genuinely idle unit (no real card anywhere) still gets its Awaiting-Assignment card.
    expect(screen.getByTestId("awaiting-truck-card-unit:u-idle-1")).toBeInTheDocument();

    // CORRECTNESS assertion, stated the way the owner named it: zero unit_ids appear in both sets.
    const loadsCardUnitIds = new Set(loads.map((l) => l.assigned_unit_id).filter(Boolean));
    const ghostUnitIds = [...document.querySelectorAll('[data-testid^="awaiting-truck-card-unit:"]')].map((el) =>
      el.getAttribute("data-testid")!.replace("awaiting-truck-card-unit:", "")
    );
    const overlap = ghostUnitIds.filter((id) => loadsCardUnitIds.has(id));
    expect(overlap).toEqual([]);
  });

  it("a unit with an ACTIVE (dispatched/in_transit) load never gets a ghost card either (baseline, unchanged)", () => {
    const loads = [
      mockLoad({ id: "load-i", load_number: "13576", status: "dispatched", assigned_unit_id: "u-171", assigned_unit_number: "T171", created_at: "2026-09-07T18:40:16.000Z" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} awaitingTrucks={[]} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("kanban-standard-card-13576")).toBeInTheDocument();
    expect(screen.queryByTestId("awaiting-truck-card-unit:u-171")).not.toBeInTheDocument();
  });

  it("a unit with an older invoiced/closed load AND a newer active load (a second leg assigned later) still renders exactly one card, the newest", () => {
    // Mirrors the live T171 case: an older invoiced load plus a much newer dispatched load for the
    // same unit — dedupeLoadsByUnit's unit-scoped winner-pick is unconditional (recomputed from
    // whatever `loads` currently holds, not an "initial render only" snapshot), so a second leg
    // assigned to an already-active unit collapses to the single newest non-terminal card, never two.
    const loads = [
      mockLoad({ id: "load-j", load_number: "13541", status: "invoiced", assigned_unit_id: "u-171", assigned_unit_number: "T171", created_at: "2026-09-05T14:46:32.000Z" }),
      mockLoad({ id: "load-k", load_number: "13576", status: "dispatched", assigned_unit_id: "u-171", assigned_unit_number: "T171", created_at: "2026-09-07T18:40:16.000Z" }),
    ];
    renderWithClient(
      <MemoryRouter>
        <DispatchKanban loads={loads} awaitingTrucks={[{ ...truck, id: "u-171", unit_number: "T171" }]} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
      </MemoryRouter>
    );
    // Exactly one real card, the newest (dispatched).
    expect(screen.getByTestId("kanban-standard-card-13576")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-standard-card-13541")).not.toBeInTheDocument();
    // No ghost card either, since the unit already won a real card.
    expect(screen.queryByTestId("awaiting-truck-card-unit:u-171")).not.toBeInTheDocument();
  });
});
