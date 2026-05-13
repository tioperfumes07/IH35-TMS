import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListErrorState } from "./ListErrorState";

describe("ListErrorState", () => {
  it("renders title and invokes onRetry", () => {
    const onRetry = vi.fn();
    render(<ListErrorState status={500} message="upstream failure" onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load list")).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500: upstream failure/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Retry$/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("accepts custom title", () => {
    render(<ListErrorState title="Custom" status={0} message="" onRetry={vi.fn()} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
