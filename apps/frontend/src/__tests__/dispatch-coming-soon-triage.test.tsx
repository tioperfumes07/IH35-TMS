import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

function RedirectProbe({ to }: { to: string }) {
  return <div data-testid="redirect-target">{to}</div>;
}

function DispatchLoadDetailRedirect({ id }: { id: string }) {
  return <RedirectProbe to={`/dispatch?load_id=${encodeURIComponent(id)}`} />;
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

  it("maps /dispatch/loads/:id to load detail drawer query", () => {
    render(
      <MemoryRouter initialEntries={["/dispatch/loads/load-uuid-1"]}>
        <Routes>
          <Route path="/dispatch/loads/:id" element={<DispatchLoadDetailRedirect id="load-uuid-1" />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("redirect-target")).toHaveTextContent("/dispatch?load_id=load-uuid-1");
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
