import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceSettingsPage } from "../MaintenanceSettingsPage";

const getMaintenanceSettings = vi.fn();
const updateMaintenanceSettings = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  getMaintenanceSettings: (...args: unknown[]) => getMaintenanceSettings(...args),
  updateMaintenanceSettings: (...args: unknown[]) => updateMaintenanceSettings(...args),
}));

const COMPANY = "11111111-1111-4111-8111-111111111111";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MaintenanceSettingsPage operatingCompanyId={COMPANY} />
    </QueryClientProvider>
  );
}

describe("MaintenanceSettingsPage", () => {
  beforeEach(() => {
    getMaintenanceSettings.mockReset();
    updateMaintenanceSettings.mockReset();
    getMaintenanceSettings.mockResolvedValue({
      pm_interval_days_default: 30,
      notification_email_enabled: true,
      default_shop_location: "Main yard",
      bay_assignment_policy: "Auto-assign by first available bay",
      pm_schedules: 4,
      maintenance_vendors: 2,
    });
    updateMaintenanceSettings.mockResolvedValue({
      pm_interval_days_default: 45,
      notification_email_enabled: true,
      default_shop_location: "Main yard",
      bay_assignment_policy: "Auto-assign by first available bay",
      pm_schedules: 4,
      maintenance_vendors: 2,
    });
  });

  it("loads settings and saves via PATCH API", async () => {
    renderPage();

    await waitFor(() => expect(getMaintenanceSettings).toHaveBeenCalledWith(COMPANY));
    await waitFor(() => expect(screen.getByTestId("maintenance-settings-pm-interval")).toHaveValue(30));

    fireEvent.change(screen.getByTestId("maintenance-settings-pm-interval"), { target: { value: "45" } });
    fireEvent.click(screen.getByTestId("maintenance-settings-save"));

    await waitFor(() =>
      expect(updateMaintenanceSettings).toHaveBeenCalledWith(COMPANY, {
        pm_interval_days_default: 45,
        default_shop_location: "Main yard",
        bay_assignment_policy: "Auto-assign by first available bay",
        notification_email_enabled: true,
      })
    );
  });
});
