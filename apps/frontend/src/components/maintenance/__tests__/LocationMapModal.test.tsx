import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationMapModal } from "../LocationMapModal";
import { POS_DICT } from "../../../lib/positions";

function renderWithProviders(ui: JSX.Element) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("LocationMapModal", () => {
  it("opens when open=true and closes via cancel", () => {
    const onClose = vi.fn();
    renderWithProviders(<LocationMapModal open selectedCodes={[]} onClose={onClose} onApply={vi.fn()} />);
    expect(screen.getByText("Location map")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on escape key", () => {
    const onClose = vi.fn();
    renderWithProviders(<LocationMapModal open selectedCodes={[]} onClose={onClose} onApply={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows axle-group zones and map nodes", () => {
    renderWithProviders(<LocationMapModal open selectedCodes={[]} onClose={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getAllByText("Steer Axle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Drive Tandem").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Trailer Tandem").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".axle-group")).toHaveLength(3);
    expect(document.querySelectorAll("[data-loc]").length).toBeGreaterThan(0);
  });

  it("updates info panel on hover", () => {
    renderWithProviders(<LocationMapModal open selectedCodes={[]} onClose={vi.fn()} onApply={vi.fn()} />);
    const target = document.querySelector('[data-loc="STEER-R"]') as Element;
    fireEvent.mouseEnter(target);
    expect(screen.getAllByText("STEER-R").length).toBeGreaterThan(0);
    expect(screen.getByText(POS_DICT["STEER-R"].name)).toBeInTheDocument();
  });

  it("supports multi-select and toggling selected codes", () => {
    renderWithProviders(<LocationMapModal open selectedCodes={[]} onClose={vi.fn()} onApply={vi.fn()} />);
    const steerL = document.querySelector('[data-loc="STEER-L"]') as Element;
    const steerR = document.querySelector('[data-loc="STEER-R"]') as Element;

    fireEvent.click(steerL);
    fireEvent.click(steerR);
    expect(screen.getAllByText("STEER-L").length).toBeGreaterThan(0);
    expect(screen.getAllByText("STEER-R").length).toBeGreaterThan(0);

    fireEvent.click(steerL);
    expect(screen.getByRole("button", { name: "Apply selection (1)" })).toBeInTheDocument();
  });

  it("applies selected codes via onApply callback", () => {
    const onApply = vi.fn();
    renderWithProviders(<LocationMapModal open selectedCodes={[]} onClose={vi.fn()} onApply={onApply} />);
    fireEvent.click(document.querySelector('[data-loc="STEER-L"]') as Element);
    fireEvent.click(document.querySelector('[data-loc="STEER-R"]') as Element);
    fireEvent.click(screen.getByRole("button", { name: /Apply selection/ }));
    expect(onApply).toHaveBeenCalledWith(["STEER-L", "STEER-R"]);
  });

  it("exposes all POS_DICT entries with name/group/side metadata", () => {
    expect(Object.keys(POS_DICT)).toHaveLength(40);
    Object.values(POS_DICT).forEach((meta) => {
      expect(meta.name).toBeTruthy();
      expect(meta.group).toBeTruthy();
      expect(["left", "right", "center"]).toContain(meta.side);
    });
  });

  it("filters map to allowed catalog codes", () => {
    renderWithProviders(<LocationMapModal open selectedCodes={[]} allowedCodes={["STEER-L"]} onClose={vi.fn()} onApply={vi.fn()} />);
    expect(document.querySelectorAll("[data-loc]").length).toBe(1);
    expect(document.querySelector('[data-loc="STEER-L"]')).toBeTruthy();
    expect(document.querySelector('[data-loc="STEER-R"]')).toBeFalsy();
  });

  it("shows metadata from catalog overrides", () => {
    renderWithProviders(
      <LocationMapModal
        open
        selectedCodes={["STEER-L"]}
        allowedCodes={["STEER-L"]}
        positionMetaByCode={{
          "STEER-L": { name: "Catalog Steer Left", group: "Catalog Group", side: "left" },
        }}
        onClose={vi.fn()}
        onApply={vi.fn()}
      />
    );
    expect(screen.getByText("Catalog Steer Left")).toBeInTheDocument();
    expect(screen.getByText("Catalog Group")).toBeInTheDocument();
  });
});
