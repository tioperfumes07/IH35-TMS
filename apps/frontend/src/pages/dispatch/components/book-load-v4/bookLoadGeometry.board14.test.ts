import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** ROUND 8.20 boards 14–16 — Spec geometry must stay locked in source (FAIL was 1408 / h-40 / 11rem). */
describe("ROUND 8.20 board14/16 Book Load Spec geometry (source lock)", () => {
  it("center dialog maxWidth is 1260 (never w-full alone)", () => {
    const src = readFileSync(join(here, "../BookLoadModalV4.tsx"), "utf8");
    expect(src).toMatch(/maxWidth:\s*1260/);
    expect(src).toMatch(/min\(1260px/);
    expect(src).not.toMatch(/width:\s*"100%",\s*resize:\s*"both"/);
  });

  it("appointment cell is 150×32 and time window is h-8 max-w-[150px]", () => {
    const stops = readFileSync(join(here, "../BookLoadStopsSection.tsx"), "utf8");
    expect(stops).toMatch(/max-w-\[150px\]/);
    expect(stops).toMatch(/h-8 w-full max-w-\[150px\]/);
    const tw = readFileSync(join(here, "TimeWindowDropdown.tsx"), "utf8");
    expect(tw).toMatch(/h-8 w-full max-w-\[150px\]/);
    expect(tw).not.toMatch(/h-7 w-full max-w-\[11rem\]/);
  });

  it("Load # preview bar stays 110×32", () => {
    const bar = readFileSync(join(here, "LiveLoadIdBar.tsx"), "utf8");
    expect(bar).toMatch(/w-\[110px\]/);
    expect(bar).toMatch(/\[\&_input\]:h-8/);
  });
});
