import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pagesRoot = resolve(import.meta.dirname, "..");
const componentsRoot = resolve(import.meta.dirname, "../../components");
const apiRoot = resolve(import.meta.dirname, "../../api");
const appRoot = resolve(import.meta.dirname, "../..");

const homePage = readFileSync(resolve(pagesRoot, "Home.tsx"), "utf8");
const equipmentPage = readFileSync(resolve(pagesRoot, "Equipment.tsx"), "utf8");
const bottomNav = readFileSync(resolve(componentsRoot, "BottomNav.tsx"), "utf8");
const pwaLiveApi = readFileSync(resolve(apiRoot, "pwa-live.ts"), "utf8");
const appRoutes = readFileSync(resolve(appRoot, "App.tsx"), "utf8");
const backendRoutes = readFileSync(resolve(import.meta.dirname, "../../../../backend/src/driver/pwa-live.routes.ts"), "utf8");

describe("Driver PWA live data parity (A24-11)", () => {
  it("Home wires live HOS clocks API", () => {
    expect(homePage).toContain("getPwaHosClocks");
    expect(pwaLiveApi).toContain("/api/v1/driver-pwa/hos-clocks");
  });

  it("Home wires live loads and fuel APIs", () => {
    expect(homePage).toContain("getMyLoadsToday");
    expect(homePage).toContain("getRecentFuelTransactions");
    expect(pwaLiveApi).toContain("/api/v1/driver-pwa/recent-fuel-transactions");
  });

  it("archives Phase 1 placeholder home cards", () => {
    expect(homePage).toContain("ARCHIVE-not-DELETE");
    expect(homePage).not.toContain("Houston, TX → Atlanta, GA");
    expect(homePage).not.toContain("Pilot #492");
  });

  it("Equipment page uses live assignment API", () => {
    expect(equipmentPage).toContain("EquipmentPage");
    expect(equipmentPage).toContain("getMyEquipment");
    expect(pwaLiveApi).toContain("/api/v1/driver-pwa/equipment");
  });

  it("Bottom nav exposes HOS and Documents shortcuts", () => {
    expect(bottomNav).toContain('to: "/hos"');
    expect(bottomNav).toContain('to: "/documents"');
    expect(bottomNav).toContain("grid-cols-7");
  });

  it("App registers /equipment route and backend exposes driver-pwa live endpoints", () => {
    expect(appRoutes).toContain('path="/equipment"');
    expect(appRoutes).toContain("EquipmentPage");
    expect(backendRoutes).toContain("/api/v1/driver-pwa/hos-clocks");
    expect(backendRoutes).toContain("/api/v1/driver-pwa/recent-fuel-transactions");
    expect(backendRoutes).toContain("/api/v1/driver-pwa/equipment");
  });
});
