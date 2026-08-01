import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("DispatchView screen (GAP-34)", () => {
  const screenPath = resolve(import.meta.dirname, "../DispatchView.tsx");
  const pickupPath = resolve(import.meta.dirname, "../../components/dispatch/PickupCard.tsx");
  const deliveryPath = resolve(import.meta.dirname, "../../components/dispatch/DeliveryCard.tsx");
  const drawerPath = resolve(import.meta.dirname, "../../components/dispatch/DocUploadDrawer.tsx");
  const appPath = resolve(import.meta.dirname, "../../App.tsx");

  it("DispatchView renders pickup/delivery cards and doc drawer", () => {
    const src = readFileSync(screenPath, "utf8");
    expect(src).toContain("export function DispatchViewScreen");
    expect(src).toContain("PickupCard");
    expect(src).toContain("DeliveryCard");
    expect(src).toContain("DocUploadDrawer");
    expect(src).toContain('data-testid="dispatch-view-screen"');
  });

  it("PickupCard and DeliveryCard expose stop actions", () => {
    const pickup = readFileSync(pickupPath, "utf8");
    const delivery = readFileSync(deliveryPath, "utf8");
    // Reality: labels are i18n keys (not hard-coded English "Upload doc" / "Arrived").
    expect(pickup).toContain("onArrived");
    expect(pickup).toContain("onUploadDoc");
    expect(pickup).toContain('t("dispatch.arrived_btn")');
    expect(pickup).toContain('t("dispatch.upload_doc_btn")');
    expect(pickup).toContain('t("dispatch.open_in_maps")');
    expect(delivery).toContain("onDeparted");
    expect(delivery).toContain('t("dispatch.departed_btn")');
    expect(delivery).toContain('t("dispatch.open_in_maps")');
  });

  it("DocUploadDrawer opens camera/file capture", () => {
    const drawer = readFileSync(drawerPath, "utf8");
    expect(drawer).toContain('data-testid="dispatch-doc-upload-drawer"');
    expect(drawer).toContain('capture="environment"');
  });

  it("App routes StopActionPage for stop actions; DispatchViewScreen is intentionally unrouted", () => {
    const app = readFileSync(appPath, "utf8");
    // Path B (DispatchViewScreen via /dispatch/:load_uuid) is intentionally NOT mounted.
    expect(app).not.toContain('path="/dispatch/:load_uuid"');
    expect(app).not.toContain("DispatchViewScreen");
    // Live path: StopActionPage on /loads/:id/stops/:stopId (App.tsx import + route).
    expect(app).toContain("StopActionPage");
    expect(app).toContain('path="/loads/:id/stops/:stopId"');
  });
});
