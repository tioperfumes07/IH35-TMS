import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriverPickerWithCreate } from "./DriverPickerWithCreate";

vi.mock("../parity/EntityPicker", () => ({
  EntityPicker: ({ placeholder }: { placeholder?: string }) => (
    <input role="combobox" aria-label={placeholder ?? "driver"} data-testid="entity-picker-driver-stub" />
  ),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("DriverPickerWithCreate", () => {
  afterEach(cleanup);

  it("delegates to EntityPicker kind=driver", async () => {
    render(
      wrap(
        <DriverPickerWithCreate
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6082"
          value={null}
          onChange={() => {}}
        />
      )
    );
    expect(await screen.findByTestId("entity-picker-driver-stub")).toBeTruthy();
  });
});
