import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../Modal";
import { FaultRuleModal } from "../maintenance/FaultRuleModal";
import { BookLoadModalV4 } from "../../pages/dispatch/components/BookLoadModalV4";
import { ToastProvider } from "../Toast";
import { FineDetailDrawer } from "../../pages/safety/components/FineDetailDrawer";
import { CompanyViolationDetailDrawer } from "../../pages/safety/components/CompanyViolationDetailDrawer";
import { IntegrityAlertDetailDrawer } from "../../pages/safety/components/IntegrityAlertDetailDrawer";
import { AnomalyDetailDrawer } from "../../pages/safety/tabs/AnomalyDetailDrawer";
import { WorkOrderDetailModal } from "../maintenance/WorkOrderDetailModal";
import { CustomerDrillModal } from "../customers/CustomerDrillModal";
import type { Customer } from "../../api/mdata";

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("modal x-close audit", () => {
  it("shared Modal: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(wrap(<Modal open onClose={onClose} title="Test modal">
      body
    </Modal>));
    fireEvent.click(screen.getByRole("button", { name: "Close Test modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("FaultRuleModal: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <FaultRuleModal
          initial={null}
          onClose={onClose}
          onSave={() => undefined}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Create Rule" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("BookLoadModalV4: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <ToastProvider>
          <BookLoadModalV4
            open
            operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
            onClose={onClose}
            onCreated={vi.fn()}
          />
        </ToastProvider>
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Book load" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("SafetyEvents log modal: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <Modal open onClose={onClose} title="Log Safety Event">
          body
        </Modal>
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Log Safety Event" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("FineDetailDrawer: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <FineDetailDrawer
          open
          fine={{ id: "fine-1", status: "open", amount_cents: 5000 }}
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          onClose={onClose}
          onConvertToLiability={vi.fn()}
          onUpdated={vi.fn()}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Fine Detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CompanyViolationDetailDrawer: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <CompanyViolationDetailDrawer
          open
          violation={{ id: "cv-1", status: "open" }}
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          onClose={onClose}
          onUpdated={vi.fn()}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Company Violation Detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("IntegrityAlertDetailDrawer: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <IntegrityAlertDetailDrawer
          open
          alert={{ id: "alert-1", severity: "high" }}
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          onClose={onClose}
          onUpdated={vi.fn()}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Integrity Alert Detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("WorkOrderDetailModal: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <WorkOrderDetailModal
          open
          workOrder={{ display_id: "WO-1", source_type: "IS", status: "open" }}
          onClose={onClose}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Work Order Details · WO-1" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("CustomerDrillModal: clicking X calls onClose", () => {
    const onClose = vi.fn();
    const customer = {
      id: "cust-1",
      operating_company_id: "oc-1",
      name: "Acme Freight",
      customer_code: "ACME",
      status: "active",
      quality_overall_flag: "standard",
      factoring_eligible: false,
      free_time_pickup_minutes: 120,
      free_time_delivery_minutes: 120,
      detention_rate_per_hour: "0",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as Customer;
    render(wrap(<CustomerDrillModal open customer={customer} onClose={onClose} />));
    fireEvent.click(screen.getByRole("button", { name: "Close Customer · Acme Freight" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("WorkOrderDetailModal: single h2 — no doubled header (double-frame regression)", () => {
    render(
      wrap(
        <WorkOrderDetailModal
          open
          workOrder={{ display_id: "WO-REG-1", source_type: "IS", status: "open" }}
          onClose={vi.fn()}
        />
      )
    );
    expect(document.body.querySelectorAll("h2")).toHaveLength(1);
  });

  it("CustomerDrillModal: single h2 — no doubled header (double-frame regression)", () => {
    const customer = {
      id: "cust-reg-1",
      operating_company_id: "oc-1",
      name: "Regression Corp",
      customer_code: "REG",
      status: "active",
      quality_overall_flag: "standard",
      factoring_eligible: false,
      free_time_pickup_minutes: 120,
      free_time_delivery_minutes: 120,
      detention_rate_per_hour: "0",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as Customer;
    render(wrap(<CustomerDrillModal open customer={customer} onClose={vi.fn()} />));
    expect(document.body.querySelectorAll("h2")).toHaveLength(1);
  });

  it("AnomalyDetailDrawer: clicking X calls onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <AnomalyDetailDrawer
          open
          anomalyId="anomaly-1"
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          onClose={onClose}
          onUpdated={vi.fn()}
          initialAnomaly={{
            id: "anomaly-1",
            tenant_id: "tenant-1",
            anomaly_type: "speed",
            severity: "medium",
            subject_type: "driver",
            subject_id: "driver-1",
            detected_at: "2026-06-01T12:00:00.000Z",
            status: "new",
            detector_version: "v1",
            evidence: {},
            status_changed_at: null,
            status_changed_by: null,
            resolution_note: null,
          }}
        />
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Anomaly Detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
