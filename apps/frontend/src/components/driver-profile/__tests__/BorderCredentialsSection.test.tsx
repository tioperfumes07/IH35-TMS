// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../../api/mdata";
import { BorderCredentialsSection } from "../BorderCredentialsSection";

vi.mock("../../../api/mdata", () => ({
  updateDriver: vi.fn(),
}));

vi.mock("../../../api/safety", () => ({
  getUserPreferences: vi.fn().mockResolvedValue({}),
}));

function renderSection(props: ComponentProps<typeof BorderCredentialsSection>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BorderCredentialsSection {...props} />
    </QueryClientProvider>,
  );
}

describe("BorderCredentialsSection", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(mdataApi.updateDriver).mockResolvedValue({ id: "d1" } as never);
  });

  const border = {
    fast_card: { number: "FAST-1", expiration: "2027-06-01" },
    sentri: { member: true, expiration: "2027-07-01" },
    twic: { number: "TWIC-9", expiration: "2027-08-01" },
    passport: { number: "P-1", expiration: "2028-01-01" },
    mexican_license: { number: "MX-44", expiration: "2027-09-01" },
    visa_b1: { status: "active" },
  };

  it("renders border credential cards read-only", () => {
    renderSection({ border });
    expect(screen.getByText("FAST-1")).toBeTruthy();
    expect(screen.getByText("TWIC-9")).toBeTruthy();
    expect(screen.getByText("MX-44")).toBeTruthy();
    expect((screen.getByTestId("dp-edit-border-creds") as HTMLButtonElement).disabled).toBe(true);
  });

  it("PATCHes FAST/SENTRI/TWIC/Mexican license via updateDriver on save", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    renderSection({ border, driverId: "d1", onSaved });

    fireEvent.click(screen.getByTestId("dp-edit-border-creds"));
    fireEvent.change(screen.getByTestId("border-creds-fast-number"), { target: { value: "FAST-2" } });
    fireEvent.change(screen.getByTestId("border-creds-twic-number"), { target: { value: "TWIC-10" } });
    fireEvent.click(screen.getByTestId("border-creds-save"));

    await waitFor(() => {
      expect(mdataApi.updateDriver).toHaveBeenCalledWith(
        "d1",
        expect.objectContaining({
          fast_card_number: "FAST-2",
          sentri_member: true,
          twic_card_number: "TWIC-10",
          mexican_license_number: "MX-44",
        }),
      );
    });
    expect(onSaved).toHaveBeenCalled();
  });
});
