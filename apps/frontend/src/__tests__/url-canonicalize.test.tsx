import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_STATIC_PATHS,
  resolveUnderscoreRedirectPath,
  underscoreToHyphenPath,
  useUrlCanonicalize,
} from "../routes/url-canonicalize";

function UrlCanonicalizeGate({ children }: { children: React.ReactNode }) {
  useUrlCanonicalize();
  return children;
}

describe("url-canonicalize helpers", () => {
  it("maps underscore catalog paths to hyphen canonical routes", () => {
    expect(underscoreToHyphenPath("/lists/driver/pay_rate_templates")).toBe("/lists/driver/pay-rate-templates");
    expect(CANONICAL_STATIC_PATHS.has("/lists/driver/pay-rate-templates")).toBe(true);
    expect(resolveUnderscoreRedirectPath("/lists/driver/pay_rate_templates")).toBe("/lists/driver/pay-rate-templates");
  });

  it("leaves canonical hyphen paths unchanged", () => {
    expect(resolveUnderscoreRedirectPath("/lists/driver/pay-rate-templates")).toBeNull();
    expect(resolveUnderscoreRedirectPath("/lists/dispatch/load-types")).toBeNull();
  });
});

describe("useUrlCanonicalize", () => {
  it("navigates underscore paths to hyphen equivalents on mount", async () => {
    render(
      <MemoryRouter initialEntries={["/lists/driver/pay_rate_templates"]}>
        <UrlCanonicalizeGate>
          <Routes>
            <Route path="/lists/driver/pay-rate-templates" element={<div>Pay rate templates</div>} />
            <Route path="/lists/:domain/:catalogKey" element={<div>Stub page</div>} />
          </Routes>
        </UrlCanonicalizeGate>
      </MemoryRouter>
    );

    expect(await screen.findByText("Pay rate templates")).toBeInTheDocument();
  });

  it("does not redirect when the hyphen route is unknown", async () => {
    render(
      <MemoryRouter initialEntries={["/lists/driver/unknown_stub"]}>
        <UrlCanonicalizeGate>
          <Routes>
            <Route path="/lists/:domain/:catalogKey" element={<div>Stub page</div>} />
          </Routes>
        </UrlCanonicalizeGate>
      </MemoryRouter>
    );

    expect(await screen.findByText("Stub page")).toBeInTheDocument();
  });
});
