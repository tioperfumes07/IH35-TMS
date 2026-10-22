import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { UnitsWithoutLoad } from "../../api/dispatch";
import { DispatchKanban, KANBAN_OOS_DROP_ID, resolveKanbanUnitDrop } from "./DispatchKanban";

expect.extend(jestDomMatchers);

vi.mock("../Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

// LEAD 443.251 (owner, 10-22: "the units are still not dragable from one box to the next, i have stated
// this over 30 times"). Before this round a truck card had ONE outcome — drop on a load card — and every
// other drop answered "Drop the truck onto a load card to assign it." with no write and no path. These
// tests pin a real outcome (or a refusal with its reason) for every target.
describe("resolveKanbanUnitDrop — every truck drop has an outcome", () => {
  const awaiting = { origin: "awaiting" as const, unitNumber: "T163" };

  it("truck → load card = assign that load (1a)", () => {
    expect(
      resolveKanbanUnitDrop({ ...awaiting, overId: "droppable:load:L1", overData: { type: "load", loadId: "L1" } }),
    ).toEqual({ kind: "assign", loadId: "L1" });
  });

  it("truck → Assigned lane = Book load for T163 with assigned_not_dispatched preset (1b)", () => {
    expect(resolveKanbanUnitDrop({ ...awaiting, overId: "column:assigned" })).toEqual({
      kind: "book",
      preset: { laneStatus: "assigned_not_dispatched", unitLabel: "T163" },
    });
  });

  it("truck → Dispatched lane = Book load for T163 with dispatched preset (1b)", () => {
    expect(resolveKanbanUnitDrop({ ...awaiting, overId: "column:dispatched" })).toEqual({
      kind: "book",
      preset: { laneStatus: "dispatched", unitLabel: "T163" },
    });
  });

  it("truck → Fleet out of service = mark out of service (1c)", () => {
    expect(resolveKanbanUnitDrop({ ...awaiting, overId: KANBAN_OOS_DROP_ID })).toEqual({ kind: "mark_oos" });
  });

  it("out-of-service truck → Awaiting assignment = return to service (1c)", () => {
    expect(resolveKanbanUnitDrop({ origin: "oos", unitNumber: "T163", overId: "column:awaiting_assignment" })).toEqual({
      kind: "return_to_service",
    });
  });

  it("refusals carry the reason in words — never a silent no-op", () => {
    const refused = [
      resolveKanbanUnitDrop({ ...awaiting, overId: null }),
      resolveKanbanUnitDrop({ ...awaiting, overId: "column:in_transit" }),
      resolveKanbanUnitDrop({ ...awaiting, overId: "column:drafts" }),
      resolveKanbanUnitDrop({ ...awaiting, overId: "column:awaiting_assignment" }),
      resolveKanbanUnitDrop({ ...awaiting, overId: "droppable:unit:u2", overData: { type: "unit-target", unitId: "u2" } }),
      resolveKanbanUnitDrop({ origin: "oos", unitNumber: "T163", overId: "droppable:load:L1", overData: { type: "load", loadId: "L1" } }),
      resolveKanbanUnitDrop({ origin: "oos", unitNumber: "T163", overId: "column:assigned" }),
      resolveKanbanUnitDrop({ origin: "oos", unitNumber: "T163", overId: KANBAN_OOS_DROP_ID }),
    ];
    for (const outcome of refused) {
      expect(outcome.kind).toBe("refuse");
      if (outcome.kind === "refuse") expect(outcome.message.length).toBeGreaterThan(15);
    }
    // Fail-old: the old board's single catch-all sentence must not be the answer to a lane drop any more.
    const lane = resolveKanbanUnitDrop({ ...awaiting, overId: "column:assigned" });
    expect(lane.kind).not.toBe("refuse");
  });
});

describe("Awaiting-assignment truck card — draggable AND a drop target", () => {
  const truck: UnitsWithoutLoad = {
    id: "u-163",
    unit_number: "T163",
    trailer_id: null,
    trailer_number: null,
    driver_id: null,
    driver_name: null,
    last_drop_at: null,
    last_delivered_load_id: null,
    last_delivered_load_number: null,
    hours_since_last_delivery: null,
    location: null,
  };

  it("shows a grab cursor (cursor-pointer used to win the cascade) and is a dnd-kit draggable", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DispatchKanban loads={[]} awaitingTrucks={[truck]} loading={false} onLoadClick={vi.fn()} onStatusDrop={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const card = screen.getByTestId("awaiting-truck-card-unit:u-163");
    expect(card.className).toContain("cursor-grab");
    expect(card.className).not.toContain("cursor-pointer");
    expect(card.getAttribute("aria-roledescription")).toBe("draggable");
    expect(card.getAttribute("aria-disabled")).not.toBe("true");
    expect(card.getAttribute("data-kanban-unit-card")).toBe("draggable");
  });
});
