/**
 * P0 REGRESSION — a tracker payload missing `hops`/`scenarios` must NOT crash the page hosting it.
 *
 * THE P0: the endpoint legitimately omits those arrays when `audit.scenario_status` has no current
 * rows. Spreading them unguarded threw, escaped to the page error boundary, and took the ENTIRE owner
 * homepage down in production. The regression test for it lived in
 * components/home/ScenarioTrackerPanel.test.tsx.
 *
 * WHY IT IS BEING RE-ESTABLISHED HERE, AND WHOSE FAULT THAT IS — MINE:
 * PR #4475 added `import { Link } from "react-router-dom"` to ScenarioTrackerPanel. That panel's test
 * rendered it with NO router context, so react-router threw
 *   "Cannot destructure property 'basename' of useContext(...) as it is null"
 * and ALL THREE of its tests died — including the P0 case. Verified by diffing across that merge:
 *   git show 2228b99f0^:apps/frontend/src/components/home/ScenarioTrackerPanel.tsx  -> no router refs
 *   git show 2228b99f0:apps/frontend/src/components/home/ScenarioTrackerPanel.tsx   -> Link imported
 * I first reported those failures as "pre-existing, not mine" after stashing my working changes and
 * re-running against origin/main. That method CANNOT detect a cause that is already merged, and mine
 * was. The P0 therefore sat unprotected, by my hand, while I logged it as someone else's breakage.
 * The durable lesson is the method: to attribute a failure, diff the component across the suspect
 * merge commit — do not stash-and-rerun.
 *
 * This asserts the invariant against ScenarioTrackerHome, which consumes the SAME payload shape and
 * is the surface the owner is standardising on. MemoryRouter is mandatory here: this component
 * renders <Link>s, and its absence is precisely what silently killed the previous file.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScenarioTrackerHome } from "./ScenarioTrackerHome";
import * as api from "./api";

/**
 * QueryClientProvider is mandatory for the same reason MemoryRouter is, and it is the second half of
 * the very lesson in this file's header. #4495 relocated this component to Program and gave it
 * useQuery for the auto-refresh; the test was left behind in pages/home/ importing modules that no
 * longer existed there. Without a client the component throws "No QueryClient set" before it can
 * reach the payload — the P0 would go unprotected again, this time silently passing as an import
 * error rather than an assertion.
 *
 * retry:false so a rejected fetch surfaces immediately instead of being retried past the assertion —
 * the second test depends on the rejection actually reaching the component.
 */
function renderTracker() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ScenarioTrackerHome />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ScenarioTrackerHome — P0 payload resilience", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders without throwing when the payload omits hops/scenarios", async () => {
    vi.spyOn(api, "fetchScenarioTracker").mockResolvedValue({
      generated_at_utc: new Date().toISOString(),
      generated_at_ct: "01/01/2026 12:00 AM CT",
      max_age_seconds: 20,
      entity_scope: "ALL",
      source_health: [],
    } as never);

    renderTracker();

    // Degraded to empty, never crashed — the page frame must still be present.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /End-to-End Scenario Tracker/i }),
      ).toBeTruthy(),
    );
  });

  it("renders without throwing when the fetch itself rejects", async () => {
    // The other half of the same class: a failed read must not take the host page down either.
    vi.spyOn(api, "fetchScenarioTracker").mockRejectedValue(new Error("endpoint down"));

    renderTracker();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /End-to-End Scenario Tracker/i }),
      ).toBeTruthy(),
    );
  });

  it("wires Book the load to the Book Load screen", async () => {
    vi.spyOn(api, "fetchScenarioTracker").mockResolvedValue({
      generated_at_utc: new Date().toISOString(),
      generated_at_ct: "01/01/2026 12:00 AM CT",
      max_age_seconds: 20,
      entity_scope: "USMCA",
      hops: [],
      scenarios: [],
      source_health: [],
    } as never);

    renderTracker();

    const link = await waitFor(() => screen.getByTestId("scenario-hop-link-hop.book"));
    expect(link.getAttribute("href")).toBe("/dispatch/book-load");
  });
});
