import { describe, expect, it } from "vitest";
import i18n from "./index";

describe("frontend i18n (single source of truth)", () => {
  it("loads es and en driver resources", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("driver.loads_title")).toBeTruthy();
    await i18n.changeLanguage("es");
    expect(i18n.t("driver.loads_title")).toBeTruthy();
  });

  // G8-2: office namespaces (formerly in the separate i18n/translations dir)
  // must resolve from the SAME single init so there is one translation source.
  it("resolves office namespaces from the same init", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("common.app_name")).toBe("IH 35 Dispatch");
    expect(i18n.t("topbar.qbo_sync_error")).toBe("QBO sync error.");
    expect(i18n.t("dispatch.title")).toBe("Dispatch");
    await i18n.changeLanguage("es");
    expect(i18n.t("dispatch.title")).toBe("Despacho");
    expect(i18n.t("common.spanish")).toBe("Espanol");
  });
});
