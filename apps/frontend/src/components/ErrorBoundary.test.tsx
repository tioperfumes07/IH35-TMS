import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("../api/client-errors", () => ({
  postClientError: vi.fn().mockResolvedValue(undefined),
}));

function Boom({ fire }: { fire: boolean }) {
  if (fire) throw new Error("unit-test-boom");
  return <div>ok</div>;
}

describe("ErrorBoundary", () => {
  it("renders fallback UI when a child throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom fire />
      </ErrorBoundary>
    );

    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Report issue" })).toBeTruthy();

    await userEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(/unit-test-boom/)).toBeTruthy();

    spy.mockRestore();
  });
});
