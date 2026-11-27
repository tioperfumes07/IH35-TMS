// Owner 2026-11-26 19:50 CT "how do I get the phone app": Add to Home Screen must open full screen with the IH35 icon.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
describe("phone home-screen app", () => {
  it("index.html links the manifest and the iPhone icon, and opens without the browser bar", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8");
    for (const tag of ['rel="manifest" href="/manifest.webmanifest"', 'rel="apple-touch-icon" href="/logo-192.png"', 'name="apple-mobile-web-app-capable" content="yes"']) expect(html).toContain(tag);
  });
  it("the manifest is standalone and its icons exist", () => {
    const m = JSON.parse(readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8")) as { display: string; start_url: string; icons: Array<{ src: string }> };
    expect([m.display, m.start_url]).toEqual(["standalone", "/"]);
    for (const i of m.icons) expect(readFileSync(resolve(root, "public", i.src.slice(1))).length).toBeGreaterThan(1000);
  });
});
