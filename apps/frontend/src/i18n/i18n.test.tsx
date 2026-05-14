import { describe, expect, it } from "vitest";
import i18n from "./index";

describe("driver i18n", () => {
  it("loads es and en resources", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("driver.loads_title")).toBeTruthy();
    await i18n.changeLanguage("es");
    expect(i18n.t("driver.loads_title")).toBeTruthy();
  });
});
