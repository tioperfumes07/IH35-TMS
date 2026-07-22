import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriverPickerWithCreate } from "./DriverPickerWithCreate";

vi.mock("../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({
    drivers: [
      {
        id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        first_name: "Ada",
        last_name: "Lovelace",
      },
    ],
  }),
}));

vi.mock("./CreateDriverModal", () => ({
  CreateDriverModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-driver-modal-stub">Create Driver</div> : null,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("DriverPickerWithCreate", () => {
  afterEach(cleanup);

  it("exposes the + Create driver allowAddNew row via Combobox", async () => {
    render(
      wrap(
        <DriverPickerWithCreate
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6082"
          value={null}
          onChange={() => {}}
        />
      )
    );
    const input = await screen.findByRole("combobox");
    input.focus();
    expect(await screen.findByRole("option", { name: /\+ Create driver/i })).toBeTruthy();
  });
});
