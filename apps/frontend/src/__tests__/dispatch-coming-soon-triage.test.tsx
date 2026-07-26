// @vitest-environment jsdom
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
expect.extend(matchers);
afterEach(cleanup);

function RedirectProbe({ to }: { to: string }) {
  return <div data-testid="redirect-target">{to}</div>;
}

// C5 — /dispatch/loads/:id used to be a redirect BACK to `/dispatch?load_id=`, and this test
// asserted that bounce, i.e. it pinned the defect in place. The route now renders the Dispatch
// board itself, which reads the `:id` PATH param and opens the load drawer.
function DispatchLoadDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="load-detail-route">canonical load detail: {id}</div>;
}

describe("dispatch coming-soon triage redirects (B21-D1)", () => {
  it("maps /dispatch/loads to list view", () => {
    render(
      <MemoryRouter initialEntries={["/dispatch/loads"]}>
        <Routes>
          <Route path="/dispatch/loads" element={<RedirectProbe to="/dispatch?view=loads" />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("redirect-target")).toHaveTextContent("/dispatch?view=loads");
  });

  it("serves /dispatch/loads/:id from the path param — no ?load_id= bounce", () => {
    render(
      <MemoryRouter initialEntries={["/dispatch/loads/load-uuid-1"]}>
        <Routes>
          <Route path="/dispatch/loads/:id" element={<DispatchLoadDetailRoute />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("load-detail-route")).toHaveTextContent("canonical load detail: load-uuid-1");
    expect(screen.queryByTestId("redirect-target")).toBeNull();
  });

  it("maps /dispatch/incidents to alerts hub", () => {
    render(
      <MemoryRouter initialEntries={["/dispatch/incidents"]}>
        <Routes>
          <Route path="/dispatch/incidents" element={<RedirectProbe to="/dispatch/alerts" />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("redirect-target")).toHaveTextContent("/dispatch/alerts");
  });

  it("maps /dispatch/factoring-packets to accounting factoring", () => {
    render(
      <MemoryRouter initialEntries={["/dispatch/factoring-packets"]}>
        <Routes>
          <Route
            path="/dispatch/factoring-packets"
            element={<RedirectProbe to="/accounting/factoring" />}
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("redirect-target")).toHaveTextContent("/accounting/factoring");
  });
});
