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
    expect(pickup).toContain("Arrived");
    expect(pickup).toContain("Upload doc");
    expect(delivery).toContain("Departed");
    expect(delivery).toContain("Open in maps");
  });

  it("DocUploadDrawer opens camera/file capture", () => {
    const drawer = readFileSync(drawerPath, "utf8");
    expect(drawer).toContain('data-testid="dispatch-doc-upload-drawer"');
    expect(drawer).toContain('capture="environment"');
  });

  it("App resolves /dispatch/:load_uuid route", () => {
    const app = readFileSync(appPath, "utf8");
    expect(app).toContain('path="/dispatch/:load_uuid"');
    expect(app).toContain("DispatchViewScreen");
  });
});
