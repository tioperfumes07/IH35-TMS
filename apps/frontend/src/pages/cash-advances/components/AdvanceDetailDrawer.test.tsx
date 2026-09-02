import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdvanceDetailDrawer } from "./AdvanceDetailDrawer";
import { ToastProvider } from "../../../components/Toast";

// GO-21 B8 (owner 2026-09-02) — "receipt/confirmation upload into docs.files, linked both ways."
// Proves the drawer wires DocumentsTab with entityType="cash_advance" and the real advance id,
// reusing the SAME component every other entity already uses (no new upload UI invented).
const documentsTabProps = vi.fn();
vi.mock("../../../components/documents/DocumentsTab", () => ({
  DocumentsTab: (props: Record<string, unknown>) => {
    documentsTabProps(props);
    return <div data-testid="documents-tab-stub" />;
  },
}));

const ADVANCE = {
  id: "ad000000-0000-4000-8000-000000000001",
  display_id: "CA-2026-0007",
  amount: 400,
  purpose: "fuel_deposit",
  disbursement_method: "wire",
  disbursement_status: "approved",
  driver_id: "dr000000-0000-4000-8000-000000000001",
  outstanding_balance: 400,
};

describe("AdvanceDetailDrawer — C6/B8 DocumentsTab wiring", () => {
  it("renders DocumentsTab scoped to this cash advance", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdvanceDetailDrawer
            open
            operatingCompanyId="0c000000-0000-4000-8000-000000000001"
            advance={ADVANCE}
            onClose={() => {}}
            onUpdated={() => {}}
            onMarkDisbursed={() => {}}
          />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId("documents-tab-stub")).toBeInTheDocument();
    expect(documentsTabProps).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "cash_advance",
        entityId: ADVANCE.id,
        operatingCompanyId: "0c000000-0000-4000-8000-000000000001",
      })
    );
  });

  it("renders nothing when closed", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdvanceDetailDrawer
            open={false}
            operatingCompanyId="0c000000-0000-4000-8000-000000000001"
            advance={ADVANCE}
            onClose={() => {}}
            onUpdated={() => {}}
            onMarkDisbursed={() => {}}
          />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText("Cash Advance Detail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("documents-tab-stub")).not.toBeInTheDocument();
  });
});
