import { describe, expect, it } from "vitest";
import { DriverDetailPage } from "../DriverDetail";
import { DriverProfilePage } from "./DriverProfilePage";

describe("DriverProfilePage", () => {
  it("is the dispatch-facing export name for the driver detail screen", () => {
    expect(DriverProfilePage).toBe(DriverDetailPage);
  });
});
